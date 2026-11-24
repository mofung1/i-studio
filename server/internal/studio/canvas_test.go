package studio

import (
	"testing"
)

func TestNormalizeCanvasGraphRejectsVideoEdges(t *testing.T) {
	graph := map[string]any{
		"nodes": []any{
			map[string]any{"id": "t1", "type": "text"},
			map[string]any{"id": "i1", "type": "image"},
			map[string]any{"id": "v1", "type": "video"},
		},
		"edges": []any{
			map[string]any{"id": "e1", "source": "t1", "target": "i1"},
			map[string]any{"id": "e2", "source": "i1", "target": "t1"},   // 图生文，允许
			map[string]any{"id": "e3", "source": "v1", "target": "i1"},   // 视频出边，拒绝
			map[string]any{"id": "e4", "source": "t1", "target": "v1"},   // 视频入边，拒绝
			map[string]any{"id": "e5", "source": "t1", "target": "t1"},   // 自环，拒绝
			map[string]any{"id": "e6", "source": "t1", "target": "gone"}, // 不存在节点，拒绝
		},
	}

	normalized, err := normalizeCanvasGraph(graph)
	if err != nil {
		t.Fatalf("normalizeCanvasGraph returned error: %v", err)
	}
	edges := normalized["edges"].([]any)
	if len(edges) != 2 {
		t.Fatalf("expected 2 valid edges, got %d", len(edges))
	}
	got := map[string]bool{}
	for _, item := range edges {
		edge := item.(map[string]any)
		got[edge["id"].(string)] = true
	}
	if !got["e1"] || !got["e2"] {
		t.Fatalf("expected e1 and e2 to survive, got %v", got)
	}
	if got["e3"] || got["e4"] || got["e5"] || got["e6"] {
		t.Fatalf("invalid edges should be dropped, got %v", got)
	}
}

func TestNormalizeCanvasGraphDefaults(t *testing.T) {
	// 空 / 非法 graph 回退为空图，不报错。
	normalized, err := normalizeCanvasGraph(nil)
	if err != nil {
		t.Fatalf("normalizeCanvasGraph(nil) returned error: %v", err)
	}
	if normalized["nodes"] == nil || normalized["edges"] == nil {
		t.Fatalf("expected default nodes/edges, got %v", normalized)
	}
	if len(normalized["nodes"].([]any)) != 0 || len(normalized["edges"].([]any)) != 0 {
		t.Fatalf("expected empty graph, got %v", normalized)
	}
}
