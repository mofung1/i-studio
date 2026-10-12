package main

import (
	"testing"
	"time"
)

func TestInMemoryQueueWaitsForWork(t *testing.T) {
	q := &taskQueue{fallback: make(chan string, 1)}
	result := make(chan string, 1)
	go func() { id, _ := q.nextTask(); result <- id }()
	select {
	case <-result:
		t.Fatal("empty queue returned immediately instead of waiting")
	case <-time.After(20 * time.Millisecond):
	}
	q.fallback <- "job-1"
	select {
	case id := <-result:
		if id != "job-1" {
			t.Fatalf("received %q", id)
		}
	case <-time.After(time.Second):
		t.Fatal("queued job did not wake worker")
	}
}

func TestFullQueueFailsTaskInsteadOfLeavingItQueued(t *testing.T) {
	s := &server{tasks: map[string]task{"job-2": {ID: "job-2", Status: "queued"}}}
	q := &taskQueue{server: s, fallback: make(chan string, 1)}
	if !q.enqueue("job-1") || q.enqueue("job-2") {
		t.Fatal("queue capacity was not respected")
	}
	task := s.tasks["job-2"]
	if task.Status != "failed" || task.ErrorMessage == "" {
		t.Fatalf("overflow task remains stuck: %#v", task)
	}
}
