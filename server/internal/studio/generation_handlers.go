package studio

import (
	"database/sql"
	"maps"
	"net/http"
	"sort"
	"strings"

	"github.com/istudio/server/internal/domain"
	"github.com/istudio/server/internal/repository"
)

func (s *Service) capabilities(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		s.error(w, http.StatusMethodNotAllowed, "METHOD_NOT_ALLOWED", "不支持的请求方法")
		return
	}
	models, err := s.publicModels(true)
	if err != nil {
		s.error(w, 503, "MODELS_UNAVAILABLE", "模型暂时不可用")
		return
	}
	images := []map[string]any{}
	for _, m := range models {
		images = append(images, map[string]any{"id": m.ID, "name": m.Name, "model": m.Name, "isDefault": m.IsDefault, "priceMinor": m.PriceMinor})
	}
	config, err := s.operationSettings()
	if err != nil {
		s.error(w, 503, "SETTINGS_UNAVAILABLE", "网站配置暂时不可用")
		return
	}
	payload := map[string]any{"aiEnabled": len(images) > 0, "imageEndpoints": images, "creditName": config.CreditName, "creditScale": creditScale, "promptEnhanceEnabled": s.ai != nil && s.ai.hasAny("prompt")}
	if s.ai != nil {
		if endpoint, err := s.ai.resolve("prompt", "", ""); err == nil {
			payload["promptVision"] = endpoint.Capabilities["vision"]
		}
	}
	s.json(w, 200, payload)
}

func (s *Service) validate(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		s.error(w, http.StatusMethodNotAllowed, "METHOD_NOT_ALLOWED", "不支持的请求方法")
		return
	}
	var input map[string]any
	if !decode(r, &input) || validateGenerationInput(input) != nil {
		s.error(w, 400, "GENERATION_INPUT_INVALID", "生成参数不完整或格式不正确")
		return
	}
	s.json(w, 200, map[string]any{"valid": true, "data": input})
}

func (s *Service) tasksHandler(w http.ResponseWriter, r *http.Request) {
	userID, ok := s.authenticatedUserID(r)
	if !ok {
		s.error(w, http.StatusUnauthorized, "AUTH_REQUIRED", "请先登录")
		return
	}
	if r.Method == http.MethodGet && s.db != nil {
		s.listGenerationTasks(w, r, userID)
		return
	}
	if r.Method == http.MethodGet {
		projectID := strings.TrimSpace(r.URL.Query().Get("projectId"))
		mode := strings.TrimSpace(r.URL.Query().Get("mode"))
		taskType := strings.TrimSpace(r.URL.Query().Get("taskType"))
		limit := clampInt(parseQueryInt(r.URL.Query().Get("limit"), 50), 1, 200)
		s.mu.RLock()
		list := make([]domain.GenerationTask, 0, len(s.tasks))
		for _, item := range s.tasks {
			if item.UserID != userID {
				continue
			}
			if projectID != "" && item.ProjectID != projectID {
				continue
			}
			if mode != "" && domain.TaskInputField(item.Input, "mode") != mode {
				continue
			}
			if taskType != "" && domain.TaskInputField(item.Input, "taskType") != taskType {
				continue
			}
			item.ErrorMessage = publicGenerationError(item.ErrorMessage)
			list = append(list, item)
		}
		s.mu.RUnlock()
		sort.SliceStable(list, func(i, j int) bool { return list[i].CreatedAt > list[j].CreatedAt })
		if len(list) > limit {
			list = list[:limit]
		}
		s.json(w, 200, map[string]any{"tasks": list})
		return
	}
	if r.Method != http.MethodPost {
		s.error(w, 405, "METHOD_NOT_ALLOWED", "不支持的请求方法")
		return
	}
	if s.provider == nil {
		s.error(w, http.StatusServiceUnavailable, "AI_PROVIDER_UNAVAILABLE", "AI 服务尚未配置，请联系管理员")
		return
	}
	var input map[string]any
	if !decode(r, &input) || validateGenerationInput(input) != nil {
		s.error(w, 400, "GENERATION_INPUT_INVALID", "生成参数不完整或格式不正确")
		return
	}
	s.createChargedTask(w, r, userID, input)
}

func (s *Service) taskByID(w http.ResponseWriter, r *http.Request) {
	path := strings.TrimPrefix(r.URL.Path, "/v1/generation/tasks/")
	if strings.HasSuffix(path, "/download") {
		s.downloadTaskImages(w, r, strings.TrimSuffix(path, "/download"))
		return
	}
	if strings.HasSuffix(path, "/retry") {
		s.retryTask(w, r, strings.TrimSuffix(path, "/retry"))
		return
	}
	if r.Method == http.MethodDelete {
		s.deleteTask(w, r, path)
		return
	}
	if r.Method != http.MethodGet {
		s.error(w, http.StatusMethodNotAllowed, "METHOD_NOT_ALLOWED", "不支持的请求方法")
		return
	}
	id := path
	userID, ok := s.authenticatedUserID(r)
	if !ok {
		s.error(w, http.StatusUnauthorized, "AUTH_REQUIRED", "请先登录")
		return
	}
	if s.db != nil {
		t, ok, err := repository.TaskByID(s.db, id, userID)
		if err != nil {
			s.error(w, 500, "TASK_STORAGE_ERROR", "任务查询失败")
			return
		}
		if !ok {
			s.error(w, 404, "GENERATION_TASK_NOT_FOUND", "生成任务不存在")
			return
		}
		s.attachBilling(&t)
		s.json(w, 200, map[string]any{"task": t, "aiEnabled": s.provider != nil})
		return
	}
	s.mu.RLock()
	t, ok := s.tasks[id]
	s.mu.RUnlock()
	if !ok || t.UserID != userID {
		s.error(w, 404, "GENERATION_TASK_NOT_FOUND", "生成任务不存在")
		return
	}
	s.attachBilling(&t)
	s.json(w, 200, map[string]any{"task": t, "aiEnabled": s.provider != nil})
}

// deleteTask 删除一条生成任务记录（含它生成的结果图片），历史记录与资产库共用。
func (s *Service) deleteTask(w http.ResponseWriter, r *http.Request, id string) {
	userID, ok := s.authenticatedUserID(r)
	if !ok {
		s.error(w, http.StatusUnauthorized, "AUTH_REQUIRED", "请先登录")
		return
	}
	if id == "" {
		s.error(w, http.StatusBadRequest, "GENERATION_TASK_NOT_FOUND", "生成任务不存在")
		return
	}
	if s.db != nil {
		tx, err := s.db.Begin()
		if err != nil {
			s.error(w, 500, "TASK_STORAGE_ERROR", "删除失败，请稍后重试")
			return
		}
		defer tx.Rollback()
		keys, err := repository.DeleteTask(tx, userID, id)
		if err == sql.ErrNoRows {
			s.error(w, http.StatusNotFound, "GENERATION_TASK_NOT_FOUND", "生成任务不存在")
			return
		}
		if err != nil {
			if err == repository.ErrTaskActive {
				s.error(w, http.StatusConflict, "GENERATION_TASK_ACTIVE", "任务正在生成，请完成后再删除")
				return
			}
			s.error(w, http.StatusInternalServerError, "TASK_STORAGE_ERROR", "删除失败，请稍后重试")
			return
		}
		if err := tx.Commit(); err != nil {
			s.error(w, 500, "TASK_STORAGE_ERROR", "删除失败，请稍后重试")
			return
		}
		for _, key := range keys {
			if s.storage != nil {
				_ = s.deleteAssetFiles(key)
			}
		}
		s.json(w, http.StatusOK, map[string]any{"deleted": id, "assets": len(keys)})
		return
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	t, ok := s.tasks[id]
	if !ok || t.UserID != userID {
		s.error(w, http.StatusNotFound, "GENERATION_TASK_NOT_FOUND", "生成任务不存在")
		return
	}
	if domain.IsActiveTask(t.Status) {
		s.error(w, http.StatusConflict, "GENERATION_TASK_ACTIVE", "任务正在生成，请完成后再删除")
		return
	}
	delete(s.tasks, id)
	s.json(w, http.StatusOK, map[string]any{"deleted": id})
}

func (s *Service) retryTask(w http.ResponseWriter, r *http.Request, id string) {
	if r.Method != http.MethodPost {
		s.error(w, http.StatusMethodNotAllowed, "METHOD_NOT_ALLOWED", "不支持的请求方法")
		return
	}
	userID, ok := s.authenticatedUserID(r)
	if !ok {
		s.error(w, http.StatusUnauthorized, "AUTH_REQUIRED", "请先登录")
		return
	}
	if s.provider == nil {
		s.error(w, http.StatusServiceUnavailable, "AI_PROVIDER_UNAVAILABLE", "AI 服务尚未配置，请联系管理员")
		return
	}
	var original domain.GenerationTask
	var exists bool
	var err error
	if s.db != nil {
		original, exists, err = repository.TaskByID(s.db, id, userID)
	} else {
		s.mu.RLock()
		original, exists = s.tasks[id]
		s.mu.RUnlock()
		exists = exists && original.UserID == userID
	}
	if err != nil {
		s.error(w, http.StatusInternalServerError, "TASK_STORAGE_ERROR", "任务查询失败")
		return
	}
	if !exists {
		s.error(w, http.StatusNotFound, "GENERATION_TASK_NOT_FOUND", "生成任务不存在")
		return
	}
	input, ok := original.Input.(map[string]any)
	input = maps.Clone(input)
	if !ok || validateGenerationInput(input) != nil {
		s.error(w, http.StatusBadRequest, "GENERATION_INPUT_INVALID", "原任务参数无法重试")
		return
	}
	s.createChargedTask(w, r, userID, input)
}
