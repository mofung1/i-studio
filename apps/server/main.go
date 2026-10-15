package main

import (
	"bufio"
	"bytes"
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha256"
	"database/sql"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"flag"
	"fmt"
	"image"
	_ "image/jpeg"
	_ "image/png"
	"io"
	"maps"
	mimepkg "mime"
	"net/http"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"sync"
	"time"

	"golang.org/x/crypto/argon2"
)

type user struct {
	ID, Username, PasswordHash, Role, Status string
	AuthVersion                              int64
}
type task struct {
	Billing       *generationBilling `json:"billing,omitempty"`
	ID            string             `json:"id"`
	UserID        string             `json:"-"`
	ProjectID     string             `json:"projectId,omitempty"`
	ProjectName   string             `json:"projectName,omitempty"`
	Status        string             `json:"status"`
	CreatedAt     string             `json:"createdAt"`
	Input         any                `json:"input"`
	ResultImages  []string           `json:"resultImages,omitempty"`
	ResultModules []string           `json:"resultModules,omitempty"`
	ErrorMessage  string             `json:"errorMessage,omitempty"`
}

// taskInputField 读取任务输入里的字符串字段；用于内存模式下按模式 / 任务类型过滤。
func taskInputField(input any, key string) string {
	fields, ok := input.(map[string]any)
	if !ok {
		return ""
	}
	value, ok := fields[key].(string)
	if !ok {
		return ""
	}
	return value
}

type assetRecord struct {
	ID, UserID, ProjectID, Filename, StorageKey, Mime, Hash string
	SizeBytes                                               int64
	Width, Height                                           int
}
type server struct {
	mu             sync.RWMutex
	siteMu         sync.Mutex
	users          map[string]user
	tasks          map[string]task
	secret         []byte
	db             *sql.DB
	storageRoot    string
	storage        objectStorage
	queue          *taskQueue
	provider       imageProvider
	promptClient   promptCompleter
	ai             *aiConfigStore
	reverseCancels sync.Map
}

func main() {
	loadDotEnv()
	if len(os.Args) > 1 && os.Args[1] == "seed-inspiration" {
		os.Exit(runInspirationSeed())
	}
	if len(os.Args) > 1 && os.Args[1] == "admin" {
		os.Exit(runAdminCommand(os.Args[2:]))
	}
	db, dbErr := openDatabase()
	if dbErr != nil || db == nil {
		panic("运营模式需要可用的 DATABASE_URL，禁止回退到内存账户")
	}
	if err := migrateDatabase(db); err != nil {
		panic(fmt.Errorf("database migration failed: %w", err))
	}
	root := env("STORAGE_ROOT", "storage/uploads")
	secret, err := loadAuthSecret(root)
	if err != nil {
		panic(fmt.Errorf("auth signing key initialization failed: %w", err))
	}
	s := &server{users: map[string]user{}, tasks: map[string]task{}, secret: secret, db: db, storageRoot: root, storage: newLocalStorage(root)}
	s.storage = &profileStorage{server: s, local: s.storage}
	if err := s.syncEnvironmentAdmin(); err != nil {
		panic(fmt.Errorf("administrator configuration failed: %w", err))
	}
	s.ai = newAIConfigStore(s)
	if err := s.ai.migrateLegacy(); err != nil {
		panic(fmt.Errorf("AI configuration initialization failed: %w", err))
	}
	if err := s.initializePublicModels(); err != nil {
		panic(fmt.Errorf("model migration failed: %w", err))
	}
	if err := cleanupLegacyGeneratedAssets(s.db, s.storage); err != nil {
		fmt.Printf("legacy generated asset cleanup skipped: %v\n", err)
	}
	s.provider = &dynamicImageProvider{server: s}
	s.promptClient = &dynamicPromptClient{server: s}
	s.queue = newTaskQueue(s)
	s.startPromptReverseWorkers()
	s.startStorageMaintenance()
	mux := http.NewServeMux()
	mux.HandleFunc("/v1/health", s.health)
	mux.HandleFunc("/v1/admin/", s.adminHandler)
	mux.HandleFunc("/v1/operation-settings", s.publicOperationSettings)
	mux.HandleFunc("/v1/account", s.accountHandler)
	mux.HandleFunc("/v1/generation/quote", s.generationQuote)
	mux.HandleFunc("/v1/auth/register", s.register)
	mux.HandleFunc("/v1/auth/login", s.login)
	mux.HandleFunc("/v1/auth/me", s.me)
	mux.HandleFunc("/v1/generation/capabilities", s.capabilities)
	mux.HandleFunc("/v1/generation/validate", s.validate)
	mux.HandleFunc("/v1/generation/tasks", s.tasksHandler)
	mux.HandleFunc("/v1/generation/tasks/", s.taskByID)
	mux.HandleFunc("/v1/prompts/enhance", s.promptEnhance)
	mux.HandleFunc("/v1/prompts/format", s.formatPrompt)
	mux.HandleFunc("/v1/prompts/reverse", s.promptReverseTasks)
	mux.HandleFunc("/v1/prompts/reverse/", s.promptReverseByID)
	mux.HandleFunc("/v1/prompt-reverse-settings", s.promptReverseSettingsHandler)
	mux.HandleFunc("/v1/clothing/plan", s.clothingPlanHandler)
	mux.HandleFunc("/v1/clothing/manual-plan", s.manualClothingPlan)
	mux.HandleFunc("/v1/ai-endpoints", s.aiEndpoints)
	mux.HandleFunc("/v1/ai-endpoints/", s.aiEndpointByID)
	mux.HandleFunc("/v1/prompt-templates", s.promptTemplates)
	mux.HandleFunc("/v1/site-settings", s.siteSettingsHandler)
	mux.HandleFunc("/v1/site-settings/logo/", s.siteLogo)
	mux.HandleFunc("/v1/projects", s.projects)
	mux.HandleFunc("/v1/projects/", s.projectByID)
	mux.HandleFunc("/v1/library/assets", s.libraryAssets)
	mux.HandleFunc("/v1/library/download", s.libraryDownload)
	mux.HandleFunc("/v1/personal/prompts", s.personalPrompts)
	mux.HandleFunc("/v1/personal/prompts/", s.personalPromptByID)
	mux.HandleFunc("/v1/assets", s.assets)
	mux.HandleFunc("/v1/assets/", s.assetContent)
	mux.HandleFunc("/v1/inspiration/prompts", s.inspirationPrompts)
	mux.HandleFunc("/v1/inspiration/prompts/", s.inspirationPromptByID)
	mux.HandleFunc("/v1/inspiration/categories", s.inspirationCategories)
	mux.HandleFunc("/v1/inspiration/categories/", s.inspirationCategoryByID)
	mux.HandleFunc("/v1/inspiration/images/", s.inspirationImage)
	port := env("API_PORT", "4000")
	fmt.Printf("iStudio Go API listening on :%s\n", port)
	httpServer := &http.Server{
		Addr:              env("API_HOST", "127.0.0.1") + ":" + port,
		Handler:           cors(mux),
		ReadHeaderTimeout: 5 * time.Second,
		ReadTimeout:       30 * time.Second,
		WriteTimeout:      11 * time.Minute,
		IdleTimeout:       2 * time.Minute,
	}
	if err := httpServer.ListenAndServe(); err != nil {
		panic(err)
	}
}

func (s *server) health(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		s.error(w, http.StatusMethodNotAllowed, "METHOD_NOT_ALLOWED", "不支持的请求方法")
		return
	}
	s.json(w, http.StatusOK, map[string]any{"service": "istudio-server", "status": "ok", "database": dbStatus(s.db), "aiProviderConfigured": s.ai != nil && s.ai.hasAny("image"), "timestamp": time.Now().UTC().Format(time.RFC3339)})
}

func (s *server) register(w http.ResponseWriter, r *http.Request) { s.auth(w, r, true) }
func (s *server) login(w http.ResponseWriter, r *http.Request)    { s.auth(w, r, false) }
func (s *server) auth(w http.ResponseWriter, r *http.Request, create bool) {
	if r.Method != http.MethodPost {
		s.error(w, http.StatusMethodNotAllowed, "METHOD_NOT_ALLOWED", "不支持的请求方法")
		return
	}
	if !s.allowAuthAttempt(r) {
		s.error(w, 429, "AUTH_RATE_LIMIT", "登录或注册请求过多，请 15 分钟后重试")
		return
	}
	var body struct {
		Username string `json:"username"`
		Password string `json:"password"`
	}
	if !decode(r, &body) {
		s.error(w, 400, "AUTH_INPUT_INVALID", "用户名需为 3-32 位，密码至少 8 位")
		return
	}
	name := strings.ToLower(strings.TrimSpace(body.Username))
	if !validUsername(name) || len(body.Password) < 8 || len(body.Password) > 128 {
		s.error(w, 400, "AUTH_INPUT_INVALID", "用户名需为 3-32 位字母、数字或下划线，密码需为 8-128 位")
		return
	}
	if s.db != nil {
		u, exists, err := dbFindUser(s.db, name)
		if err != nil {
			s.error(w, 500, "AUTH_STORAGE_ERROR", "账号服务暂时不可用")
			return
		}
		if create {
			config, err := s.operationSettings()
			if err != nil {
				s.error(w, 503, "AUTH_STORAGE_ERROR", "注册服务暂时不可用")
				return
			}
			if !config.RegistrationEnabled {
				s.error(w, 403, "REGISTRATION_CLOSED", "网站暂未开放注册")
				return
			}
			if exists {
				s.error(w, 409, "USERNAME_EXISTS", "用户名已存在")
				return
			}
			u = user{ID: randomID(), Username: name, PasswordHash: hashPassword(body.Password)}
			if err := s.registerAccount(u, config.SignupGiftMinor); err != nil {
				s.error(w, 409, "USERNAME_EXISTS", "用户名已存在")
				return
			}
		} else if !exists || !checkPassword(body.Password, u.PasswordHash) {
			s.error(w, 401, "INVALID_CREDENTIALS", "用户名或密码错误")
			return
		}
		if u.Status == "disabled" {
			s.error(w, 403, "ACCOUNT_DISABLED", "账号已停用，请联系管理员")
			return
		}
		s.json(w, 200, map[string]any{"accessToken": s.token(u), "user": map[string]string{"id": u.ID, "username": u.Username}})
		return
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	u, exists := s.users[name]
	if create {
		if exists {
			s.error(w, 409, "USERNAME_EXISTS", "用户名已存在")
			return
		}
		u = user{ID: randomID(), Username: name, PasswordHash: hashPassword(body.Password)}
		s.users[name] = u
	} else if !exists || !checkPassword(body.Password, u.PasswordHash) {
		s.error(w, 401, "INVALID_CREDENTIALS", "用户名或密码错误")
		return
	}
	s.json(w, 200, map[string]any{"accessToken": s.token(u), "user": map[string]string{"id": u.ID, "username": u.Username}})
}
func (s *server) me(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		s.error(w, http.StatusMethodNotAllowed, "METHOD_NOT_ALLOWED", "不支持的请求方法")
		return
	}
	u, ok := s.currentUser(r)
	if !ok {
		s.json(w, 200, map[string]any{"authenticated": false})
		return
	}
	config, err := s.operationSettings()
	if err != nil {
		s.error(w, 503, "ACCOUNT_UNAVAILABLE", "账户暂时不可用")
		return
	}
	var available, held int64
	if s.db != nil {
		if err = s.db.QueryRow("SELECT available,held FROM credit_accounts WHERE user_id=$1", u.ID).Scan(&available, &held); err != nil {
			s.error(w, 503, "ACCOUNT_UNAVAILABLE", "余额暂时不可用")
			return
		}
	}
	s.json(w, 200, map[string]any{"authenticated": true, "user": map[string]string{"id": u.ID, "sub": u.ID, "username": u.Username, "role": u.Role}, "available": available, "held": held, "creditName": config.CreditName, "creditScale": creditScale})
}

func (s *server) capabilities(w http.ResponseWriter, r *http.Request) {
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
func (s *server) validate(w http.ResponseWriter, r *http.Request) {
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
func (s *server) tasksHandler(w http.ResponseWriter, r *http.Request) {
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
		list := make([]task, 0, len(s.tasks))
		for _, item := range s.tasks {
			if item.UserID != userID {
				continue
			}
			if projectID != "" && item.ProjectID != projectID {
				continue
			}
			if mode != "" && taskInputField(item.Input, "mode") != mode {
				continue
			}
			if taskType != "" && taskInputField(item.Input, "taskType") != taskType {
				continue
			}
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
func (s *server) taskByID(w http.ResponseWriter, r *http.Request) {
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
		t, ok, err := dbFindTask(s.db, id, userID)
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
func (s *server) deleteTask(w http.ResponseWriter, r *http.Request, id string) {
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
		keys, err := deleteTaskRecords(tx, userID, id)
		if err == sql.ErrNoRows {
			s.error(w, http.StatusNotFound, "GENERATION_TASK_NOT_FOUND", "生成任务不存在")
			return
		}
		if err != nil {
			if err == errTaskActive {
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
	if isActiveTask(t.Status) {
		s.error(w, http.StatusConflict, "GENERATION_TASK_ACTIVE", "任务正在生成，请完成后再删除")
		return
	}
	delete(s.tasks, id)
	s.json(w, http.StatusOK, map[string]any{"deleted": id})
}

func (s *server) retryTask(w http.ResponseWriter, r *http.Request, id string) {
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
	var original task
	var exists bool
	var err error
	if s.db != nil {
		original, exists, err = dbFindTask(s.db, id, userID)
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

func (s *server) authenticatedUserID(r *http.Request) (string, bool) {
	u, ok := s.currentUser(r)
	return u.ID, ok
}

func (s *server) updateTaskStatus(id, status string) {
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

func (s *server) updateTaskResult(id, status string, images []string, modules []string, message string) {
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

func (s *server) assetContent(w http.ResponseWriter, r *http.Request) {
	if strings.HasSuffix(r.URL.Path, "/metadata") {
		s.assetMetadata(w, r)
		return
	}
	if strings.HasSuffix(r.URL.Path, "/thumbnail") {
		s.assetThumbnail(w, r)
		return
	}
	if r.Method == http.MethodDelete {
		s.deleteAsset(w, r, assetIDFromPath(r.URL.Path))
		return
	}
	if r.Method != http.MethodGet {
		s.error(w, http.StatusMethodNotAllowed, "METHOD_NOT_ALLOWED", "不支持的请求方法")
		return
	}
	uid, ok := s.authenticatedUserID(r)
	if !ok {
		s.error(w, 401, "AUTH_REQUIRED", "请先登录")
		return
	}
	id := strings.TrimSuffix(strings.TrimPrefix(r.URL.Path, "/v1/assets/"), "/content")
	if s.db == nil {
		s.error(w, 404, "ASSET_NOT_FOUND", "资产不存在")
		return
	}
	var key, mime, name string
	if err := s.db.QueryRow("SELECT storage_key,mime,filename FROM assets WHERE id=$1 AND user_id=$2", id, uid).Scan(&key, &mime, &name); err != nil {
		s.error(w, 404, "ASSET_NOT_FOUND", "资产不存在")
		return
	}
	if s.redirectStoredObject(w, r, key) {
		return
	}
	file, err := s.storage.Open(key)
	if err != nil {
		s.error(w, 404, "ASSET_FILE_NOT_FOUND", "资产文件不存在")
		return
	}
	defer file.Close()
	w.Header().Set("Content-Type", mime)
	w.Header().Set("Content-Disposition", mimepkg.FormatMediaType("inline", map[string]string{"filename": name}))
	w.Header().Set("Cache-Control", "private, max-age=3600")
	_, _ = io.Copy(w, file)
}

// assetIDFromPath 从 /v1/assets/{id} 或 /v1/assets/{id}/content 取资产 id。
func assetIDFromPath(path string) string {
	return strings.TrimSuffix(strings.TrimPrefix(path, "/v1/assets/"), "/content")
}

// deleteAsset 删除一张资产（资产库里的单张图片），并把它从任务结果里移除。
func (s *server) deleteAsset(w http.ResponseWriter, r *http.Request, id string) {
	userID, ok := s.authenticatedUserID(r)
	if !ok {
		s.error(w, http.StatusUnauthorized, "AUTH_REQUIRED", "请先登录")
		return
	}
	if id == "" {
		s.error(w, http.StatusBadRequest, "ASSET_NOT_FOUND", "资产不存在")
		return
	}
	if s.db == nil {
		s.error(w, http.StatusServiceUnavailable, "DATABASE_REQUIRED", "删除资产需要数据库服务")
		return
	}
	tx, err := s.db.Begin()
	if err != nil {
		s.error(w, 500, "ASSET_STORAGE_ERROR", "删除失败，请稍后重试")
		return
	}
	defer tx.Rollback()
	key, err := deleteAssetRecord(tx, userID, id)
	if err == errTaskActive {
		s.error(w, 409, "ASSET_IN_USE", "素材正在用于生成，请等待任务完成后再删除")
		return
	}
	if err == sql.ErrNoRows {
		s.error(w, http.StatusNotFound, "ASSET_NOT_FOUND", "资产不存在")
		return
	}
	if err != nil {
		s.error(w, http.StatusInternalServerError, "ASSET_STORAGE_ERROR", "删除失败，请稍后重试")
		return
	}
	if err := tx.Commit(); err != nil {
		s.error(w, 500, "ASSET_STORAGE_ERROR", "删除失败，请稍后重试")
		return
	}
	if key != "" && s.storage != nil {
		_ = s.deleteAssetFiles(key)
	}
	s.json(w, http.StatusOK, map[string]any{"deleted": id})
}

func (s *server) projects(w http.ResponseWriter, r *http.Request) {
	uid, ok := s.authenticatedUserID(r)
	if !ok {
		s.error(w, 401, "AUTH_REQUIRED", "请先登录")
		return
	}
	if s.db == nil {
		s.json(w, 200, map[string]any{"projects": []any{}})
		return
	}
	if r.Method == http.MethodPost {
		var body struct {
			Name string `json:"name"`
		}
		if !decode(r, &body) {
			s.error(w, 400, "PROJECT_INPUT_INVALID", "项目名称不能为空")
			return
		}
		name := strings.TrimSpace(body.Name)
		if name == "" || len([]rune(name)) > 80 {
			s.error(w, 400, "PROJECT_INPUT_INVALID", "项目名称需为 1-80 个字符")
			return
		}
		id := randomID()
		_, err := s.db.Exec("INSERT INTO projects (id,user_id,name) VALUES ($1,$2,$3)", id, uid, name)
		if err != nil {
			s.error(w, 500, "PROJECT_STORAGE_ERROR", "项目保存失败")
			return
		}
		s.json(w, 201, map[string]any{"project": map[string]any{"id": id, "name": name}})
		return
	}
	if r.Method != http.MethodGet {
		s.error(w, http.StatusMethodNotAllowed, "METHOD_NOT_ALLOWED", "不支持的请求方法")
		return
	}
	rows, err := s.db.Query(`SELECT p.id,p.name,p.created_at,p.updated_at,p.archived,
		(SELECT COUNT(*) FROM assets a WHERE a.project_id=p.id AND a.hidden_at IS NULL),
		(SELECT COUNT(*) FROM generation_tasks t WHERE t.user_id=p.user_id AND (t.project_id=p.id OR EXISTS(SELECT 1 FROM assets a WHERE a.task_id=t.id AND a.user_id=p.user_id AND a.project_id=p.id)))
		FROM projects p WHERE p.user_id=$1 ORDER BY p.updated_at DESC`, uid)
	if err != nil {
		s.error(w, 500, "PROJECT_STORAGE_ERROR", "项目查询失败")
		return
	}
	defer rows.Close()
	list := []map[string]any{}
	for rows.Next() {
		var id, name string
		var created, updated time.Time
		var assetCount, taskCount int
		var archived bool
		if rows.Scan(&id, &name, &created, &updated, &archived, &assetCount, &taskCount) == nil {
			list = append(list, map[string]any{"id": id, "name": name, "createdAt": created, "updatedAt": updated, "assetCount": assetCount, "taskCount": taskCount, "archived": archived})
		}
	}
	s.json(w, 200, map[string]any{"projects": list})
}

func (s *server) assets(w http.ResponseWriter, r *http.Request) {
	uid, ok := s.authenticatedUserID(r)
	if !ok {
		s.error(w, 401, "AUTH_REQUIRED", "请先登录")
		return
	}
	if r.Method == http.MethodGet {
		if s.db == nil {
			s.json(w, 200, map[string]any{"assets": []any{}})
			return
		}
		rows, err := s.db.Query("SELECT id,project_id,filename,mime,size_bytes,width,height,hash,created_at FROM assets WHERE user_id=$1 AND hidden_at IS NULL ORDER BY created_at DESC", uid)
		if err != nil {
			s.error(w, 500, "ASSET_STORAGE_ERROR", "资产查询失败")
			return
		}
		defer rows.Close()
		list := []map[string]any{}
		for rows.Next() {
			var id, filename, mime, hash string
			var project sql.NullString
			var size int64
			var width, height int
			var created time.Time
			if rows.Scan(&id, &project, &filename, &mime, &size, &width, &height, &hash, &created) == nil {
				list = append(list, map[string]any{"id": id, "projectId": project.String, "filename": filename, "mime": mime, "sizeBytes": size, "width": width, "height": height, "hash": hash, "contentPath": "/v1/assets/" + id + "/content", "createdAt": created})
			}
		}
		s.json(w, 200, map[string]any{"assets": list})
		return
	}
	if r.Method != http.MethodPost {
		s.error(w, 405, "METHOD_NOT_ALLOWED", "不支持的请求方法")
		return
	}
	if s.db == nil {
		s.error(w, http.StatusServiceUnavailable, "DATABASE_REQUIRED", "上传素材需要数据库服务")
		return
	}
	r.Body = http.MaxBytesReader(w, r.Body, 11<<20)
	if err := r.ParseMultipartForm(11 << 20); err != nil {
		s.error(w, 400, "ASSET_UPLOAD_INVALID", "上传文件无效")
		return
	}
	defer r.MultipartForm.RemoveAll()
	file, header, err := r.FormFile("file")
	if err != nil {
		s.error(w, 400, "ASSET_FILE_REQUIRED", "请选择图片")
		return
	}
	defer file.Close()
	if header.Size > 10<<20 {
		s.error(w, 400, "ASSET_TOO_LARGE", "图片不能超过 10MB")
		return
	}
	ext := strings.ToLower(filepath.Ext(header.Filename))
	allowed := map[string]string{".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".webp": "image/webp"}
	expectedMime, ok := allowed[ext]
	if !ok {
		s.error(w, 400, "ASSET_FORMAT_UNSUPPORTED", "仅支持 JPG、PNG、WebP")
		return
	}
	id := randomID()
	key := id + ext
	data, err := io.ReadAll(io.LimitReader(file, 10<<20+1))
	if err != nil || int64(len(data)) > 10<<20 {
		s.error(w, 400, "ASSET_TOO_LARGE", "图片不能超过 10MB")
		return
	}
	if detectedMime := http.DetectContentType(data); detectedMime != expectedMime {
		s.error(w, 400, "ASSET_CONTENT_INVALID", "文件内容与图片格式不匹配")
		return
	}
	hash := sha256.Sum256(data)
	width, height := 0, 0
	if config, _, decodeErr := image.DecodeConfig(bytes.NewReader(data)); decodeErr == nil {
		width, height = config.Width, config.Height
	}
	projectID := r.FormValue("projectId")
	if projectID != "" && !s.userOwnsProject(uid, projectID) {
		s.error(w, 400, "PROJECT_NOT_FOUND", "所属项目不存在")
		return
	}
	tx, err := s.db.Begin()
	if err != nil {
		s.error(w, 500, "ASSET_STORAGE_ERROR", "资产记录保存失败")
		return
	}
	defer tx.Rollback()
	// The account lock serializes deduplication, deletion and generation reservations.
	if _, err = tx.Exec("SELECT id FROM users WHERE id=$1 FOR UPDATE", uid); err != nil {
		s.error(w, 500, "ASSET_STORAGE_ERROR", "资产记录保存失败")
		return
	}
	digest := hex.EncodeToString(hash[:])
	var existingID string
	err = tx.QueryRow("SELECT id FROM assets WHERE user_id=$1 AND hash=$2 AND task_id IS NULL ORDER BY created_at,id LIMIT 1 FOR UPDATE", uid, digest).Scan(&existingID)
	if err == nil {
		if _, err = tx.Exec("UPDATE assets SET hidden_at=NULL WHERE id=$1", existingID); err != nil {
			s.error(w, 500, "ASSET_STORAGE_ERROR", "素材恢复失败")
			return
		}
		if err = tx.Commit(); err != nil {
			s.error(w, 500, "ASSET_STORAGE_ERROR", "素材恢复失败")
			return
		}
		s.json(w, 200, map[string]any{"asset": map[string]any{"id": existingID}, "reused": true})
		return
	}
	if err != sql.ErrNoRows {
		s.error(w, 500, "ASSET_STORAGE_ERROR", "素材查询失败")
		return
	}
	key = s.newStorageKey(key)
	if err = s.storage.Save(key, bytes.NewReader(data)); err != nil {
		s.error(w, 500, "ASSET_STORAGE_ERROR", "图片保存失败")
		return
	}
	committed := false
	defer func() {
		if !committed {
			_ = s.storage.Delete(key)
		}
	}()
	if _, err = tx.Exec("INSERT INTO assets (id,user_id,project_id,filename,storage_key,mime,size_bytes,width,height,hash) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)", id, uid, nullableString(projectID), filepath.Base(header.Filename), key, expectedMime, int64(len(data)), width, height, digest); err != nil {
		s.error(w, 500, "ASSET_STORAGE_ERROR", "资产记录保存失败")
		return
	}
	if projectID != "" {
		if _, err = tx.Exec("UPDATE projects SET updated_at=now() WHERE id=$1 AND user_id=$2", projectID, uid); err != nil {
			s.error(w, 500, "ASSET_STORAGE_ERROR", "项目更新失败")
			return
		}
	}
	if err = tx.Commit(); err != nil {
		s.error(w, 500, "ASSET_STORAGE_ERROR", "资产记录保存失败")
		return
	}
	committed = true

	s.json(w, 201, map[string]any{"asset": map[string]any{"id": id, "filename": filepath.Base(header.Filename), "mime": expectedMime, "sizeBytes": len(data), "width": width, "height": height, "hash": hex.EncodeToString(hash[:]), "projectId": projectID}})
}

func (s *server) token(u user) string {
	payload := base64.RawURLEncoding.EncodeToString([]byte(fmt.Sprintf(`{"sub":"%s","username":"%s","ver":%d,"exp":%d}`, u.ID, u.Username, u.AuthVersion, time.Now().Add(7*24*time.Hour).Unix())))
	mac := hmac.New(sha256.New, s.secret)
	mac.Write([]byte(payload))
	return payload + "." + base64.RawURLEncoding.EncodeToString(mac.Sum(nil))
}
func (s *server) verify(token string) (map[string]any, bool) {
	parts := strings.Split(token, ".")
	if len(parts) != 2 {
		return nil, false
	}
	mac := hmac.New(sha256.New, s.secret)
	mac.Write([]byte(parts[0]))
	sig, err := base64.RawURLEncoding.DecodeString(parts[1])
	if err != nil || !hmac.Equal(sig, mac.Sum(nil)) {
		return nil, false
	}
	raw, err := base64.RawURLEncoding.DecodeString(parts[0])
	if err != nil {
		return nil, false
	}
	var p map[string]any
	if json.Unmarshal(raw, &p) != nil {
		return nil, false
	}
	expiresAt, ok := p["exp"].(float64)
	if !ok {
		return nil, false
	}
	if expiresAt > 1_000_000_000_000 {
		expiresAt /= 1000
	}
	if time.Now().Unix() >= int64(expiresAt) {
		return nil, false
	}
	return p, true
}
func hashPassword(password string) string {
	salt := make([]byte, 16)
	_, _ = rand.Read(salt)
	key := argon2.IDKey([]byte(password), salt, 3, 64*1024, 2, 32)
	return base64.RawStdEncoding.EncodeToString(salt) + ":" + base64.RawStdEncoding.EncodeToString(key)
}
func checkPassword(password, stored string) bool {
	parts := strings.SplitN(stored, ":", 2)
	if len(parts) != 2 {
		return false
	}
	salt, saltErr := base64.RawStdEncoding.DecodeString(parts[0])
	expected, keyErr := base64.RawStdEncoding.DecodeString(parts[1])
	if saltErr != nil || keyErr != nil {
		return false
	}
	actual := argon2.IDKey([]byte(password), salt, 3, 64*1024, 2, 32)
	return hmac.Equal(expected, actual)
}
func randomID() string { b := make([]byte, 16); _, _ = rand.Read(b); return hex.EncodeToString(b) }
func decode(r *http.Request, v any) bool {
	decoder := json.NewDecoder(io.LimitReader(r.Body, 1<<20))
	if err := decoder.Decode(v); err != nil {
		return false
	}
	var extra any
	return decoder.Decode(&extra) == io.EOF
}

func validUsername(value string) bool {
	if len(value) < 3 || len(value) > 32 {
		return false
	}
	for _, character := range value {
		if (character < 'a' || character > 'z') && (character < '0' || character > '9') && character != '_' {
			return false
		}
	}
	return true
}
func (s *server) json(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(v)
}
func (s *server) error(w http.ResponseWriter, status int, code, message string) {
	s.json(w, status, map[string]any{"code": code, "message": message})
}
func env(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}

// Load simple KEY=VALUE entries so the standalone Go service shares the repo .env convention.
func loadDotEnv() {
	// The API owns its secrets; never fall back to the workspace root .env.
	paths := []string{"apps/server/.env", ".env"}
	for _, path := range paths {
		file, err := os.Open(path)
		if err != nil {
			continue
		}
		defer file.Close()
		scanner := bufio.NewScanner(file)
		for scanner.Scan() {
			line := strings.TrimSpace(scanner.Text())
			if line == "" || strings.HasPrefix(line, "#") {
				continue
			}
			parts := strings.SplitN(line, "=", 2)
			if len(parts) != 2 {
				continue
			}
			key, value := strings.TrimSpace(parts[0]), strings.TrimSpace(parts[1])
			value = strings.Trim(value, "\"'")
			if key != "" && os.Getenv(key) == "" {
				_ = os.Setenv(key, value)
			}
		}
		return
	}
}

// runInspirationSeed 从本地画廊 markdown 导入全量提示词到数据库。
// 用法：go run . seed-inspiration -g1 gallery-part-1.md -g2 gallery-part-2.md -cat gallery.md
func runInspirationSeed() int {
	flags := flag.NewFlagSet("seed-inspiration", flag.ExitOnError)
	gallery1 := flags.String("g1", "gallery-part-1.md", "gallery-part-1.md 路径")
	gallery2 := flags.String("g2", "gallery-part-2.md", "gallery-part-2.md 路径")
	categoriesFile := flags.String("cat", "gallery.md", "gallery.md 总览路径（用于分类映射）")
	imageBase := flags.String("images", "https://raw.githubusercontent.com/freestylefly/awesome-gpt-image-2/main/data/images", "案例图下载基址")
	concurrency := flags.Int("concurrency", 6, "图片下载并发数")
	_ = flags.Parse(os.Args[2:])

	galleryMarkdown, err := readSeedFile(*gallery1, *gallery2)
	if err != nil {
		fmt.Printf("读取画廊文件失败：%v\n", err)
		return 1
	}
	categoriesMarkdown, err := os.ReadFile(*categoriesFile)
	if err != nil {
		fmt.Printf("读取分类总览失败：%v\n", err)
		return 1
	}

	cases, err := parseInspirationGallery(galleryMarkdown, string(categoriesMarkdown))
	if err != nil {
		fmt.Printf("解析画廊失败：%v\n", err)
		return 1
	}
	fmt.Printf("解析出 %d 条案例\n", len(cases))

	db, err := openDatabase()
	if err != nil || db == nil {
		fmt.Printf("数据库不可用：%v（需配置 DATABASE_URL）\n", err)
		return 1
	}
	defer db.Close()
	if err := migrateDatabase(db); err != nil {
		fmt.Printf("迁移失败：%v\n", err)
		return 1
	}

	root := env("STORAGE_ROOT", "storage/uploads")
	if err := seedInspirationPrompts(db, cases, root, *imageBase, *concurrency); err != nil {
		fmt.Printf("导入出错：%v\n", err)
		return 1
	}

	var total int
	_ = db.QueryRow("SELECT count(*) FROM inspiration_prompts").Scan(&total)
	fmt.Printf("导入完成，库内共 %d 条\n", total)
	return 0
}

func readSeedFile(paths ...string) (string, error) {
	var builder strings.Builder
	for _, path := range paths {
		data, err := os.ReadFile(path)
		if err != nil {
			return "", fmt.Errorf("%s: %w", path, err)
		}
		builder.Write(data)
		builder.WriteString("\n")
	}
	return builder.String(), nil
}
func cors(next http.Handler) http.Handler {
	allowedOrigins := stringSet(strings.Split(env("WEB_ORIGINS", "http://127.0.0.1:3000,http://localhost:3000"), ",")...)
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		origin := r.Header.Get("Origin")
		if _, ok := allowedOrigins[origin]; origin != "" && ok {
			w.Header().Set("Access-Control-Allow-Origin", origin)
			w.Header().Set("Vary", "Origin")
		}
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization, Idempotency-Key, X-Expected-Unit-Price")
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS")
		if r.Method == http.MethodOptions {
			w.WriteHeader(204)
			return
		}
		next.ServeHTTP(w, r)
	})
}
