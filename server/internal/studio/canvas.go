package studio

import (
	"database/sql"
	"encoding/json"
	"errors"
	"net/http"
	"strings"
	"time"

	"github.com/istudio/server/internal/idgen"
)

// canvas 存储一张无限画布：视口状态与节点图整体存 jsonb，
// 生成仍复用 generation_tasks，节点引用资产与任务，不在此建独立节点表。
type canvas struct {
	ID        string         `json:"id"`
	Name      string         `json:"name"`
	Viewport  map[string]any `json:"viewport"`
	Graph     map[string]any `json:"graph"`
	CreatedAt time.Time      `json:"createdAt"`
	UpdatedAt time.Time      `json:"updatedAt"`
}

const canvasColumns = "id,name,viewport,graph,created_at,updated_at"

func defaultCanvasViewport() map[string]any {
	return map[string]any{"x": float64(0), "y": float64(0), "zoom": float64(1)}
}

func defaultCanvasGraph() map[string]any {
	return map[string]any{"nodes": []any{}, "edges": []any{}}
}

const canvasNameLimit = 120
const canvasNodeLimit = 500
const canvasEdgeLimit = 500

// normalizeCanvasViewport 校验并规范化视口，非法值回退默认。
func normalizeCanvasViewport(raw any) map[string]any {
	view, ok := raw.(map[string]any)
	if !ok {
		return defaultCanvasViewport()
	}
	x, xok := numeric(view["x"])
	y, yok := numeric(view["y"])
	zoom, zok := numeric(view["zoom"])
	if !xok || !yok || !zok {
		return defaultCanvasViewport()
	}
	zoom = clampFloat(zoom, 0.05, 32)
	return map[string]any{"x": x, "y": y, "zoom": zoom}
}

// normalizeCanvasGraph 校验节点与边，限制规模并丢弃非法条目。
func normalizeCanvasGraph(raw any) (map[string]any, error) {
	graph, ok := raw.(map[string]any)
	if !ok {
		return defaultCanvasGraph(), nil
	}
	nodes, err := normalizeCanvasNodes(graph["nodes"])
	if err != nil {
		return nil, err
	}
	edges, err := normalizeCanvasEdges(graph["edges"], nodeIDs(nodes))
	if err != nil {
		return nil, err
	}
	return map[string]any{"nodes": nodes, "edges": edges}, nil
}

func normalizeCanvasNodes(raw any) ([]any, error) {
	list, ok := raw.([]any)
	if !ok {
		return []any{}, nil
	}
	if len(list) > canvasNodeLimit {
		return nil, &canvasInputError{"画布节点数量超出上限"}
	}
	nodes := make([]any, 0, len(list))
	for _, item := range list {
		node, ok := item.(map[string]any)
		if !ok {
			continue
		}
		id, ok := node["id"].(string)
		if !ok || strings.TrimSpace(id) == "" || len(id) > 64 {
			continue
		}
		nodeType, ok := node["type"].(string)
		if !ok || !canvasNodeTypeAllowed(nodeType) {
			continue
		}
		x, xok := numeric(node["x"])
		y, yok := numeric(node["y"])
		if !xok || !yok {
			x, y = 0, 0
		}
		w, wok := numeric(node["w"])
		if !wok || w <= 0 {
			w = 320
		}
		h, hok := numeric(node["h"])
		if !hok || h <= 0 {
			h = 200
		}
		data, ok := node["data"].(map[string]any)
		if !ok {
			data = map[string]any{}
		}
		result := node["result"]
		if result == nil {
			result = map[string]any{}
		}
		nodes = append(nodes, map[string]any{
			"id": id, "type": nodeType,
			"x": clampFloat(x, -1e6, 1e6), "y": clampFloat(y, -1e6, 1e6),
			"w": clampFloat(w, 120, 1200), "h": clampFloat(h, 80, 1200),
			"data": data, "result": result,
		})
	}
	return nodes, nil
}

func normalizeCanvasEdges(raw any, known map[string]bool) ([]any, error) {
	list, ok := raw.([]any)
	if !ok {
		return []any{}, nil
	}
	if len(list) > canvasEdgeLimit {
		return nil, &canvasInputError{"画布连线数量超出上限"}
	}
	edges := make([]any, 0, len(list))
	for _, item := range list {
		edge, ok := item.(map[string]any)
		if !ok {
			continue
		}
		id, ok := edge["id"].(string)
		if !ok || strings.TrimSpace(id) == "" || len(id) > 64 {
			continue
		}
		source, ok := edge["source"].(string)
		target, ok2 := edge["target"].(string)
		if !ok || !ok2 || !known[source] || !known[target] || source == target {
			continue
		}
		edges = append(edges, map[string]any{"id": id, "source": source, "target": target})
	}
	return edges, nil
}

func nodeIDs(nodes []any) map[string]bool {
	ids := map[string]bool{}
	for _, item := range nodes {
		if node, ok := item.(map[string]any); ok {
			if id, ok := node["id"].(string); ok {
				ids[id] = true
			}
		}
	}
	return ids
}

func canvasNodeTypeAllowed(t string) bool {
	return t == "text" || t == "image" || t == "video"
}

type canvasInputError struct{ message string }

func (e *canvasInputError) Error() string { return e.message }

func numeric(value any) (float64, bool) {
	switch v := value.(type) {
	case float64:
		return v, true
	case float32:
		return float64(v), true
	case int:
		return float64(v), true
	case int64:
		return float64(v), true
	case json.Number:
		f, err := v.Float64()
		return f, err == nil
	default:
		return 0, false
	}
}

func clampFloat(value, min, max float64) float64 {
	if value < min {
		return min
	}
	if value > max {
		return max
	}
	return value
}

func (s *Service) canvases(w http.ResponseWriter, r *http.Request) {
	uid, ok := s.requireLibraryUser(w, r)
	if !ok {
		return
	}
	if r.Method == http.MethodPost {
		s.createCanvas(w, r, uid)
		return
	}
	if r.Method != http.MethodGet {
		s.error(w, 405, "METHOD_NOT_ALLOWED", "不支持的请求方法")
		return
	}
	rows, err := s.db.Query("SELECT id,name,updated_at FROM canvases WHERE user_id=$1 ORDER BY updated_at DESC, id DESC", uid)
	if err != nil {
		s.error(w, 500, "CANVAS_STORAGE_ERROR", "画布列表读取失败")
		return
	}
	defer rows.Close()
	list := []map[string]any{}
	for rows.Next() {
		var id, name string
		var updated time.Time
		if rows.Scan(&id, &name, &updated) == nil {
			list = append(list, map[string]any{"id": id, "name": name, "updatedAt": updated})
		}
	}
	s.json(w, 200, map[string]any{"canvases": list})
}

func (s *Service) createCanvas(w http.ResponseWriter, r *http.Request, uid string) {
	var input struct {
		Name string `json:"name"`
	}
	if !decode(r, &input) {
		s.error(w, 400, "CANVAS_INPUT_INVALID", "画布名称不能为空")
		return
	}
	name := strings.TrimSpace(input.Name)
	if name == "" {
		name = "未命名画布"
	}
	if len([]rune(name)) > canvasNameLimit {
		s.error(w, 400, "CANVAS_INPUT_INVALID", "画布名称最多 120 字")
		return
	}
	id := idgen.New()
	viewport, _ := json.Marshal(defaultCanvasViewport())
	graph, _ := json.Marshal(defaultCanvasGraph())
	if _, err := s.db.Exec("INSERT INTO canvases (id,user_id,name,viewport,graph) VALUES ($1,$2,$3,$4,$5)", id, uid, name, viewport, graph); err != nil {
		s.error(w, 500, "CANVAS_STORAGE_ERROR", "画布创建失败")
		return
	}
	s.json(w, 201, map[string]any{"canvas": map[string]any{
		"id": id, "name": name,
		"viewport": defaultCanvasViewport(), "graph": defaultCanvasGraph(),
		"createdAt": time.Now().UTC(), "updatedAt": time.Now().UTC(),
	}})
}

func (s *Service) canvasByID(w http.ResponseWriter, r *http.Request, id string) {
	uid, ok := s.requireLibraryUser(w, r)
	if !ok {
		return
	}
	if id == "" || strings.Contains(id, "/") {
		s.error(w, 404, "CANVAS_NOT_FOUND", "画布不存在")
		return
	}
	switch r.Method {
	case http.MethodGet:
		s.readCanvas(w, r, uid, id)
	case http.MethodPut:
		s.saveCanvas(w, r, uid, id)
	case http.MethodDelete:
		s.deleteCanvas(w, r, uid, id)
	default:
		s.error(w, 405, "METHOD_NOT_ALLOWED", "不支持的请求方法")
	}
}

func (s *Service) readCanvas(w http.ResponseWriter, r *http.Request, uid, id string) {
	var c canvas
	var viewportRaw, graphRaw []byte
	err := s.db.QueryRow("SELECT "+canvasColumns+" FROM canvases WHERE id=$1 AND user_id=$2", id, uid).
		Scan(&c.ID, &c.Name, &viewportRaw, &graphRaw, &c.CreatedAt, &c.UpdatedAt)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			s.error(w, 404, "CANVAS_NOT_FOUND", "画布不存在")
			return
		}
		s.error(w, 500, "CANVAS_STORAGE_ERROR", "画布读取失败")
		return
	}
	_ = json.Unmarshal(viewportRaw, &c.Viewport)
	_ = json.Unmarshal(graphRaw, &c.Graph)
	if c.Viewport == nil {
		c.Viewport = defaultCanvasViewport()
	}
	if c.Graph == nil {
		c.Graph = defaultCanvasGraph()
	}
	s.json(w, 200, map[string]any{"canvas": c})
}

func (s *Service) saveCanvas(w http.ResponseWriter, r *http.Request, uid, id string) {
	var input struct {
		Name     *string        `json:"name"`
		Viewport map[string]any `json:"viewport"`
		Graph    map[string]any `json:"graph"`
	}
	if !decode(r, &input) {
		s.error(w, 400, "CANVAS_INPUT_INVALID", "画布内容格式不正确")
		return
	}
	if input.Name != nil {
		value := strings.TrimSpace(*input.Name)
		if value == "" {
			s.error(w, 400, "CANVAS_INPUT_INVALID", "画布名称不能为空")
			return
		}
		if len([]rune(value)) > canvasNameLimit {
			s.error(w, 400, "CANVAS_INPUT_INVALID", "画布名称最多 120 字")
			return
		}
		input.Name = &value
	}
	viewport := normalizeCanvasViewport(input.Viewport)
	graph, err := normalizeCanvasGraph(input.Graph)
	if err != nil {
		s.error(w, 400, "CANVAS_INPUT_INVALID", err.Error())
		return
	}
	viewportJSON, _ := json.Marshal(viewport)
	graphJSON, _ := json.Marshal(graph)
	result, err := s.db.Exec(
		"UPDATE canvases SET name=COALESCE($3,name),viewport=$4,graph=$5,updated_at=now() WHERE id=$1 AND user_id=$2",
		id, uid, input.Name, viewportJSON, graphJSON,
	)
	if err != nil {
		s.error(w, 500, "CANVAS_STORAGE_ERROR", "画布保存失败")
		return
	}
	count, _ := result.RowsAffected()
	if count == 0 {
		s.error(w, 404, "CANVAS_NOT_FOUND", "画布不存在")
		return
	}
	s.json(w, 200, map[string]any{"updated": id})
}

func (s *Service) deleteCanvas(w http.ResponseWriter, r *http.Request, uid, id string) {
	result, err := s.db.Exec("DELETE FROM canvases WHERE id=$1 AND user_id=$2", id, uid)
	if err != nil {
		s.error(w, 500, "CANVAS_STORAGE_ERROR", "画布删除失败")
		return
	}
	count, _ := result.RowsAffected()
	if count == 0 {
		s.error(w, 404, "CANVAS_NOT_FOUND", "画布不存在")
		return
	}
	s.json(w, 200, map[string]any{"deleted": id})
}
