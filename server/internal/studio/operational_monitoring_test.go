package studio

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"strings"
	"testing"

	"github.com/istudio/server/internal/domain"
	objectstore "github.com/istudio/server/internal/storage"
)

func readMonitoring(t *testing.T, s *Service, token string) operationalMonitoring {
	t.Helper()
	w := operationRequest(s, "GET", "/v1/admin/monitoring", "", token, s.router().ServeHTTP)
	if w.Code != 200 {
		t.Fatalf("monitoring: %d %s", w.Code, w.Body.String())
	}
	for _, private := range []string{"private-prompt", "secret-key", "private-bucket", "signed-secret"} {
		if strings.Contains(w.Body.String(), private) {
			t.Fatalf("private data leaked: %s", private)
		}
	}
	var m operationalMonitoring
	if err := json.Unmarshal(w.Body.Bytes(), &m); err != nil {
		t.Fatal(err)
	}
	return m
}

func TestMonitoringClassifiesBacklogReservationsAndStorageWithoutMutation(t *testing.T) {
	s := &Service{db: isolatedTestDatabase(t), secret: []byte("monitoring-fixture")}
	member := s.testToken(domain.User{ID: "member"})
	s.testToken(domain.User{ID: "drift"})
	admin := s.testAdminToken(domain.User{ID: "operator"})
	for _, q := range []string{
		`INSERT INTO generation_tasks(id,user_id,status,input,created_at,lease_until) VALUES
 ('normal','member','queued','{"prompt":"private-prompt"}',now()-interval '1 minute',NULL),
 ('backlog','member','queued','{}',now()-interval '8 minutes',NULL),
 ('lost-worker','member','processing','{}',now()-interval '5 minutes',now()-interval '2 minutes'),
 ('terminal','member','failed','{}',now()-interval '2 minutes',NULL),
 ('aged','member','processing','{}',now()-interval '50 minutes',now()+interval '2 minutes'),
 ('long-budget','member','processing','{}',now()-interval '40 minutes',now()+interval '2 minutes'),
 ('free','member','succeeded','{}',now()-interval '2 hours',NULL),
 ('settled','member','succeeded','{}',now()-interval '2 hours',NULL)`,
		`INSERT INTO generation_charges(task_id,user_id,request_key,input_hash,model_id,model_name,unit_price,quantity,provider_snapshot,prompts_snapshot,created_at,settled) VALUES
 ('normal','member','normal','hash','model','model',100,1,'{"timeout_seconds":300}','[]',now()-interval '1 minute',false),
 ('terminal','member','terminal','hash','model','model',100,1,'{}','[]',now()-interval '2 minutes',false),
 ('missing','member','missing','hash','model','model',100,1,'{}','[]',now()-interval '2 minutes',false),
 ('aged','member','aged','hash','model','model',100,1,'{"timeout_seconds":300}','[]',now()-interval '50 minutes',false),
 ('long-budget','member','long-budget','hash','model','model',100,16,'{"timeout_seconds":600}','[]',now()-interval '40 minutes',false),
 ('free','member','free','hash','model','model',0,1,'{}','[]',now()-interval '2 hours',false),
 ('settled','member','settled','hash','model','model',100,1,'{}','[]',now()-interval '2 hours',true)`,
		`UPDATE credit_accounts SET held=CASE WHEN user_id='member' THEN 2000 ELSE 70 END`,
		`INSERT INTO prompt_reverse_tasks(id,user_id,request_id,status,mode,image_key,image_mime,image_name,image_width,image_height,fingerprint,settings,system_prompt,template_version,created_at,updated_at,expires_at,deadline) VALUES
 ('reverse-backlog','member','reverse-backlog','queued','restore','private-bucket/a','image/png','a',1,1,'f','{}','private-prompt','v',now()-interval '10 minutes',now(),now()+interval '1 day',NULL),
 ('reverse-expired','member','reverse-expired','processing','restore','private-bucket/b','image/png','b',1,1,'f','{}','private-prompt','v',now()-interval '5 minutes',now(),now()+interval '1 day',now()-interval '2 minutes')`,
		`INSERT INTO storage_failures(id,operation,backend,object_reference,created_at) VALUES ('recent-save','save','local','digest',now()),('recent-read','read','cloud','digest',now()),('old','delete','local','digest',now()-interval '25 hours')`,
		`INSERT INTO storage_deletions(storage_key,attempts) VALUES ('private-bucket/one',3),('private-bucket/two',1),('private-bucket/new',0)`,
	} {
		if _, err := s.db.Exec(q); err != nil {
			t.Fatal(err)
		}
	}
	for token, want := range map[string]int{"": 401, member: 403} {
		w := operationRequest(s, "GET", "/v1/admin/monitoring", "", token, s.router().ServeHTTP)
		if w.Code != want {
			t.Fatalf("monitor permission %d want %d", w.Code, want)
		}
	}
	m := readMonitoring(t, s, admin)
	if m.GenerationQueued != 2 || m.GenerationOverdue != 1 || m.ExpiredGenerationLeases != 1 || m.ReverseQueued != 1 || m.ReverseOverdue != 1 || m.ExpiredReverseRuns != 1 {
		t.Fatalf("queue: %+v", m)
	}
	if m.TerminalReservations != 2 || m.AgedReservations != 1 || m.HeldMismatchAccounts != 1 {
		t.Fatalf("reservations: %+v", m)
	}
	if m.StorageFailures24h != 2 || m.DeletionRetryPending != 2 || m.DeletionRetryRepeated != 1 || len(m.StorageFailures) != 2 {
		t.Fatalf("storage: %+v", m)
	}
	kinds := map[string]int{}
	for _, issue := range m.Issues {
		kinds[issue.Kind]++
		if issue.ID == "long-budget" || issue.ID == "free" || issue.ID == "settled" || issue.ID == "normal" {
			t.Fatalf("normal task flagged: %+v", issue)
		}
	}
	if kinds["terminal_reservation"] != 2 || kinds["aged_reservation"] != 1 || kinds["held_mismatch"] != 1 || len(m.Issues) != 8 {
		t.Fatalf("issues: %+v", m.Issues)
	}
	var held, pending int
	if err := s.db.QueryRow("SELECT held,(SELECT count(*) FROM generation_charges WHERE NOT settled) FROM credit_accounts WHERE user_id='member'").Scan(&held, &pending); err != nil || held != 2000 || pending != 6 {
		t.Fatal("monitor mutated reservation state", held, pending, err)
	}
	if m.CheckedAt.IsZero() || m.OldestGenerationWaitSeconds < 480 || m.OldestReverseWaitSeconds < 600 {
		t.Fatal("missing snapshot/wait age", m)
	}
}

func TestMonitoringHealthyEmptyAndReadFailureAreDistinct(t *testing.T) {
	s := &Service{db: isolatedTestDatabase(t), secret: []byte("healthy-monitoring")}
	admin := s.testAdminToken(domain.User{ID: "operator"})
	m := readMonitoring(t, s, admin)
	if m.Issues == nil || m.StorageFailures == nil || len(m.Issues) != 0 || m.HeldMismatchAccounts != 0 || m.StorageFailures24h != 0 {
		t.Fatal(m)
	}
	if _, err := s.db.Exec("DROP TABLE storage_failures"); err != nil {
		t.Fatal(err)
	}
	w := operationRequest(s, "GET", "/v1/admin/monitoring", "", admin, s.router().ServeHTTP)
	if w.Code != http.StatusServiceUnavailable || !strings.Contains(w.Body.String(), "当前无法确认运行状态") || strings.Contains(w.Body.String(), "does not exist") {
		t.Fatal(w.Code, w.Body.String())
	}
	s.recordStorageFailure("save", "signed-secret/private.png")
	if s.storageMonitoringDropped.Load() != 1 {
		t.Fatal("lost monitoring event was hidden")
	}
}

type monitoringFailingStore struct{ objectstore.Store }

func (s monitoringFailingStore) Save(string, io.Reader) error {
	return errors.New("secret-key https://private-bucket/image?signed-secret")
}

func TestStorageFailuresAreRecordedFromActualOperationsAndRedacted(t *testing.T) {
	s := &Service{db: isolatedTestDatabase(t), secret: []byte("storage-monitoring")}
	admin := s.testAdminToken(domain.User{ID: "operator"})
	s.storage = objectstore.NewRouter(monitoringFailingStore{objectstore.NewLocal(t.TempDir())}, s, s.recordStorageFailure)
	for _, key := range []string{"private-bucket/private-prompt.png", "@storage/missing/private-prompt.png"} {
		if err := s.storage.Save(key, strings.NewReader("fake")); err == nil {
			t.Fatal("storage failure was swallowed")
		}
	}
	m := readMonitoring(t, s, admin)
	if m.StorageFailures24h != 2 || len(m.StorageFailures) != 2 || m.StorageMonitoringDropped != 0 {
		t.Fatal(m)
	}
	backends := map[string]bool{}
	for _, failure := range m.StorageFailures {
		backends[failure.Backend] = true
		if failure.Operation != "save" || len(failure.ObjectReference) != 16 {
			t.Fatal(failure)
		}
	}
	if !backends["local"] || !backends["cloud"] {
		t.Fatal(backends)
	}
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	if _, err := s.monitoringSnapshot(ctx); err == nil {
		t.Fatal("cancelled monitor query did not stop")
	}
}
