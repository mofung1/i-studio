package main

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"database/sql"
	_ "embed"
	"encoding/base64"
	"encoding/json"
	"errors"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"sync"
	"time"
)

//go:embed migrations/001_ai_configuration.sql
var aiConfigurationMigration string

type endpointConfig struct {
	ID              string          `json:"id"`
	Name            string          `json:"name"`
	Purpose         string          `json:"purpose"`
	Protocol        string          `json:"protocol"`
	BaseURL         string          `json:"baseUrl"`
	APIKeyEncrypted string          `json:"-"`
	Model           string          `json:"model"`
	TimeoutSeconds  int             `json:"timeoutSeconds"`
	Capabilities    map[string]bool `json:"capabilities"`
	Enabled         bool            `json:"enabled"`
	IsDefault       bool            `json:"isDefault"`
	CreatedAt       time.Time       `json:"createdAt"`
	UpdatedAt       time.Time       `json:"updatedAt"`
}

type endpointInput struct {
	Name           string          `json:"name"`
	Purpose        string          `json:"purpose"`
	Protocol       string          `json:"protocol"`
	BaseURL        string          `json:"baseUrl"`
	APIKey         string          `json:"apiKey"`
	Model          string          `json:"model"`
	TimeoutSeconds int             `json:"timeoutSeconds"`
	Capabilities   map[string]bool `json:"capabilities"`
	Enabled        bool            `json:"enabled"`
	IsDefault      bool            `json:"isDefault"`
}

type promptTemplate struct {
	Key            string    `json:"key"`
	Name           string    `json:"name"`
	Category       string    `json:"category"`
	Content        string    `json:"content"`
	DefaultContent string    `json:"defaultContent"`
	Enabled        bool      `json:"enabled"`
	SortOrder      int       `json:"sortOrder"`
	CreatedAt      time.Time `json:"createdAt"`
	UpdatedAt      time.Time `json:"updatedAt"`
}

type aiConfigStore struct {
	mu     sync.Mutex
	server *server
}

// A single aggregate is mutated under a database advisory lock (or the local
// mutex), so default selection stays atomic across multiple API processes.
type aiConfiguration struct {
	Endpoints      []endpointConfig `json:"endpoints"`
	Templates      []promptTemplate `json:"templates"`
	LegacyMigrated bool             `json:"legacyMigrated"`
}

type storedEndpoint struct {
	endpointConfig
	EncryptedKey string `json:"encryptedKey"`
}

func newAIConfigStore(s *server) *aiConfigStore { return &aiConfigStore{server: s} }

func (a *aiConfigStore) configPath() string {
	return filepath.Join(a.server.storageRoot, ".ai", "config.json")
}

func (a *aiConfigStore) encryptionKey() ([]byte, error) {
	if raw := os.Getenv("AI_CONFIG_ENCRYPTION_KEY"); raw != "" {
		key, err := base64.StdEncoding.DecodeString(raw)
		if err != nil || len(key) != 32 {
			return nil, errors.New("AI_CONFIG_ENCRYPTION_KEY must be base64 of 32 bytes")
		}
		return key, nil
	}
	path := filepath.Join(a.server.storageRoot, ".ai", "encryption.key")
	if err := os.MkdirAll(filepath.Dir(path), 0700); err != nil {
		return nil, err
	}
	key, err := os.ReadFile(path)
	if err == nil {
		if len(key) != 32 {
			return nil, errors.New("invalid AI encryption key file")
		}
		return key, nil
	}
	if !os.IsNotExist(err) {
		return nil, err
	}
	key = make([]byte, 32)
	if _, err := rand.Read(key); err != nil {
		return nil, err
	}
	f, err := os.OpenFile(path, os.O_WRONLY|os.O_CREATE|os.O_EXCL, 0600)
	if os.IsExist(err) {
		return a.encryptionKey()
	}
	if err != nil {
		return nil, err
	}
	_, err = f.Write(key)
	closeErr := f.Close()
	if err != nil {
		return nil, err
	}
	return key, closeErr
}

func (a *aiConfigStore) encrypt(id, secret string) (string, error) {
	key, err := a.encryptionKey()
	if err != nil {
		return "", err
	}
	block, err := aes.NewCipher(key)
	if err != nil {
		return "", err
	}
	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return "", err
	}
	nonce := make([]byte, gcm.NonceSize())
	if _, err := rand.Read(nonce); err != nil {
		return "", err
	}
	sealed := gcm.Seal(nonce, nonce, []byte(secret), []byte(id))
	return base64.StdEncoding.EncodeToString(sealed), nil
}

func (a *aiConfigStore) decrypt(e endpointConfig) (string, error) {
	key, err := a.encryptionKey()
	if err != nil {
		return "", err
	}
	block, err := aes.NewCipher(key)
	if err != nil {
		return "", err
	}
	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return "", err
	}
	sealed, err := base64.StdEncoding.DecodeString(e.APIKeyEncrypted)
	if err != nil || len(sealed) < gcm.NonceSize() {
		return "", errors.New("invalid encrypted API key")
	}
	plain, err := gcm.Open(nil, sealed[:gcm.NonceSize()], sealed[gcm.NonceSize():], []byte(e.ID))
	if err != nil {
		return "", errors.New("cannot decrypt API key; restore the original encryption key")
	}
	return string(plain), nil
}

func (a *aiConfigStore) withConfig(write bool, fn func(*aiConfiguration) error) error {
	a.mu.Lock()
	defer a.mu.Unlock()
	state := aiConfiguration{Endpoints: []endpointConfig{}, Templates: []promptTemplate{}}
	if a.server.db == nil {
		var disk struct {
			Endpoints      []storedEndpoint `json:"endpoints"`
			Templates      []promptTemplate `json:"templates"`
			LegacyMigrated bool             `json:"legacyMigrated"`
		}
		raw, err := os.ReadFile(a.configPath())
		if err == nil {
			if err := json.Unmarshal(raw, &disk); err != nil {
				return err
			}
			for _, e := range disk.Endpoints {
				e.APIKeyEncrypted = e.EncryptedKey
				state.Endpoints = append(state.Endpoints, e.endpointConfig)
			}
			state.Templates = disk.Templates
			state.LegacyMigrated = disk.LegacyMigrated
		} else if !os.IsNotExist(err) {
			return err
		}
		if err := fn(&state); err != nil {
			return err
		}
		if !write {
			return nil
		}
		disk.Endpoints = nil
		for _, e := range state.Endpoints {
			disk.Endpoints = append(disk.Endpoints, storedEndpoint{e, e.APIKeyEncrypted})
		}
		disk.Templates = state.Templates
		disk.LegacyMigrated = state.LegacyMigrated
		raw, err = json.Marshal(disk)
		if err != nil {
			return err
		}
		if err := os.MkdirAll(filepath.Dir(a.configPath()), 0700); err != nil {
			return err
		}
		f, err := os.CreateTemp(filepath.Dir(a.configPath()), "ai-config-*.tmp")
		if err != nil {
			return err
		}
		defer os.Remove(f.Name())
		if _, err = f.Write(raw); err != nil {
			f.Close()
			return err
		}
		if err = f.Close(); err != nil {
			return err
		}
		return os.Rename(f.Name(), a.configPath())
	}
	tx, err := a.server.db.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()
	if _, err := tx.Exec("SELECT pg_advisory_xact_lock(724091024)"); err != nil {
		return err
	}
	rows, err := tx.Query("SELECT id,name,purpose,protocol,base_url,api_key_encrypted,model,timeout_seconds,capabilities,enabled,is_default,created_at,updated_at FROM ai_endpoints ORDER BY created_at,id")
	if err != nil {
		return err
	}
	for rows.Next() {
		var e endpointConfig
		var caps []byte
		if err := rows.Scan(&e.ID, &e.Name, &e.Purpose, &e.Protocol, &e.BaseURL, &e.APIKeyEncrypted, &e.Model, &e.TimeoutSeconds, &caps, &e.Enabled, &e.IsDefault, &e.CreatedAt, &e.UpdatedAt); err != nil {
			rows.Close()
			return err
		}
		if err := json.Unmarshal(caps, &e.Capabilities); err != nil {
			rows.Close()
			return err
		}
		state.Endpoints = append(state.Endpoints, e)
	}
	err = rows.Err()
	rows.Close()
	if err != nil {
		return err
	}
	rows, err = tx.Query("SELECT key,name,category,content,default_content,enabled,sort_order,created_at,updated_at FROM prompt_templates ORDER BY sort_order,key")
	if err != nil {
		return err
	}
	for rows.Next() {
		var t promptTemplate
		if err := rows.Scan(&t.Key, &t.Name, &t.Category, &t.Content, &t.DefaultContent, &t.Enabled, &t.SortOrder, &t.CreatedAt, &t.UpdatedAt); err != nil {
			rows.Close()
			return err
		}
		state.Templates = append(state.Templates, t)
	}
	err = rows.Err()
	rows.Close()
	if err != nil {
		return err
	}
	if err := tx.QueryRow("SELECT EXISTS(SELECT 1 FROM schema_migrations WHERE key='legacy_ai_import')").Scan(&state.LegacyMigrated); err != nil {
		return err
	}
	if err := fn(&state); err != nil {
		return err
	}
	if write {
		// Clear defaults before upserts to avoid the partial unique index during swaps.
		if _, err := tx.Exec("UPDATE ai_endpoints SET is_default=false WHERE is_default"); err != nil {
			return err
		}
		ids := []string{}
		for _, e := range state.Endpoints {
			ids = append(ids, e.ID)
		}
		if _, err := tx.Exec("DELETE FROM ai_endpoints WHERE NOT (id=ANY($1::text[]))", ids); err != nil {
			return err
		}
		for _, e := range state.Endpoints {
			caps, _ := json.Marshal(e.Capabilities)
			if _, err := tx.Exec("INSERT INTO ai_endpoints(id,name,purpose,protocol,base_url,api_key_encrypted,model,timeout_seconds,capabilities,enabled,is_default,created_at,updated_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10,$11,$12,$13) ON CONFLICT(id) DO UPDATE SET name=EXCLUDED.name,purpose=EXCLUDED.purpose,protocol=EXCLUDED.protocol,base_url=EXCLUDED.base_url,api_key_encrypted=EXCLUDED.api_key_encrypted,model=EXCLUDED.model,timeout_seconds=EXCLUDED.timeout_seconds,capabilities=EXCLUDED.capabilities,enabled=EXCLUDED.enabled,is_default=EXCLUDED.is_default,updated_at=EXCLUDED.updated_at", e.ID, e.Name, e.Purpose, e.Protocol, e.BaseURL, e.APIKeyEncrypted, e.Model, e.TimeoutSeconds, caps, e.Enabled, e.IsDefault, e.CreatedAt, e.UpdatedAt); err != nil {
				return err
			}
		}
		for _, t := range state.Templates {
			if _, err := tx.Exec("INSERT INTO prompt_templates(key,name,category,content,default_content,enabled,sort_order,created_at,updated_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT(key) DO UPDATE SET content=EXCLUDED.content,default_content=EXCLUDED.default_content,enabled=EXCLUDED.enabled,updated_at=EXCLUDED.updated_at", t.Key, t.Name, t.Category, t.Content, t.DefaultContent, t.Enabled, t.SortOrder, t.CreatedAt, t.UpdatedAt); err != nil {
				return err
			}
		}
		if state.LegacyMigrated {
			if _, err := tx.Exec("INSERT INTO schema_migrations(key) VALUES('legacy_ai_import') ON CONFLICT DO NOTHING"); err != nil {
				return err
			}
		}
	}
	return tx.Commit()
}

func normalizeDefaults(state *aiConfiguration, selected string) {
	for _, purpose := range []string{"prompt", "image"} {
		chosen := ""
		for _, e := range state.Endpoints {
			if e.Purpose == purpose && e.Enabled && e.ID == selected {
				chosen = e.ID
			}
		}
		if chosen == "" {
			for _, e := range state.Endpoints {
				if e.Purpose == purpose && e.Enabled && e.IsDefault {
					chosen = e.ID
					break
				}
			}
		}
		if chosen == "" {
			for _, e := range state.Endpoints {
				if e.Purpose == purpose && e.Enabled {
					chosen = e.ID
					break
				}
			}
		}
		for i := range state.Endpoints {
			if state.Endpoints[i].Purpose == purpose {
				state.Endpoints[i].IsDefault = state.Endpoints[i].ID == chosen
			}
		}
	}
}

func (a *aiConfigStore) list() ([]endpointConfig, error) {
	var endpoints []endpointConfig
	if a == nil {
		return []endpointConfig{}, nil
	}
	err := a.withConfig(false, func(state *aiConfiguration) error { endpoints = state.Endpoints; return nil })
	return endpoints, err
}

func (a *aiConfigStore) resolve(purpose, id, model string) (endpointConfig, error) {
	endpoints, err := a.list()
	if err != nil {
		return endpointConfig{}, err
	}
	for _, e := range endpoints {
		if e.Purpose == purpose && e.Enabled && ((id != "" && e.ID == id) || (id == "" && model != "" && e.Model == model)) {
			return e, nil
		}
	}
	if id != "" {
		return endpointConfig{}, errors.New("所选 AI 服务不存在或已禁用")
	}
	for _, e := range endpoints {
		if e.Purpose == purpose && e.Enabled && e.IsDefault {
			return e, nil
		}
	}
	return endpointConfig{}, errors.New("请先在设置中配置并启用 AI 服务")
}

func (a *aiConfigStore) hasAny(purpose string) bool {
	_, err := a.resolve(purpose, "", "")
	return err == nil
}
func validateEndpoint(input *endpointInput) error {
	input.Name = strings.TrimSpace(input.Name)
	input.BaseURL = strings.TrimRight(strings.TrimSpace(input.BaseURL), "/")
	input.Model = strings.TrimSpace(input.Model)
	input.APIKey = strings.TrimSpace(input.APIKey)
	if input.Name == "" || len(input.Name) > 120 || input.Model == "" || len(input.Model) > 200 {
		return errors.New("名称和 Model 不能为空，且长度不能超过 120 / 200 个字符")
	}
	valid := (input.Purpose == "prompt" && input.Protocol == "openai_chat") || (input.Purpose == "image" && (input.Protocol == "openai_image" || input.Protocol == "gemini_generate_content"))
	if !valid {
		return errors.New("用途与协议不匹配，当前支持 OpenAI Chat、OpenAI Image 和 Gemini GenerateContent")
	}
	u, err := url.Parse(input.BaseURL)
	if err != nil || u.Host == "" || (u.Scheme != "http" && u.Scheme != "https") || u.User != nil || u.RawQuery != "" || u.Fragment != "" {
		return errors.New("Base URL 必须是有效的 HTTP(S) 地址，不能包含凭据、查询或片段")
	}
	if input.TimeoutSeconds < 1 || input.TimeoutSeconds > 600 {
		return errors.New("Timeout 必须在 1–600 秒之间")
	}
	if input.Capabilities == nil {
		input.Capabilities = map[string]bool{}
	}
	if input.IsDefault && !input.Enabled {
		return errors.New("默认服务必须启用")
	}
	return nil
}

func (a *aiConfigStore) save(id string, input endpointInput) (endpointConfig, error) {
	var result endpointConfig
	if err := validateEndpoint(&input); err != nil {
		return result, err
	}
	err := a.withConfig(true, func(state *aiConfiguration) error {
		index := -1
		for i, e := range state.Endpoints {
			if e.ID == id {
				index = i
				result = e
				break
			}
		}
		if id != "" && index < 0 {
			return sql.ErrNoRows
		}
		if id == "" {
			id = randomID()
			result.ID = id
			result.CreatedAt = time.Now().UTC()
		}
		if input.APIKey != "" {
			encrypted, err := a.encrypt(id, input.APIKey)
			if err != nil {
				return err
			}
			result.APIKeyEncrypted = encrypted
		}
		if result.APIKeyEncrypted == "" {
			return errors.New("请填写 API Key")
		}
		result.Name = input.Name
		result.Purpose = input.Purpose
		result.Protocol = input.Protocol
		result.BaseURL = input.BaseURL
		result.Model = input.Model
		result.TimeoutSeconds = input.TimeoutSeconds
		result.Capabilities = input.Capabilities
		result.Enabled = input.Enabled
		result.IsDefault = input.IsDefault
		result.UpdatedAt = time.Now().UTC()
		if index >= 0 {
			state.Endpoints[index] = result
		} else {
			state.Endpoints = append(state.Endpoints, result)
		}
		selected := ""
		if result.IsDefault {
			selected = id
		}
		normalizeDefaults(state, selected)
		for _, e := range state.Endpoints {
			if e.ID == id {
				result = e
			}
		}
		return nil
	})
	return result, err
}

func (a *aiConfigStore) mutate(id string, remove bool) error {
	return a.withConfig(true, func(state *aiConfiguration) error {
		found := false
		for i, e := range state.Endpoints {
			if e.ID == id {
				found = true
				if remove {
					state.Endpoints = append(state.Endpoints[:i], state.Endpoints[i+1:]...)
				} else if !e.Enabled {
					return errors.New("请先启用此服务")
				}
				break
			}
		}
		if !found {
			return sql.ErrNoRows
		}
		if remove {
			id = ""
		}
		normalizeDefaults(state, id)
		return nil
	})
}

func (a *aiConfigStore) public(e endpointConfig) (map[string]any, error) {
	key, err := a.decrypt(e)
	if err != nil {
		return nil, err
	}
	raw, _ := json.Marshal(e)
	result := map[string]any{}
	_ = json.Unmarshal(raw, &result)
	masked := "****"
	if len(key) > 4 {
		masked += key[len(key)-4:]
	}
	result["apiKeyConfigured"] = key != ""
	result["apiKeyMasked"] = masked
	return result, nil
}

// Existing accounts have no role field. The oldest account owns instance settings.
func (s *server) canManageAI(uid string) bool {
	if uid == "" {
		return false
	}
	if s.db != nil {
		var id string
		return s.db.QueryRow("SELECT id FROM users ORDER BY created_at,id LIMIT 1").Scan(&id) == nil && id == uid
	}
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.aiAdminID == uid
}

func (s *server) requireAIAdmin(w http.ResponseWriter, r *http.Request) bool {
	uid, ok := s.authenticatedUserID(r)
	if !ok {
		s.error(w, 401, "AUTH_REQUIRED", "请先登录")
		return false
	}
	if !s.canManageAI(uid) {
		s.error(w, 403, "AI_SETTINGS_FORBIDDEN", "仅首个注册账号可管理全局 AI 配置")
		return false
	}
	return true
}

func (a *aiConfigStore) migrateLegacy() error {
	return a.withConfig(true, func(state *aiConfiguration) error {
		if !state.LegacyMigrated && len(state.Endpoints) == 0 {
			inputs := []endpointInput{}
			if key := strings.TrimSpace(os.Getenv("DEEPSEEK_API_KEY")); key != "" {
				inputs = append(inputs, endpointInput{Name: "DeepSeek", Purpose: "prompt", Protocol: "openai_chat", BaseURL: env("DEEPSEEK_BASE_URL", "https://api.deepseek.com"), APIKey: key, Model: env("DEEPSEEK_MODEL", "deepseek-flash"), TimeoutSeconds: clampInt(parseQueryInt(env("DEEPSEEK_TIMEOUT_SECONDS", "60"), 60), 1, 600), Capabilities: map[string]bool{"vision": true}, Enabled: true, IsDefault: true})
			}
			if key := strings.TrimSpace(os.Getenv("BANANA_ROUTER_API_KEY")); key != "" {
				// The previous transport offered both protocols and four selectable models.
				// Preserve those choices, including its default GPT model and async paths.
				models := []string{"gpt-image-2", "gemini-2.5-flash-image", "gemini-3.1-flash-image-preview", "gemini-3-pro-image-preview"}
				if model := os.Getenv("BANANA_ROUTER_MODEL"); model != "" {
					models = []string{model}
				}
				enabled := !strings.EqualFold(env("AI_PROVIDER_ENABLED", "true"), "false")
				for i, model := range models {
					protocol := "openai_image"
					caps := map[string]bool{"async": true}
					base := strings.TrimRight(env("BANANA_ROUTER_BASE_URL", "https://api.bananarouter.com"), "/")
					if strings.HasPrefix(model, "gemini-") {
						protocol = "gemini_generate_content"
						caps = map[string]bool{}
					} else if !strings.HasSuffix(base, "/v1") {
						base += "/v1"
					}
					inputs = append(inputs, endpointInput{Name: "Legacy · " + model, Purpose: "image", Protocol: protocol, BaseURL: base, APIKey: key, Model: model, TimeoutSeconds: clampInt(parseQueryInt(env("BANANA_ROUTER_TIMEOUT_SECONDS", "300"), 300), 1, 600), Capabilities: caps, Enabled: enabled, IsDefault: enabled && i == 0})
				}
			}
			for _, input := range inputs {
				if err := validateEndpoint(&input); err != nil {
					return err
				}
				id := randomID()
				encrypted, err := a.encrypt(id, input.APIKey)
				if err != nil {
					return err
				}
				now := time.Now().UTC()
				state.Endpoints = append(state.Endpoints, endpointConfig{ID: id, Name: input.Name, Purpose: input.Purpose, Protocol: input.Protocol, BaseURL: input.BaseURL, APIKeyEncrypted: encrypted, Model: input.Model, TimeoutSeconds: input.TimeoutSeconds, Capabilities: input.Capabilities, Enabled: input.Enabled, IsDefault: input.IsDefault, CreatedAt: now, UpdatedAt: now})
			}
		}
		if len(state.Endpoints) > 0 {
			state.LegacyMigrated = true
		}
		for _, def := range defaultPromptTemplates() {
			found := false
			for i, t := range state.Templates {
				if t.Key == def.Key {
					state.Templates[i].DefaultContent = def.Content
					found = true
					break
				}
			}
			if !found {
				state.Templates = append(state.Templates, def)
			}
		}
		sort.Slice(state.Templates, func(i, j int) bool { return state.Templates[i].SortOrder < state.Templates[j].SortOrder })
		return nil
	})
}
