package studio

import (
	"fmt"
	"time"
)

func (s *Service) claimGeneration(id string) bool {
	if s.db == nil {
		s.mu.Lock()
		defer s.mu.Unlock()
		t, ok := s.tasks[id]
		if !ok || t.Status != "queued" {
			return false
		}
		t.Status = "processing"
		s.tasks[id] = t
		return true
	}
	result, err := s.db.Exec("UPDATE generation_tasks SET status='processing',lease_until=now()+interval '2 minutes' WHERE id=$1 AND status='queued'", id)
	if err != nil {
		return false
	}
	n, _ := result.RowsAffected()
	return n == 1
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
	type pending struct{ id, status string }
	items := []pending{}
	for rows.Next() {
		var item pending
		if rows.Scan(&item.id, &item.status) == nil {
			items = append(items, item)
		}
	}
	rows.Close()
	for _, item := range items {
		if item.status == "queued" {
			q.enqueue(item.id)
			continue
		}
		// Conditional lease claim prevents competing recovery workers from racing a live heartbeat.
		result, err := q.server.db.Exec("UPDATE generation_tasks SET lease_until=now()+interval '2 minutes' WHERE id=$1 AND status IN ('processing','waiting_provider') AND (lease_until IS NULL OR lease_until<now())", item.id)
		if err != nil {
			continue
		}
		n, _ := result.RowsAffected()
		if n != 1 {
			continue
		}
		assets, err := q.server.db.Query("SELECT '/v1/assets/'||id||'/content' FROM assets WHERE task_id=$1 ORDER BY created_at,id", item.id)
		paths := []string{}
		if err == nil {
			for assets.Next() {
				var path string
				if assets.Scan(&path) == nil {
					paths = append(paths, path)
				}
			}
			err = assets.Err()
			assets.Close()
		}
		if err != nil {
			fmt.Printf("recovery %s failed: %v\n", item.id, err)
			continue
		}
		q.server.updateTaskResult(item.id, "failed", paths, nil, "服务处理被中断，已按可交付图片结算，其余预留余额退回；可重新发起生成")
		q.acknowledgeTask(item.id)
	}
}
