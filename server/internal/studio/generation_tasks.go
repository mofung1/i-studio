package studio

import (
	"fmt"
	"time"
)

func (s *Service) updateTaskStatus(id, status string) {
	if s.db != nil {
		_, _ = s.db.Exec("UPDATE generation_tasks SET status=$1 WHERE id=$2", status, id)
		return
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	if t, ok := s.tasks[id]; ok {
		t.Status = status
		s.tasks[id] = t
	}
}

func (s *Service) updateTaskResult(id, status string, images []string, modules []string, message string) {
	if s.db != nil {
		// A database outage must never leave a successful task with an unrecorded debit.
		for attempt := 0; attempt < 5; attempt++ {
			if err := s.settleGeneration(id, status, images, modules, message); err == nil {
				return
			} else {
				fmt.Printf("task %s settlement retry: %v\n", id, err)
				time.Sleep(time.Duration(attempt+1) * time.Second)
			}
		}

		return
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	if t, ok := s.tasks[id]; ok {
		t.Status = status
		t.ResultImages = images
		t.ResultModules = modules
		t.ErrorMessage = message
		s.tasks[id] = t
	}
}
