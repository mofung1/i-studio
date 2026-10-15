package studio

import (
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"maps"
	"net/http"
	"strings"
	"time"

	"github.com/istudio/server/internal/idgen"
)

var presetFields = stringSet("mode", "taskType", "model", "endpointId", "aspectRatio", "resolution", "count", "style", "referenceStrength", "platform", "outputLanguage", "moduleMode", "moduleCounts", "recreateStrength", "enhancements", "clothingMode", "clothingStyle")

func normalizePreset(config map[string]any) (map[string]any, error) {
	for key := range config {
		if _, ok := presetFields[key]; !ok {
			return nil, fmt.Errorf("预设不支持字段 %s；素材和密钥不能存入预设", key)
		}
	}
	input := maps.Clone(config)
	if input == nil {
		input = map[string]any{}
	}
	if input["count"] == nil {
		input["count"] = float64(1)
	}
	if input["mode"] == "general" {
		input["prompt"] = "预设校验"
		input["referenceAssetIds"] = []any{}
		if intValue(input["count"], 1) > 4 {
			return nil, errors.New("通用生图预设最多 4 张")
		}
	}
	if input["mode"] == "commerce" {
		input["productAssetIds"] = []any{"preset-validation"}
		input["requirements"] = ""
		if input["taskType"] == "viral-recreate" {
			input["referenceAssetIds"] = []any{"preset-validation"}
		}
		if input["taskType"] == "clothing-set" {
			if input["clothingMode"] == "model" {
				input["modelAssetId"] = "preset-validation"
			}
			counts, ok := input["moduleCounts"].(map[string]any)
			if !ok {
				return nil, errors.New("服装预设需要图种与张数")
			}
			shots := []any{}
			for key, value := range counts {
				if !isJSONInteger(value) || value.(float64) < 1 || value.(float64) > 4 {
					return nil, errors.New("服装图种张数无效")
				}
				for i := 0; i < int(value.(float64)); i++ {
					shots = append(shots, map[string]any{"id": fmt.Sprintf("%s-%d", key, i), "moduleKey": key, "label": "预设图种", "description": "按原图生成"})
				}
				if len(shots) > 16 {
					return nil, errors.New("服装预设最多 16 张")
				}
			}
			input["clothingPlan"] = shots
		}
	}
	if err := validateGenerationInput(input); err != nil {
		return nil, fmt.Errorf("预设参数不正确：%w", err)
	}
	normalized := map[string]any{}
	for key, value := range input {
		if _, ok := presetFields[key]; ok {
			normalized[key] = value
		}
	}
	return normalized, nil
}

type personalPrompt struct {
	ID        string         `json:"id"`
	Kind      string         `json:"kind"`
	Title     string         `json:"title"`
	Category  string         `json:"category"`
	Prompt    string         `json:"prompt"`
	Tags      []string       `json:"tags"`
	Favorite  bool           `json:"favorite"`
	Config    map[string]any `json:"config"`
	Source    string         `json:"source"`
	Version   int            `json:"version"`
	CreatedAt time.Time      `json:"createdAt"`
	UpdatedAt time.Time      `json:"updatedAt"`
	DeletedAt *time.Time     `json:"deletedAt,omitempty"`
}

const personalColumns = "id,kind,title,category,prompt,tags,favorite,config,source,version,created_at,updated_at,deleted_at"

func scanPersonalPrompt(row inspirationScanner) (personalPrompt, error) {
	var p personalPrompt
	var tags, config []byte
	err := row.Scan(&p.ID, &p.Kind, &p.Title, &p.Category, &p.Prompt, &tags, &p.Favorite, &config, &p.Source, &p.Version, &p.CreatedAt, &p.UpdatedAt, &p.DeletedAt)
	if err != nil {
		return p, err
	}
	_ = json.Unmarshal(tags, &p.Tags)
	_ = json.Unmarshal(config, &p.Config)
	if p.Tags == nil {
		p.Tags = []string{}
	}
	if p.Config == nil {
		p.Config = map[string]any{}
	}
	return p, nil
}

func (s *Service) personalPrompts(w http.ResponseWriter, r *http.Request) {
	uid, ok := s.requireLibraryUser(w, r)
	if !ok {
		return
	}
	if r.Method == http.MethodPost {
		s.savePersonalPrompt(w, r, uid, "")
		return
	}
	if r.Method != http.MethodGet {
		s.error(w, 405, "METHOD_NOT_ALLOWED", "不支持的请求方法")
		return
	}
	q := libraryQuery{}
	q.add("user_id=$%d", uid)
	if r.URL.Query().Get("trash") == "true" {
		q.conditions = append(q.conditions, "deleted_at IS NOT NULL")
	} else {
		q.conditions = append(q.conditions, "deleted_at IS NULL")
	}
	kind := r.URL.Query().Get("kind")
	if kind == "" {
		kind = "prompt"
	}
	if kind != "prompt" && kind != "preset" {
		s.error(w, 400, "PERSONAL_FILTER_INVALID", "分类类型不正确")
		return
	}
	q.add("kind=$%d", kind)
	for _, filter := range []struct{ key, condition string }{{"mode", "config->>'mode'=$%d"}, {"taskType", "config->>'taskType'=$%d"}} {
		if value := r.URL.Query().Get(filter.key); value != "" {
			q.add(filter.condition, value)
		}
	}
	if value := strings.TrimSpace(r.URL.Query().Get("q")); value != "" {
		q.add("concat_ws(' ',title,prompt,tags::text) ILIKE $%d", "%"+escapeLike(value)+"%")
	}
	if value := r.URL.Query().Get("category"); value != "" {
		q.add("category=$%d", value)
	}
	if r.URL.Query().Get("favorite") == "true" {
		q.conditions = append(q.conditions, "favorite=true")
	}
	var total int
	if err := s.db.QueryRow("SELECT count(*) FROM personal_prompts"+q.where(), q.args...).Scan(&total); err != nil {
		s.error(w, 500, "PERSONAL_STORAGE_ERROR", "读取失败")
		return
	}
	order, err := q.page(r, "created_at", "id")
	if err != nil {
		s.error(w, 400, "CURSOR_INVALID", "分页已失效，请刷新")
		return
	}
	rows, err := s.db.Query("SELECT "+personalColumns+" FROM personal_prompts"+q.where()+order, q.args...)
	if err != nil {
		s.error(w, 500, "PERSONAL_STORAGE_ERROR", "读取失败")
		return
	}
	items := []personalPrompt{}
	for rows.Next() {
		p, e := scanPersonalPrompt(rows)
		if e != nil {
			err = e
			break
		}
		items = append(items, p)
	}
	rowErr := rows.Err()
	rows.Close()
	if err != nil || rowErr != nil {
		s.error(w, 500, "PERSONAL_STORAGE_ERROR", "读取失败")
		return
	}
	limit := clampInt(parseQueryInt(r.URL.Query().Get("limit"), 40), 1, 200)
	next := ""
	if len(items) > limit {
		items = items[:limit]
		last := items[limit-1]
		next = encodePageCursor(last.CreatedAt, last.ID, r.URL.Query().Get("sort") == "oldest")
	}
	categories := []string{}
	categoryRows, err := s.db.Query("SELECT DISTINCT category FROM personal_prompts WHERE user_id=$1 AND kind=$2 AND deleted_at IS NULL AND category<>'' ORDER BY category", uid, kind)
	if err != nil {
		s.error(w, 500, "PERSONAL_STORAGE_ERROR", "分类读取失败")
		return
	}
	for categoryRows.Next() {
		var category string
		if err = categoryRows.Scan(&category); err != nil {
			break
		}
		categories = append(categories, category)
	}
	rowErr = categoryRows.Err()
	categoryRows.Close()
	if err != nil || rowErr != nil {
		s.error(w, 500, "PERSONAL_STORAGE_ERROR", "分类读取失败")
		return
	}
	s.json(w, 200, map[string]any{"items": items, "categories": categories, "total": total, "nextCursor": next})
}

func (s *Service) savePersonalPrompt(w http.ResponseWriter, r *http.Request, uid, id string) {
	var input struct {
		Kind     string         `json:"kind"`
		Title    string         `json:"title"`
		Category string         `json:"category"`
		Prompt   string         `json:"prompt"`
		Tags     []string       `json:"tags"`
		Favorite *bool          `json:"favorite"`
		Config   map[string]any `json:"config"`
		Source   string         `json:"source"`
		Version  int            `json:"version"`
	}
	if !decode(r, &input) {
		s.error(w, 400, "PERSONAL_INPUT_INVALID", "内容格式不正确")
		return
	}
	input.Title = strings.TrimSpace(input.Title)
	input.Prompt = strings.TrimSpace(input.Prompt)
	input.Category = strings.TrimSpace(input.Category)
	input.Source = strings.TrimSpace(input.Source)
	if (input.Kind != "prompt" && input.Kind != "preset") || input.Title == "" || len([]rune(input.Title)) > 160 || len([]rune(input.Category)) > 80 || len([]rune(input.Prompt)) > 10000 || len([]rune(input.Source)) > 500 || (input.Kind == "prompt" && input.Prompt == "") {
		s.error(w, 400, "PERSONAL_INPUT_INVALID", "请填写名称和内容；名称最多 160 字，分类 80 字，提示词 10000 字")
		return
	}
	tags, err := normalizedTags(input.Tags)
	if err != nil {
		s.error(w, 400, "PERSONAL_INPUT_INVALID", err.Error())
		return
	}
	config := map[string]any{}
	if input.Kind == "preset" {
		config, err = normalizePreset(input.Config)
		if err != nil {
			s.error(w, 400, "PERSONAL_INPUT_INVALID", err.Error())
			return
		}
		if config["mode"] == "commerce" {
			maximum := 2000
			if config["taskType"] == "viral-recreate" || config["taskType"] == "product-retouch" {
				maximum = 1000
			}
			if len([]rune(input.Prompt)) > maximum {
				s.error(w, 400, "PERSONAL_INPUT_INVALID", fmt.Sprintf("该电商工具的描述最多 %d 字", maximum))
				return
			}
		}
	}
	tx, err := s.db.Begin()
	if err != nil {
		s.error(w, 500, "PERSONAL_STORAGE_ERROR", "保存失败")
		return
	}
	defer tx.Rollback()
	favorite := false
	version := 1
	status := 201
	if id != "" {
		previous, e := scanPersonalPrompt(tx.QueryRow("SELECT "+personalColumns+" FROM personal_prompts WHERE id=$1 AND user_id=$2 AND deleted_at IS NULL FOR UPDATE", id, uid))
		if e != nil {
			s.error(w, 404, "PERSONAL_NOT_FOUND", "内容不存在或无权访问")
			return
		}
		if input.Version != previous.Version {
			s.error(w, 409, "PERSONAL_VERSION_CONFLICT", "内容已在其他页面更新，请重新读取后保存；当前编辑仍保留")
			return
		}
		if input.Kind != previous.Kind {
			s.error(w, 400, "PERSONAL_INPUT_INVALID", "不能更改内容类型")
			return
		}
		favorite = previous.Favorite
		version = previous.Version + 1
		status = 200
	} else {
		id = idgen.New()
	}
	if input.Favorite != nil {
		favorite = *input.Favorite
	}
	tagsRaw, _ := json.Marshal(tags)
	configRaw, _ := json.Marshal(config)
	var p personalPrompt
	if status == 201 {
		p, err = scanPersonalPrompt(tx.QueryRow("INSERT INTO personal_prompts(id,user_id,kind,title,category,prompt,tags,favorite,config,source) VALUES($1,$2,$3,$4,$5,$6,$7::jsonb,$8,$9::jsonb,$10) RETURNING "+personalColumns, id, uid, input.Kind, input.Title, input.Category, input.Prompt, tagsRaw, favorite, configRaw, input.Source))
	} else {
		p, err = scanPersonalPrompt(tx.QueryRow("UPDATE personal_prompts SET title=$3,category=$4,prompt=$5,tags=$6::jsonb,favorite=$7,config=$8::jsonb,source=$9,version=$10,updated_at=now() WHERE id=$1 AND user_id=$2 RETURNING "+personalColumns, id, uid, input.Title, input.Category, input.Prompt, tagsRaw, favorite, configRaw, input.Source, version))
	}
	if err != nil {
		s.error(w, 500, "PERSONAL_STORAGE_ERROR", "保存失败")
		return
	}
	snapshot, _ := json.Marshal(p)
	if _, err = tx.Exec("INSERT INTO personal_prompt_versions(prompt_id,version,snapshot) VALUES($1,$2,$3::jsonb)", id, p.Version, snapshot); err != nil {
		s.error(w, 500, "PERSONAL_STORAGE_ERROR", "版本保存失败")
		return
	}
	if tx.Commit() != nil {
		s.error(w, 500, "PERSONAL_STORAGE_ERROR", "保存失败")
		return
	}
	s.json(w, status, map[string]any{"item": p})
}

func (s *Service) personalPromptByID(w http.ResponseWriter, r *http.Request) {
	uid, ok := s.requireLibraryUser(w, r)
	if !ok {
		return
	}
	path := strings.TrimPrefix(r.URL.Path, "/v1/personal/prompts/")
	parts := strings.Split(path, "/")
	id := parts[0]
	if id == "" || len(parts) > 2 {
		s.error(w, 404, "PERSONAL_NOT_FOUND", "内容不存在")
		return
	}
	if len(parts) == 2 {
		switch parts[1] {
		case "versions":
			s.personalVersions(w, r, uid, id)
		case "restore":
			if r.Method != http.MethodPost {
				s.error(w, 405, "METHOD_NOT_ALLOWED", "不支持的请求方法")
				return
			}
			result, err := s.db.Exec("UPDATE personal_prompts SET deleted_at=NULL,updated_at=now() WHERE id=$1 AND user_id=$2 AND deleted_at IS NOT NULL", id, uid)
			if err != nil {
				s.error(w, 500, "PERSONAL_STORAGE_ERROR", "恢复失败")
				return
			}
			count, _ := result.RowsAffected()
			if count == 0 {
				s.error(w, 404, "PERSONAL_NOT_FOUND", "内容不存在或已恢复")
				return
			}
			s.json(w, 200, map[string]any{"restored": id})
		default:
			s.error(w, 404, "PERSONAL_NOT_FOUND", "内容不存在")
		}
		return
	}
	switch r.Method {
	case http.MethodGet:
		p, err := scanPersonalPrompt(s.db.QueryRow("SELECT "+personalColumns+" FROM personal_prompts WHERE id=$1 AND user_id=$2 AND deleted_at IS NULL", id, uid))
		if errors.Is(err, sql.ErrNoRows) {
			s.error(w, 404, "PERSONAL_NOT_FOUND", "内容不存在或已移到回收站")
			return
		}
		if err != nil {
			s.error(w, 500, "PERSONAL_STORAGE_ERROR", "读取失败")
			return
		}
		s.json(w, 200, map[string]any{"item": p})
	case http.MethodPut:
		s.savePersonalPrompt(w, r, uid, id)
	case http.MethodPatch:
		var input struct {
			Favorite *bool `json:"favorite"`
		}
		if !decode(r, &input) || input.Favorite == nil {
			s.error(w, 400, "PERSONAL_INPUT_INVALID", "请指定收藏状态")
			return
		}
		result, err := s.db.Exec("UPDATE personal_prompts SET favorite=$3 WHERE id=$1 AND user_id=$2 AND deleted_at IS NULL", id, uid, *input.Favorite)
		if err != nil {
			s.error(w, 500, "PERSONAL_STORAGE_ERROR", "收藏失败")
			return
		}
		count, _ := result.RowsAffected()
		if count == 0 {
			s.error(w, 404, "PERSONAL_NOT_FOUND", "内容不存在")
			return
		}
		s.json(w, 200, map[string]any{"updated": id})
	case http.MethodDelete:
		result, err := s.db.Exec("UPDATE personal_prompts SET deleted_at=now() WHERE id=$1 AND user_id=$2 AND deleted_at IS NULL", id, uid)
		if err != nil {
			s.error(w, 500, "PERSONAL_STORAGE_ERROR", "移入回收站失败")
			return
		}
		count, _ := result.RowsAffected()
		if count == 0 {
			s.error(w, 404, "PERSONAL_NOT_FOUND", "内容不存在")
			return
		}
		s.json(w, 200, map[string]any{"deleted": id})
	default:
		s.error(w, 405, "METHOD_NOT_ALLOWED", "不支持的请求方法")
	}
}

func (s *Service) personalVersions(w http.ResponseWriter, r *http.Request, uid, id string) {
	if r.Method != http.MethodGet {
		s.error(w, 405, "METHOD_NOT_ALLOWED", "不支持的请求方法")
		return
	}
	var exists bool
	if s.db.QueryRow("SELECT EXISTS(SELECT 1 FROM personal_prompts WHERE id=$1 AND user_id=$2)", id, uid).Scan(&exists) != nil || !exists {
		s.error(w, 404, "PERSONAL_NOT_FOUND", "内容不存在")
		return
	}
	before := parseQueryInt(r.URL.Query().Get("before"), 2147483647)
	if before < 1 {
		s.error(w, 400, "VERSION_INVALID", "版本分页不正确")
		return
	}
	rows, err := s.db.Query("SELECT version,snapshot,created_at FROM personal_prompt_versions WHERE prompt_id=$1 AND version<$2 ORDER BY version DESC LIMIT 51", id, before)
	if err != nil {
		s.error(w, 500, "PERSONAL_STORAGE_ERROR", "版本读取失败")
		return
	}
	defer rows.Close()
	type version struct {
		Version   int            `json:"version"`
		Snapshot  personalPrompt `json:"snapshot"`
		CreatedAt time.Time      `json:"createdAt"`
	}
	items := []version{}
	for rows.Next() {
		var item version
		var raw []byte
		if err = rows.Scan(&item.Version, &raw, &item.CreatedAt); err != nil {
			break
		}
		if err = json.Unmarshal(raw, &item.Snapshot); err != nil {
			break
		}
		items = append(items, item)
	}
	if err != nil || rows.Err() != nil {
		s.error(w, 500, "PERSONAL_STORAGE_ERROR", "版本读取失败")
		return
	}
	next := 0
	if len(items) > 50 {
		items = items[:50]
		next = items[49].Version
	}
	s.json(w, 200, map[string]any{"versions": items, "nextBefore": next})
}
