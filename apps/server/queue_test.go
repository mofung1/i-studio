package main

import (
	"context"
	"errors"
	"strings"
	"testing"
	"time"
)

type pollingTestProvider struct {
	poll func(context.Context) (providerPollResult, error)
}

func (p pollingTestProvider) Submit(context.Context, map[string]any) (providerTask, error) {
	panic("polling tests must never submit a generation")
}
func (p pollingTestProvider) Poll(ctx context.Context, _ string) (providerPollResult, error) {
	return p.poll(ctx)
}

func TestProviderPollingWaitsBeyondOldAttemptLimit(t *testing.T) {
	calls := 0
	client := pollingTestProvider{poll: func(context.Context) (providerPollResult, error) {
		calls++
		if calls == 26 {
			return providerPollResult{Status: "success", Images: []string{"result.png"}}, nil
		}
		return providerPollResult{Status: "processing"}, nil
	}}
	ctx, cancel := context.WithTimeout(context.Background(), time.Second)
	defer cancel()
	images, err := pollProviderImages(ctx, "test", "remote", client, time.Nanosecond)
	if err != nil || len(images) != 1 || calls != 26 {
		t.Fatalf("late successful task was lost: images=%v, calls=%d, err=%v", images, calls, err)
	}
}

func TestProviderPollingDeadlineInterruptsInFlightQuery(t *testing.T) {
	client := pollingTestProvider{poll: func(ctx context.Context) (providerPollResult, error) {
		<-ctx.Done()
		return providerPollResult{}, ctx.Err()
	}}
	ctx, cancel := context.WithTimeout(context.Background(), 25*time.Millisecond)
	defer cancel()
	_, err := pollProviderImages(ctx, "test", "remote", client, time.Nanosecond)
	if !errors.Is(err, context.DeadlineExceeded) {
		t.Fatalf("HTTP poll did not honor the overall deadline: %v", err)
	}
}

func TestProviderPollingRetriesReadErrorsAndKeepsTerminalFailures(t *testing.T) {
	calls := 0
	client := pollingTestProvider{poll: func(context.Context) (providerPollResult, error) {
		calls++
		if calls == 1 {
			return providerPollResult{}, errors.New("temporary read failure")
		}
		return providerPollResult{Status: "failed", Error: "provider rejected input"}, nil
	}}
	ctx, cancel := context.WithTimeout(context.Background(), time.Second)
	defer cancel()
	_, err := pollProviderImages(ctx, "test", "remote", client, time.Nanosecond)
	if calls != 2 || err == nil || !strings.Contains(err.Error(), "provider rejected input") {
		t.Fatalf("unexpected polling outcome: calls=%d, err=%v", calls, err)
	}
}

func TestGenerationPollTimeoutConfiguration(t *testing.T) {
	for _, value := range []string{"", "invalid", "0", "-1"} {
		if generationPollTimeout(value) != 10*time.Minute {
			t.Fatalf("invalid timeout %q must use ten-minute default", value)
		}
	}
	if generationPollTimeout("900") != 15*time.Minute || generationPollTimeout("99999") != time.Hour {
		t.Fatal("configured timeout or maximum was not respected")
	}
}

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
