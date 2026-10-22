package studio

import (
	"context"
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"fmt"
	"net/http"
	"strings"
	"time"

	"github.com/istudio/server/internal/idgen"
)

// Snapshot reads use one consistent database view so concurrent settlement does
// not look like a wallet mismatch. No monitor query repairs or settles anything.
type operationalMonitoring struct {
	CheckedAt                   time.Time         `json:"checkedAt"`
	QueueWaitSeconds            int               `json:"queueWaitSeconds"`
	LeaseGraceSeconds           int               `json:"leaseGraceSeconds"`
	GenerationQueued            int64             `json:"generationQueued"`
	ReverseQueued               int64             `json:"reverseQueued"`
	GenerationOverdue           int64             `json:"generationOverdue"`
	ReverseOverdue              int64             `json:"reverseOverdue"`
	OldestGenerationWaitSeconds int64             `json:"oldestGenerationWaitSeconds"`
	OldestReverseWaitSeconds    int64             `json:"oldestReverseWaitSeconds"`
	ExpiredGenerationLeases     int64             `json:"expiredGenerationLeases"`
	ExpiredReverseRuns          int64             `json:"expiredReverseRuns"`
	TerminalReservations        int64             `json:"terminalReservations"`
	AgedReservations            int64             `json:"agedReservations"`
	HeldMismatchAccounts        int64             `json:"heldMismatchAccounts"`
	StorageFailures24h          int64             `json:"storageFailures24h"`
	DeletionRetryPending        int64             `json:"deletionRetryPending"`
	DeletionRetryRepeated       int64             `json:"deletionRetryRepeated"`
	StorageMonitoringDropped    int64             `json:"storageMonitoringDropped"`
	Issues                      []monitoringIssue `json:"issues"`
	StorageFailures             []storageFailure  `json:"storageFailures"`
}

type monitoringIssue struct {
	Kind              string `json:"kind"`
	ID                string `json:"id"`
	Status            string `json:"status"`
	AgeSeconds        int64  `json:"ageSeconds"`
	HeldMinor         int64  `json:"heldMinor"`
	ExpectedHeldMinor int64  `json:"expectedHeldMinor"`
}

type storageFailure struct {
	ID              string    `json:"id"`
	Operation       string    `json:"operation"`
	Backend         string    `json:"backend"`
	ObjectReference string    `json:"objectReference"`
	CreatedAt       time.Time `json:"createdAt"`
}

const monitoringReservationsSQL = `WITH pending_reservations AS (
 SELECT c.*,t.status AS task_status,c.unit_price*c.quantity-c.charged-c.refunded AS remaining_minor,
 GREATEST(1800,COALESCE(CASE WHEN (c.provider_snapshot->>'timeout_seconds') ~ '^[0-9]{1,4}$'
 THEN LEAST(600,GREATEST(1,(c.provider_snapshot->>'timeout_seconds')::int)) END,300)*c.quantity+600) AS threshold_seconds
 FROM generation_charges c LEFT JOIN generation_tasks t ON t.id=c.task_id WHERE NOT c.settled
), account_mismatches AS (
 SELECT a.user_id,a.held,COALESCE(sum(r.remaining_minor),0)::bigint AS expected_held
 FROM credit_accounts a LEFT JOIN pending_reservations r ON r.user_id=a.user_id
 GROUP BY a.user_id,a.held HAVING a.held<>COALESCE(sum(r.remaining_minor),0)
) `

func (s *Service) adminMonitoring(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Cache-Control", "no-store")
	if r.Method != http.MethodGet {
		s.error(w, 405, "METHOD_NOT_ALLOWED", "不支持的请求方法")
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()
	snapshot, err := s.monitoringSnapshot(ctx)
	if err != nil {
		s.error(w, 503, "MONITORING_UNAVAILABLE", "运行监控读取失败，请刷新重试；当前无法确认运行状态")
		return
	}
	s.json(w, 200, snapshot)
}

func (s *Service) monitoringSnapshot(ctx context.Context) (operationalMonitoring, error) {
	m := operationalMonitoring{QueueWaitSeconds: 300, LeaseGraceSeconds: 60, Issues: []monitoringIssue{}, StorageFailures: []storageFailure{}, StorageMonitoringDropped: s.storageMonitoringDropped.Load()}
	tx, err := s.db.BeginTx(ctx, &sql.TxOptions{Isolation: sql.LevelRepeatableRead, ReadOnly: true})
	if err != nil {
		return m, err
	}
	defer tx.Rollback()
	err = tx.QueryRowContext(ctx, `SELECT now(),
 count(*) FILTER(WHERE status='queued'),count(*) FILTER(WHERE status='queued' AND created_at<now()-interval '5 minutes'),
 COALESCE(max(EXTRACT(epoch FROM now()-created_at)::bigint) FILTER(WHERE status='queued'),0),
 count(*) FILTER(WHERE status IN ('processing','waiting_provider') AND COALESCE(lease_until,created_at)<now()-interval '1 minute')
 FROM generation_tasks WHERE status IN ('queued','processing','waiting_provider')`).Scan(&m.CheckedAt, &m.GenerationQueued, &m.GenerationOverdue, &m.OldestGenerationWaitSeconds, &m.ExpiredGenerationLeases)
	if err != nil {
		return m, err
	}
	err = tx.QueryRowContext(ctx, `SELECT count(*) FILTER(WHERE status='queued'),
 count(*) FILTER(WHERE status='queued' AND created_at<now()-interval '5 minutes'),
 COALESCE(max(EXTRACT(epoch FROM now()-created_at)::bigint) FILTER(WHERE status='queued'),0),
 count(*) FILTER(WHERE status='processing' AND COALESCE(deadline,updated_at)<now()-interval '1 minute')
 FROM prompt_reverse_tasks WHERE status IN ('queued','processing')`).Scan(&m.ReverseQueued, &m.ReverseOverdue, &m.OldestReverseWaitSeconds, &m.ExpiredReverseRuns)
	if err != nil {
		return m, err
	}
	err = tx.QueryRowContext(ctx, monitoringReservationsSQL+`SELECT
 (SELECT count(*) FROM pending_reservations WHERE remaining_minor>0 AND (task_status IS NULL OR task_status NOT IN ('queued','processing','waiting_provider'))),
 (SELECT count(*) FROM pending_reservations WHERE remaining_minor>0 AND created_at<now()-threshold_seconds*interval '1 second'),
 (SELECT count(*) FROM account_mismatches),
 (SELECT count(*) FROM storage_failures WHERE created_at>=now()-interval '24 hours'),
 (SELECT count(*) FROM storage_deletions WHERE attempts>0),
 (SELECT count(*) FROM storage_deletions WHERE attempts>=3)`).Scan(&m.TerminalReservations, &m.AgedReservations, &m.HeldMismatchAccounts, &m.StorageFailures24h, &m.DeletionRetryPending, &m.DeletionRetryRepeated)
	if err != nil {
		return m, err
	}
	rows, err := tx.QueryContext(ctx, monitoringReservationsSQL+`SELECT kind,id,status,age_seconds,held_minor,expected_held FROM (
 SELECT 'generation_queue' AS kind,id,status,EXTRACT(epoch FROM now()-created_at)::bigint AS age_seconds,0::bigint AS held_minor,0::bigint AS expected_held FROM generation_tasks WHERE status='queued' AND created_at<now()-interval '5 minutes'
 UNION ALL SELECT 'reverse_queue',id,status,EXTRACT(epoch FROM now()-created_at)::bigint,0,0 FROM prompt_reverse_tasks WHERE status='queued' AND created_at<now()-interval '5 minutes'
 UNION ALL SELECT 'generation_lease',id,status,EXTRACT(epoch FROM now()-COALESCE(lease_until,created_at))::bigint,0,0 FROM generation_tasks WHERE status IN ('processing','waiting_provider') AND COALESCE(lease_until,created_at)<now()-interval '1 minute'
 UNION ALL SELECT 'reverse_lease',id,status,EXTRACT(epoch FROM now()-COALESCE(deadline,updated_at))::bigint,0,0 FROM prompt_reverse_tasks WHERE status='processing' AND COALESCE(deadline,updated_at)<now()-interval '1 minute'
 UNION ALL SELECT CASE WHEN task_status IS NULL OR task_status NOT IN ('queued','processing','waiting_provider') THEN 'terminal_reservation' ELSE 'aged_reservation' END,task_id,COALESCE(task_status,'missing'),EXTRACT(epoch FROM now()-created_at)::bigint,remaining_minor,remaining_minor FROM pending_reservations WHERE remaining_minor>0 AND ((task_status IS NULL OR task_status NOT IN ('queued','processing','waiting_provider')) OR created_at<now()-threshold_seconds*interval '1 second')
 UNION ALL SELECT 'held_mismatch',user_id,'account',0,held,expected_held FROM account_mismatches
 ) issues ORDER BY CASE WHEN kind='held_mismatch' THEN 0 WHEN kind IN ('terminal_reservation','aged_reservation') THEN 1 ELSE 2 END,age_seconds DESC,id,kind LIMIT 20`)
	if err != nil {
		return m, err
	}
	for rows.Next() {
		var issue monitoringIssue
		if err = rows.Scan(&issue.Kind, &issue.ID, &issue.Status, &issue.AgeSeconds, &issue.HeldMinor, &issue.ExpectedHeldMinor); err != nil {
			break
		}
		m.Issues = append(m.Issues, issue)
	}
	readErr := rows.Err()
	closeErr := rows.Close()
	if err != nil {
		return m, err
	}
	if readErr != nil {
		return m, readErr
	}
	if closeErr != nil {
		return m, closeErr
	}
	rows, err = tx.QueryContext(ctx, `SELECT id,operation,backend,object_reference,created_at FROM storage_failures WHERE created_at>=now()-interval '24 hours' ORDER BY created_at DESC,id DESC LIMIT 20`)
	if err != nil {
		return m, err
	}
	for rows.Next() {
		var failure storageFailure
		if err = rows.Scan(&failure.ID, &failure.Operation, &failure.Backend, &failure.ObjectReference, &failure.CreatedAt); err != nil {
			break
		}
		m.StorageFailures = append(m.StorageFailures, failure)
	}
	readErr = rows.Err()
	closeErr = rows.Close()
	if err != nil {
		return m, err
	}
	if readErr != nil {
		return m, readErr
	}
	if closeErr != nil {
		return m, closeErr
	}
	return m, tx.Commit()
}

// Raw storage errors may contain signed URLs, credentials or private paths.
// Persist only fixed categories and a one-way object reference. Monitoring is
// best effort and must never replace the original storage result.
func (s *Service) recordStorageFailure(operation, key string) {
	backend := "local"
	if strings.HasPrefix(key, "@storage/") {
		backend = "cloud"
	}
	digest := sha256.Sum256([]byte(key))
	id := idgen.New()
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()
	_, err := s.db.ExecContext(ctx, "INSERT INTO storage_failures(id,operation,backend,object_reference) VALUES($1,$2,$3,$4)", id, operation, backend, hex.EncodeToString(digest[:8]))
	if err != nil {
		s.storageMonitoringDropped.Add(1)
	}
	fmt.Printf("storage failure: event=%s operation=%s backend=%s recorded=%t\n", id, operation, backend, err == nil)
}
