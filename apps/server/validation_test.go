package main

import (
	"context"
	"fmt"
	"strings"
	"testing"
)

type batchProvider struct {
	counts []int
	hints  []string
	failAt int
}

func (p *batchProvider) Submit(_ context.Context, input map[string]any) (providerTask, error) {
	if len(p.counts)+1 == p.failAt {
		return providerTask{}, fmt.Errorf("provider unavailable")
	}
	count := intValue(input["count"], 1)
	p.counts = append(p.counts, count)
	p.hints = append(p.hints, stringValue(input["moduleHint"], ""))
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

func TestGenerateModuleBatches(t *testing.T) {
	tests := []struct {
		name         string
		model        string
		moduleCounts map[string]any
		wantBatches  []int
		wantHints    []string
	}{
		{
			name:         "gpt batches per module",
			model:        "gpt-image-2",
			moduleCounts: map[string]any{"hero": float64(2), "scene": float64(3)},
			wantBatches:  []int{2, 3},
			wantHints:    []string{moduleHints["hero"], moduleHints["scene"]},
		},
		{
			name:         "gemini one image per batch",
			model:        "gemini-3.1-flash-image",
			moduleCounts: map[string]any{"detail": float64(2)},
			wantBatches:  []int{1, 1},
			wantHints:    []string{moduleHints["detail"], moduleHints["detail"]},
		},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			provider := &batchProvider{}
			queue := &taskQueue{server: &server{tasks: map[string]task{}, provider: provider}}
			images, err := queue.generateBatches("test-task", map[string]any{
				"model":        test.model,
				"mode":         "commerce",
				"taskType":     "product-main",
				"moduleMode":   "custom",
				"moduleCounts": test.moduleCounts,
			})
			if err != nil {
				t.Fatalf("unexpected error: %v", err)
			}
			wantTotal := 0
			for _, count := range test.wantBatches {
				wantTotal += count
			}
			if len(images) != wantTotal || len(provider.counts) != len(test.wantBatches) {
				t.Fatalf("images=%d batches=%v want %d images in %v batches", len(images), provider.counts, wantTotal, len(test.wantBatches))
			}
			for index, count := range test.wantBatches {
				if provider.counts[index] != count {
					t.Fatalf("batch %d size %d want %d", index, provider.counts[index], count)
				}
				if provider.hints[index] != test.wantHints[index] {
					t.Fatalf("batch %d hint %q want %q", index, provider.hints[index], test.wantHints[index])
				}
			}
		})
	}

	// 回归：smart 模式即使带 moduleCounts 也走线性分批，不注入 moduleHint
	provider := &batchProvider{}
	queue := &taskQueue{server: &server{tasks: map[string]task{}, provider: provider}}
	images, err := queue.generateBatches("test-task", map[string]any{
		"model":        "gpt-image-2",
		"mode":         "commerce",
		"taskType":     "product-main",
		"moduleMode":   "smart",
		"count":        float64(5),
		"moduleCounts": map[string]any{"hero": float64(2)},
	})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(images) != 5 || len(provider.counts) != 2 || provider.counts[0] != 4 || provider.counts[1] != 1 {
		t.Fatalf("smart mode should batch linearly: images=%d batches=%v", len(images), provider.counts)
	}
	for _, hint := range provider.hints {
		if hint != "" {
			t.Fatalf("smart mode must not inject moduleHint, got %q", hint)
		}
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
			name:  "valid commerce",
			input: map[string]any{"mode": "commerce", "taskType": "product-main", "productAssetIds": []any{"asset-1"}},
		},
		{
			name:    "missing product asset",
			input:   map[string]any{"mode": "commerce", "taskType": "product-main", "productAssetIds": []any{}},
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
			input: map[string]any{"mode": "commerce", "taskType": "product-main", "productAssetIds": []any{"asset-1"},
				"platform": "ebay", "outputLanguage": "none", "moduleMode": "smart", "count": float64(16)},
		},
		{
			name: "custom modules valid",
			input: map[string]any{"mode": "commerce", "taskType": "product-main", "productAssetIds": []any{"asset-1"},
				"moduleMode": "custom", "moduleCounts": map[string]any{"hero": float64(2), "scene": float64(3)}},
		},
		{
			name: "detail page modules valid",
			input: map[string]any{"mode": "commerce", "taskType": "detail-page", "productAssetIds": []any{"asset-1"},
				"moduleMode": "custom", "moduleCounts": map[string]any{"spec": float64(1), "promotion": float64(4)}},
		},
		{
			name: "unsupported module key rejected",
			input: map[string]any{"mode": "commerce", "taskType": "product-main", "productAssetIds": []any{"asset-1"},
				"moduleMode": "custom", "moduleCounts": map[string]any{"not-a-module": float64(1)}},
			wantErr: true,
		},
		{
			name: "module belongs to wrong task type rejected",
			input: map[string]any{"mode": "commerce", "taskType": "product-main", "productAssetIds": []any{"asset-1"},
				"moduleMode": "custom", "moduleCounts": map[string]any{"spec": float64(1)}},
			wantErr: true,
		},
		{
			name: "module count out of range rejected",
			input: map[string]any{"mode": "commerce", "taskType": "product-main", "productAssetIds": []any{"asset-1"},
				"moduleMode": "custom", "moduleCounts": map[string]any{"hero": float64(5)}},
			wantErr: true,
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
