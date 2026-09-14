package main

import (
	"context"
	"fmt"
	"strings"
	"testing"
)

type batchProvider struct {
	counts []int
	failAt int
}

func (p *batchProvider) Submit(_ context.Context, input map[string]any) (providerTask, error) {
	if len(p.counts)+1 == p.failAt {
		return providerTask{}, fmt.Errorf("provider unavailable")
	}
	count := intValue(input["count"], 1)
	p.counts = append(p.counts, count)
	images := make([]string, count)
	for index := range images {
		images[index] = fmt.Sprintf("image-%d-%d", len(p.counts), index)
	}
	return providerTask{Images: images}, nil
}

func (p *batchProvider) Poll(context.Context, string) (providerPollResult, error) {
	return providerPollResult{}, fmt.Errorf("unexpected poll")
}

func TestGenerateBatches(t *testing.T) {
	for _, test := range []struct {
		model         string
		wantBatches   int
		wantBatchSize int
	}{
		{model: "gpt-image-2", wantBatches: 4, wantBatchSize: 4},
		{model: "gemini-3.1-flash-image", wantBatches: 16, wantBatchSize: 1},
	} {
		t.Run(test.model, func(t *testing.T) {
			provider := &batchProvider{}
			queue := &taskQueue{server: &server{tasks: map[string]task{}, provider: provider}}
			images, err := queue.generateBatches("test-task", map[string]any{"model": test.model, "count": 16})
			if err != nil || len(images) != 16 || len(provider.counts) != test.wantBatches {
				t.Fatalf("images=%d batches=%v err=%v", len(images), provider.counts, err)
			}
			for _, count := range provider.counts {
				if count != test.wantBatchSize {
					t.Fatalf("unexpected batch size %d", count)
				}
			}
		})
	}
	provider := &batchProvider{failAt: 2}
	queue := &taskQueue{server: &server{tasks: map[string]task{}, provider: provider}}
	_, err := queue.generateBatches("test-task", map[string]any{"model": "gpt-image-2", "count": 8})
	if err == nil || !strings.Contains(err.Error(), "第 2 批") {
		t.Fatalf("expected batch-specific error, got %v", err)
	}
}

func TestValidateGenerationInput(t *testing.T) {
	tests := []struct {
		name    string
		input   map[string]any
		wantErr bool
	}{
		{
			name:  "general defaults",
			input: map[string]any{"mode": "general", "prompt": "minimal product photo"},
		},
		{
			name: "valid commerce",
			input: map[string]any{
				"mode": "commerce", "taskType": "scene", "productAssetIds": []any{"asset-1"},
				"productName": "Headphones", "productCategory": "Electronics", "sceneDescription": "On a clean desk",
			},
		},
		{
			name:    "missing product asset",
			input:   map[string]any{"mode": "commerce", "taskType": "white-background", "productAssetIds": []any{}, "productName": "Cup", "productCategory": "Home"},
			wantErr: true,
		},
		{
			name:    "fractional count",
			input:   map[string]any{"mode": "general", "prompt": "photo", "count": 1.5},
			wantErr: true,
		},
		{
			name: "six references and sixteen results",
			input: map[string]any{"mode": "general", "prompt": "photo", "count": float64(16),
				"referenceAssetIds": []any{"1", "2", "3", "4", "5", "6"}},
		},
		{
			name: "too many references",
			input: map[string]any{"mode": "general", "prompt": "photo",
				"referenceAssetIds": []any{"1", "2", "3", "4", "5", "6", "7"}}, wantErr: true,
		},
		{
			name: "white background without metadata",
			input: map[string]any{"mode": "commerce", "taskType": "white-background", "productAssetIds": []any{"asset-1"},
				"platform": "ebay", "outputLanguage": "none", "count": float64(16)},
		},
		{
			name:  "too many results",
			input: map[string]any{"mode": "general", "prompt": "photo", "count": float64(17)}, wantErr: true,
		},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			err := validateGenerationInput(test.input)
			if (err != nil) != test.wantErr {
				t.Fatalf("validateGenerationInput() error = %v, wantErr %v", err, test.wantErr)
			}
		})
	}
}

func TestValidUsername(t *testing.T) {
	if !validUsername("demo_user1") {
		t.Fatal("expected username to be valid")
	}
	for _, value := range []string{"ab", "user-name", "用户", "name with spaces"} {
		if validUsername(value) {
			t.Fatalf("expected %q to be invalid", value)
		}
	}
}
