package main

import (
	"context"
	"fmt"
	"sort"
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

// sortedModuleKeys 与 generateModuleBatches 的遍历顺序保持一致（模块 key 字典序）。
func sortedModuleCounts(raw map[string]any) []string {
	keys := make([]string, 0, len(raw))
	for key := range raw {
		keys = append(keys, key)
	}
	sort.Strings(keys)
	return keys
}

func TestGenerateBatches(t *testing.T) {
	tests := []struct {
		name      string
		model     string
		requested int
	}{
		{name: "OpenAI four images use four requests", model: "gpt-image-2", requested: 4},
		{name: "OpenAI ten images use ten requests", model: "gpt-image-2", requested: 10},
		{name: "Gemini four images use four requests", model: "gemini-3.1-flash-image", requested: 4},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			provider := &batchProvider{}
			queue := &taskQueue{server: &server{tasks: map[string]task{}, provider: provider}}
			images, modules, err := queue.generateBatches("test-task", map[string]any{"model": test.model, "count": test.requested})
			if err != nil || len(images) != test.requested || len(provider.counts) != test.requested {
				t.Fatalf("images=%d batches=%v err=%v", len(images), provider.counts, err)
			}
			if len(modules) != len(images) {
				t.Fatalf("attribution length %d != images %d", len(modules), len(images))
			}
			for _, module := range modules {
				if module != "" {
					t.Fatalf("linear batches must not attribute modules, got %q", module)
				}
			}
			for _, count := range provider.counts {
				if count != 1 {
					t.Fatalf("unexpected batch size %d", count)
				}
			}
		})
	}

	provider := &batchProvider{failAt: 2}
	queue := &taskQueue{server: &server{tasks: map[string]task{}, provider: provider}}
	images, modules, err := queue.generateBatches("test-task", map[string]any{"model": "gpt-image-2", "count": 8})
	if err == nil || !strings.Contains(err.Error(), "第 2 批") {
		t.Fatalf("expected batch-specific error, got %v", err)
	}
	if len(images) != 1 || len(modules) != 1 {
		t.Fatalf("partial images were lost: images=%v modules=%v", images, modules)
	}
}

func TestTaskInputMemoryStoreReturnsCopy(t *testing.T) {
	original := map[string]any{"mode": "general", "prompt": "photo", "count": float64(4)}
	s := &server{tasks: map[string]task{"test-task": {ID: "test-task", Input: original}}}

	input, ok := s.taskInput("test-task")
	if !ok {
		t.Fatal("taskInput() did not find in-memory task")
	}
	input["count"] = 1
	input["taskId"] = "test-task-1"

	stored := s.tasks["test-task"].Input.(map[string]any)
	if got := intValue(stored["count"], 0); got != 4 {
		t.Fatalf("stored count = %d, want 4", got)
	}
	if _, exists := stored["taskId"]; exists {
		t.Fatalf("temporary taskId leaked into stored input: %#v", stored)
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
			name:         "gpt one image per request",
			model:        "gpt-image-2",
			moduleCounts: map[string]any{"hero": float64(2), "scene": float64(3)},
			wantBatches:  []int{1, 1, 1, 1, 1},
			wantHints: []string{
				moduleHints["hero"], moduleHints["hero"],
				moduleHints["scene"], moduleHints["scene"], moduleHints["scene"],
			},
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
			images, modules, err := queue.generateBatches("test-task", map[string]any{
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
			if len(modules) != wantTotal {
				t.Fatalf("attribution length %d != images %d", len(modules), wantTotal)
			}
			// 模块按 key 排序逐个生成，归属应与各模块张数逐一吻合
			wantAttribution := make([]string, 0, wantTotal)
			for _, module := range sortedModuleCounts(test.moduleCounts) {
				for range intValue(test.moduleCounts[module], 0) {
					wantAttribution = append(wantAttribution, module)
				}
			}
			for index, module := range modules {
				if module != wantAttribution[index] {
					t.Fatalf("image %d attributed to %q want %q", index, module, wantAttribution[index])
				}
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
	images, _, err := queue.generateBatches("test-task", map[string]any{
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
	if len(images) != 5 || len(provider.counts) != 5 {
		t.Fatalf("smart mode should use one request per image: images=%d batches=%v", len(images), provider.counts)
	}
	for _, count := range provider.counts {
		if count != 1 {
			t.Fatalf("smart mode batch size = %d, want 1", count)
		}
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
			name: "custom modules total sixteen valid",
			input: map[string]any{"mode": "commerce", "taskType": "detail-page", "productAssetIds": []any{"asset-1"},
				"moduleMode": "custom", "count": float64(16), "moduleCounts": map[string]any{"hero": float64(4), "selling": float64(4), "scene": float64(4), "detail": float64(4)}},
		},
		{
			name: "custom modules total seventeen rejected",
			input: map[string]any{"mode": "commerce", "taskType": "detail-page", "productAssetIds": []any{"asset-1"},
				"moduleMode": "custom", "count": float64(17), "moduleCounts": map[string]any{"hero": float64(4), "selling": float64(4), "scene": float64(4), "detail": float64(4), "spec": float64(1)}},
			wantErr: true,
		},
		{
			name: "custom modules count mismatch rejected",
			input: map[string]any{"mode": "commerce", "taskType": "product-main", "productAssetIds": []any{"asset-1"},
				"moduleMode": "custom", "count": float64(2), "moduleCounts": map[string]any{"hero": float64(1), "scene": float64(1), "detail": float64(1)}},
			wantErr: true,
		},
		{
			name: "fractional module count rejected",
			input: map[string]any{"mode": "commerce", "taskType": "product-main", "productAssetIds": []any{"asset-1"},
				"moduleMode": "custom", "count": float64(1), "moduleCounts": map[string]any{"hero": 1.5}},
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

func TestGenerationWorkerCount(t *testing.T) {
	for _, test := range []struct {
		raw  string
		want int
	}{
		{raw: "", want: defaultGenerationWorkerCount},
		{raw: "0", want: defaultGenerationWorkerCount},
		{raw: "2", want: 2},
		{raw: "99", want: 16},
	} {
		if got := generationWorkerCount(test.raw); got != test.want {
			t.Fatalf("generationWorkerCount(%q) = %d, want %d", test.raw, got, test.want)
		}
	}
}
