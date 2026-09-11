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
	"fmt"
	"image"
	_ "image/jpeg"
	_ "image/png"
	"io"
	mimepkg "mime"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"

	"golang.org/x/crypto/argon2"
)

type user struct{ ID, Username, PasswordHash string }
type task struct {
	ID           string   `json:"id"`
	UserID       string   `json:"-"`
	ProjectID    string   `json:"projectId,omitempty"`
	Status       string   `json:"status"`
	CreatedAt    string   `json:"createdAt"`
	Input        any      `json:"input"`
	ResultImages []string `json:"resultImages,omitempty"`
	ErrorMessage string   `json:"errorMessage,omitempty"`
}
type assetRecord struct {
	ID, UserID, ProjectID, Filename, StorageKey, Mime, Hash string
	SizeBytes                                               int64
	Width, Height                                           int
}
type server struct {
	mu          sync.RWMutex
	users       map[string]user
	tasks       map[string]task
	secret      []byte
	db          *sql.DB
	storageRoot string
	storage     objectStorage
	queue       *taskQueue
	provider    imageProvider
}

func main() {
	loadDotEnv()
	db, dbErr := openDatabase()
	if dbErr != nil {
		fmt.Printf("database unavailable, using memory store: %v\n", dbErr)
	}
	if err := migrateDatabase(db); err != nil {
		fmt.Printf("database migration skipped: %v\n", err)
	}
	root := env("STORAGE_ROOT", "storage/uploads")
	_ = os.MkdirAll(root, 0o755)
	s := &server{users: map[string]user{}, tasks: map[string]task{}, secret: []byte(env("AUTH_JWT_SECRET", "istudio-dev-secret-change-me")), db: db, storageRoot: root, storage: newLocalStorage(root)}
	if os.Getenv("BANANA_ROUTER_API_KEY") != "" && !strings.EqualFold(env("AI_PROVIDER_ENABLED", "true"), "false") {
		s.provider = newBananaRouterProvider()
	}
	s.queue = newTaskQueue(s)
	mux := http.NewServeMux()
	mux.HandleFunc("/v1/health", s.health)
	mux.HandleFunc("/v1/auth/register", s.register)
	mux.HandleFunc("/v1/auth/login", s.login)
	mux.HandleFunc("/v1/auth/me", s.me)
	mux.HandleFunc("/v1/generation/capabilities", s.capabilities)
	mux.HandleFunc("/v1/generation/validate", s.validate)
	mux.HandleFunc("/v1/generation/tasks", s.tasksHandler)
	mux.HandleFunc("/v1/generation/tasks/", s.taskByID)
	mux.HandleFunc("/v1/projects", s.projects)
	mux.HandleFunc("/v1/assets", s.assets)
	mux.HandleFunc("/v1/assets/", s.assetContent)
	port := env("API_PORT", "4000")
	fmt.Printf("iStudio Go API listening on :%s\n", port)
	httpServer := &http.Server{
		Addr:              env("API_HOST", "127.0.0.1") + ":" + port,
		Handler:           cors(mux),
		ReadHeaderTimeout: 5 * time.Second,
		ReadTimeout:       30 * time.Second,
		WriteTimeout:      2 * time.Minute,
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
	s.json(w, http.StatusOK, map[string]any{"service": "istudio-server", "status": "ok", "database": dbStatus(s.db), "aiProviderConfigured": s.provider != nil, "timestamp": time.Now().UTC().Format(time.RFC3339)})
}

func (s *server) register(w http.ResponseWriter, r *http.Request) { s.auth(w, r, true) }
func (s *server) login(w http.ResponseWriter, r *http.Request)    { s.auth(w, r, false) }
func (s *server) auth(w http.ResponseWriter, r *http.Request, create bool) {
	if r.Method != http.MethodPost {
		s.error(w, http.StatusMethodNotAllowed, "METHOD_NOT_ALLOWED", "不支持的请求方法")
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
			if exists {
				s.error(w, 409, "USERNAME_EXISTS", "用户名已存在")
				return
			}
			u = user{ID: randomID(), Username: name, PasswordHash: hashPassword(body.Password)}
			if err := dbInsertUser(s.db, u); err != nil {
				s.error(w, 409, "USERNAME_EXISTS", "用户名已存在")
				return
			}
		} else if !exists || !checkPassword(body.Password, u.PasswordHash) {
			s.error(w, 401, "INVALID_CREDENTIALS", "用户名或密码错误")
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
	p, ok := s.verify(strings.TrimPrefix(r.Header.Get("Authorization"), "Bearer "))
	if !ok {
		s.json(w, 200, map[string]any{"authenticated": false})
		return
	}
	s.json(w, 200, map[string]any{"authenticated": true, "user": p})
}

func (s *server) capabilities(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		s.error(w, http.StatusMethodNotAllowed, "METHOD_NOT_ALLOWED", "不支持的请求方法")
		return
	}
	s.json(w, 200, map[string]any{"aiEnabled": s.provider != nil, "provider": "bananarouter", "models": []string{"gpt-image-2", "gemini-2.5-flash-image", "gemini-3.1-flash-image-preview", "gemini-3-pro-image-preview"}})
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
		rows, err := s.db.Query("SELECT id,project_id,status,created_at,input FROM generation_tasks WHERE user_id=$1 ORDER BY created_at DESC LIMIT 50", userID)
		if err != nil {
			s.error(w, 500, "TASK_STORAGE_ERROR", "任务查询失败")
			return
		}
		defer rows.Close()
		list := []task{}
		for rows.Next() {
			var t task
			var project sql.NullString
			var input []byte
			if rows.Scan(&t.ID, &project, &t.Status, &t.CreatedAt, &input) == nil {
				t.ProjectID = project.String
				_ = json.Unmarshal(input, &t.Input)
				list = append(list, t)
			}
		}
		s.json(w, 200, map[string]any{"tasks": list})
		return
	}
	if r.Method == http.MethodGet {
		s.mu.RLock()
		list := make([]task, 0, len(s.tasks))
		for _, item := range s.tasks {
			if item.UserID == userID {
				list = append(list, item)
			}
		}
		s.mu.RUnlock()
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
	if err := s.validateInputOwnership(userID, input); err != nil {
		s.error(w, http.StatusBadRequest, "GENERATION_ASSET_INVALID", err.Error())
		return
	}
	t := task{ID: randomID(), UserID: userID, Status: "queued", CreatedAt: time.Now().UTC().Format(time.RFC3339), Input: input}
	if project, ok := input["projectId"].(string); ok {
		t.ProjectID = project
	}
	if s.db != nil {
		encoded, _ := json.Marshal(input)
		if err := dbInsertTask(s.db, t, userID, encoded); err != nil {
			s.error(w, 500, "TASK_STORAGE_ERROR", "任务暂时无法保存")
			return
		}
		s.json(w, http.StatusAccepted, map[string]any{"task": t, "aiEnabled": s.provider != nil, "message": "任务已创建，等待 AI 服务处理。"})
		s.queue.enqueue(t.ID)
		return
	}
	s.mu.Lock()
	s.tasks[t.ID] = t
	s.mu.Unlock()
	s.queue.enqueue(t.ID)
	s.json(w, http.StatusAccepted, map[string]any{"task": t, "aiEnabled": s.provider != nil, "message": "任务已创建，等待 AI 服务处理。"})
}
func (s *server) taskByID(w http.ResponseWriter, r *http.Request) {
	path := strings.TrimPrefix(r.URL.Path, "/v1/generation/tasks/")
	if strings.HasSuffix(path, "/retry") {
		s.retryTask(w, r, strings.TrimSuffix(path, "/retry"))
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
	s.json(w, 200, map[string]any{"task": t, "aiEnabled": s.provider != nil})
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
	if !ok || validateGenerationInput(input) != nil {
		s.error(w, http.StatusBadRequest, "GENERATION_INPUT_INVALID", "原任务参数无法重试")
		return
	}
	if err := s.validateInputOwnership(userID, input); err != nil {
		s.error(w, http.StatusBadRequest, "GENERATION_ASSET_INVALID", err.Error())
		return
	}
	retry := task{ID: randomID(), UserID: userID, ProjectID: original.ProjectID, Status: "queued", CreatedAt: time.Now().UTC().Format(time.RFC3339), Input: input}
	if s.db != nil {
		encoded, _ := json.Marshal(input)
		if err := dbInsertTask(s.db, retry, userID, encoded); err != nil {
			s.error(w, http.StatusInternalServerError, "TASK_STORAGE_ERROR", "任务暂时无法保存")
			return
		}
	} else {
		s.mu.Lock()
		s.tasks[retry.ID] = retry
		s.mu.Unlock()
	}
	s.queue.enqueue(retry.ID)
	s.json(w, http.StatusAccepted, map[string]any{"task": retry, "message": "任务已创建，等待 AI 服务处理。"})
}

func (s *server) authenticatedUserID(r *http.Request) (string, bool) {
	token := strings.TrimPrefix(r.Header.Get("Authorization"), "Bearer ")
	payload, ok := s.verify(token)
	if !ok {
		return "", false
	}
	id, ok := payload["sub"].(string)
	return id, ok && id != ""
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

func (s *server) updateTaskResult(id, status string, images []string, message string) {
	if s.db != nil {
		raw, _ := json.Marshal(images)
		_, _ = s.db.Exec("UPDATE generation_tasks SET status=$1, result_images=$2::jsonb, error_message=$3 WHERE id=$4", status, raw, nullableString(message), id)
		return
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	if t, ok := s.tasks[id]; ok {
		t.Status = status
		t.ResultImages = images
		t.ErrorMessage = message
		s.tasks[id] = t
	}
}

func (s *server) assetContent(w http.ResponseWriter, r *http.Request) {
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
	rows, err := s.db.Query("SELECT id,name,created_at,updated_at FROM projects WHERE user_id=$1 ORDER BY updated_at DESC", uid)
	if err != nil {
		s.error(w, 500, "PROJECT_STORAGE_ERROR", "项目查询失败")
		return
	}
	defer rows.Close()
	list := []map[string]any{}
	for rows.Next() {
		var id, name string
		var created, updated time.Time
		if rows.Scan(&id, &name, &created, &updated) == nil {
			list = append(list, map[string]any{"id": id, "name": name, "createdAt": created, "updatedAt": updated})
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
		rows, err := s.db.Query("SELECT id,project_id,filename,mime,size_bytes,width,height,hash,created_at FROM assets WHERE user_id=$1 ORDER BY created_at DESC", uid)
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
	if err := r.ParseMultipartForm(11 << 20); err != nil {
		s.error(w, 400, "ASSET_UPLOAD_INVALID", "上传文件无效")
		return
	}
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
	if err := s.storage.Save(key, bytes.NewReader(data)); err != nil {
		s.error(w, 500, "ASSET_STORAGE_ERROR", "图片保存失败")
		return
	}
	projectID := r.FormValue("projectId")
	if s.db != nil {
		if projectID != "" && !s.userOwnsProject(uid, projectID) {
			_ = s.storage.Delete(key)
			s.error(w, 400, "PROJECT_NOT_FOUND", "所属项目不存在")
			return
		}
		if _, err := s.db.Exec("INSERT INTO assets (id,user_id,project_id,filename,storage_key,mime,size_bytes,width,height,hash) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)", id, uid, nullableString(projectID), filepath.Base(header.Filename), key, expectedMime, int64(len(data)), width, height, hex.EncodeToString(hash[:])); err != nil {
			_ = s.storage.Delete(key)
			s.error(w, 500, "ASSET_STORAGE_ERROR", "资产记录保存失败")
			return
		}
	}
	s.json(w, 201, map[string]any{"asset": map[string]any{"id": id, "filename": filepath.Base(header.Filename), "mime": expectedMime, "sizeBytes": len(data), "width": width, "height": height, "hash": hex.EncodeToString(hash[:]), "projectId": projectID}})
}

func (s *server) token(u user) string {
	payload := base64.RawURLEncoding.EncodeToString([]byte(fmt.Sprintf(`{"sub":"%s","username":"%s","exp":%d}`, u.ID, u.Username, time.Now().Add(7*24*time.Hour).Unix())))
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
func cors(next http.Handler) http.Handler {
	allowedOrigins := stringSet(strings.Split(env("WEB_ORIGINS", "http://127.0.0.1:3000,http://localhost:3000"), ",")...)
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		origin := r.Header.Get("Origin")
		if _, ok := allowedOrigins[origin]; origin != "" && ok {
			w.Header().Set("Access-Control-Allow-Origin", origin)
			w.Header().Set("Vary", "Origin")
		}
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization")
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
		if r.Method == http.MethodOptions {
			w.WriteHeader(204)
			return
		}
		next.ServeHTTP(w, r)
	})
}
