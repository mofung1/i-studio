package studio

import (
	"time"

	"github.com/istudio/server/internal/idgen"
)

func (s *Service) claimGeneration(id string) bool {
	_, _, claimed := s.claimGenerationRun(id)
	return claimed
}

func (s *Service) claimGenerationRun(id string) (string, bool, bool) {
	if s.db == nil {
		s.mu.Lock()
		defer s.mu.Unlock()
		t, ok := s.tasks[id]
		if !ok || t.Status != "queued" {
			return "", false, false
		}
		t.Status = "processing"
		s.tasks[id] = t
		return "", false, true
	}
	token := idgen.New()
	var previous string
	err := s.db.QueryRow(`WITH pending AS (
 SELECT id,status FROM generation_tasks WHERE id=$1 AND
 (status='queued' OR (status IN ('processing','waiting_provider') AND (lease_until IS NULL OR lease_until<now())))
 FOR UPDATE SKIP LOCKED
) UPDATE generation_tasks t SET status='processing',lease_until=now()+interval '2 minutes',lease_token=$2
 FROM pending p WHERE t.id=p.id RETURNING p.status`, id, token).Scan(&previous)
	if err != nil {
		return "", false, false
	}
	return token, previous != "queued", true
}

func (q *taskQueue) maintainDatabaseQueue() {
	tick := time.NewTicker(15 * time.Second)
	defer tick.Stop()
	for {
		q.recoverDatabaseTasks()
		<-tick.C
	}
}

// PostgreSQL is authoritative. Redis is a wake-up channel; lost enqueue messages
// are recoverable. An interrupted upstream call is never automatically submitted twice.
func (q *taskQueue) recoverDatabaseTasks() {
	rows, err := q.server.db.Query(`SELECT id,status FROM generation_tasks WHERE status='queued' OR (status IN ('processing','waiting_provider') AND (lease_until IS NULL OR lease_until<now())) ORDER BY created_at LIMIT 200`)
	if err != nil {
		return
	}
	items := []string{}
	for rows.Next() {
		var id, status string
		if rows.Scan(&id, &status) == nil {
			items = append(items, id)
		}
	}
	rows.Close()
	for _, id := range items {
		// Recovery uses the same worker capacity and fenced claim as new work.
		// Duplicate wakeups never authorize duplicate upstream submissions.
		q.enqueue(id)
	}
}

func (s *Service) legacySavedGenerationImages(id string) ([]string, error) {
	rows, err := s.db.Query("SELECT '/v1/assets/'||id||'/content' FROM assets WHERE task_id=$1 ORDER BY created_at,id", id)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	paths := []string{}
	for rows.Next() {
		var path string
		if err = rows.Scan(&path); err != nil {
			return nil, err
		}
		paths = append(paths, path)
	}
	return paths, rows.Err()
}
