package studio

import (
	"context"
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/istudio/server/internal/domain"
	"github.com/istudio/server/internal/idgen"
	"github.com/istudio/server/internal/repository"
)

type frozenProvider struct {
	Version         int            `json:"version"`
	PublicModelID   string         `json:"public_model_id"`
	EndpointID      string         `json:"endpoint_id"`
	Protocol        string         `json:"protocol"`
	BaseURL         string         `json:"base_url"`
	UpstreamModelID string         `json:"upstream_model_id"`
	TimeoutSeconds  int            `json:"timeout_seconds"`
	ModelParameters map[string]any `json:"model_parameters"`
	CreditPrice     int64          `json:"credit_price"`
}

type operationError struct {
	status        int
	code, message string
}

func (e *operationError) Error() string { return e.message }

func (s *Service) operationFailure(w http.ResponseWriter, err error) {
	var problem *operationError
	if errors.As(err, &problem) {
		s.error(w, problem.status, problem.code, problem.message)
		return
	}
	fmt.Printf("operation failed: %v\n", err)
	s.error(w, 503, "BILLING_UNAVAILABLE", "余额服务暂时不可用，请稍后重试")
}

func (s *Service) generationQuote(w http.ResponseWriter, r *http.Request) {
	if r.Method != "GET" {
		s.error(w, 405, "METHOD_NOT_ALLOWED", "不支持的请求方法")
		return
	}
	uid, ok := s.authenticatedUserID(r)
	if !ok {
		s.error(w, 401, "AUTH_REQUIRED", "请先登录")
		return
	}
	count, err := strconv.Atoi(r.URL.Query().Get("count"))
	if err != nil || count < 1 || count > 16 {
		s.error(w, 400, "COUNT_INVALID", "图片数量需为 1–16 张")
		return
	}
	m, err := s.resolvePublicModel(r.URL.Query().Get("modelId"), "")
	if err != nil {
		s.error(w, 409, "MODEL_UNAVAILABLE", err.Error())
		return
	}
	c, err := s.operationSettings()
	var available, held int64
	if err == nil && s.db != nil {
		err = s.db.QueryRow("SELECT available,held FROM credit_accounts WHERE user_id=$1", uid).Scan(&available, &held)
	}
	if err != nil || s.db == nil {
		s.operationFailure(w, fmt.Errorf("account unavailable"))
		return
	}
	total := m.PriceMinor * int64(count)
	s.json(w, 200, map[string]any{"modelId": m.ID, "unitPriceMinor": m.PriceMinor, "totalMinor": total, "quantity": count, "availableMinor": available, "heldMinor": held, "canAfford": available >= total, "creditName": c.CreditName, "creditScale": creditScale})
}

func (s *Service) createChargedTask(w http.ResponseWriter, r *http.Request, uid string, input map[string]any) {
	for _, key := range []string{"generationPrompts", "sourceImages", "protocolClient", "moduleHint", "taskId"} {
		delete(input, key)
	}

	expected, err := strconv.ParseInt(r.Header.Get("X-Expected-Unit-Price"), 10, 64)
	key := r.Header.Get("Idempotency-Key")
	if err != nil || expected < 0 || len(key) < 8 || len(key) > 100 {
		s.error(w, 400, "SUBMISSION_INVALID", "请刷新模型价格后重新提交")
		return
	}
	t, fresh, err := s.reserveGeneration(uid, key, expected, input)
	if err != nil {
		s.operationFailure(w, err)
		return
	}
	if fresh && (s.queue == nil || !s.queue.enqueue(t.ID)) {
		s.updateTaskResult(t.ID, "failed", nil, nil, "生成队列暂时不可用，预留余额已退回")
		s.error(w, 503, "GENERATION_QUEUE_FULL", "生成队列暂时不可用，预留余额已退回")
		return
	}
	s.attachBilling(&t)
	s.json(w, 202, map[string]any{"task": t, "aiEnabled": true, "message": "任务已创建，余额已预留"})
}

func (s *Service) reserveGeneration(uid, key string, expected int64, input map[string]any) (domain.GenerationTask, bool, error) {
	if s.db == nil {
		return domain.GenerationTask{}, false, fmt.Errorf("database required")
	}
	raw, _ := json.Marshal(input)
	hash := sha256.Sum256(raw)
	fingerprint := hex.EncodeToString(hash[:])
	c, err := s.operationSettings()
	if err != nil {
		return domain.GenerationTask{}, false, err
	}
	prompts, err := s.generationPromptSnapshot()
	if err != nil {
		return domain.GenerationTask{}, false, err
	}
	tx, err := s.db.Begin()
	if err != nil {
		return domain.GenerationTask{}, false, err
	}
	defer tx.Rollback()
	var status string
	if err = tx.QueryRow("SELECT status FROM users WHERE id=$1 FOR UPDATE", uid).Scan(&status); err != nil {
		return domain.GenerationTask{}, false, err
	}
	if status != "active" {
		return domain.GenerationTask{}, false, &operationError{403, "ACCOUNT_DISABLED", "账号已停用"}
	}
	var available, held int64
	if err = tx.QueryRow("SELECT available,held FROM credit_accounts WHERE user_id=$1 FOR UPDATE", uid).Scan(&available, &held); err != nil {
		return domain.GenerationTask{}, false, err
	}
	var priorID, priorHash string
	err = tx.QueryRow("SELECT task_id,input_hash FROM generation_charges WHERE user_id=$1 AND request_key=$2", uid, key).Scan(&priorID, &priorHash)
	if err == nil {
		if priorHash != fingerprint {
			return domain.GenerationTask{}, false, &operationError{409, "IDEMPOTENCY_CONFLICT", "该提交编号已用于其他生成参数"}
		}
		// Read within the transaction to avoid an extra connection while account rows are locked.
		var t domain.GenerationTask
		var stored, images, modules []byte
		var project, message sql.NullString
		err = tx.QueryRow("SELECT id,status,created_at,input,result_images,result_modules,project_id,error_message FROM generation_tasks WHERE id=$1 AND user_id=$2", priorID, uid).Scan(&t.ID, &t.Status, &t.CreatedAt, &stored, &images, &modules, &project, &message)
		if err == sql.ErrNoRows {
			return domain.GenerationTask{}, false, &operationError{409, "TASK_ALREADY_REMOVED", "该提交已处理且任务已删除，请发起新创作"}
		}
		if err != nil {
			return domain.GenerationTask{}, false, err
		}
		_ = json.Unmarshal(stored, &t.Input)
		_ = json.Unmarshal(images, &t.ResultImages)
		_ = json.Unmarshal(modules, &t.ResultModules)
		t.ProjectID = project.String
		t.ErrorMessage = message.String
		t.UserID = uid
		return t, false, nil
	}
	if err != sql.ErrNoRows {
		return domain.GenerationTask{}, false, err
	}
	var usedBytes, storageLimit int64
	if err = tx.QueryRow("SELECT account_storage_bytes($1),COALESCE((config->>'accountStorageLimitBytes')::bigint,1073741824) FROM operation_settings WHERE id=true", uid).Scan(&usedBytes, &storageLimit); err != nil {
		return domain.GenerationTask{}, false, err
	}
	if usedBytes >= storageLimit {
		return domain.GenerationTask{}, false, &operationError{413, "ACCOUNT_STORAGE_QUOTA", "账号存储额度已满，请先清理不再需要的作品、素材或反推记录"}
	}
	if err := validateInputOwnershipTx(tx, uid, input); err != nil {
		return domain.GenerationTask{}, false, &operationError{400, "GENERATION_ASSET_INVALID", err.Error()}
	}
	if _, err = tx.Exec("SELECT pg_advisory_xact_lock(79140001)"); err != nil {
		return domain.GenerationTask{}, false, err
	}
	m, err := resolveAvailableModel(tx, stringValue(input["endpointId"], ""), stringValue(input["model"], ""))
	if err != nil {
		return domain.GenerationTask{}, false, &operationError{409, "MODEL_UNAVAILABLE", err.Error()}
	}
	if expected != m.PriceMinor {
		return domain.GenerationTask{}, false, &operationError{409, "PRICE_CHANGED", "模型价格已变更，请确认最新价格后重新提交"}
	}
	quantity := intValue(input["count"], 1)
	if quantity < 1 || quantity > 16 {
		return domain.GenerationTask{}, false, &operationError{400, "COUNT_INVALID", "图片数量不正确"}
	}
	total := int64(quantity) * m.PriceMinor
	if available < total {
		return domain.GenerationTask{}, false, &operationError{402, "INSUFFICIENT_CREDITS", fmt.Sprintf("%s不足，本次需要 %s %s", c.CreditName, formatCredits(total), c.CreditName)}
	}
	var active, recent int
	if err = tx.QueryRow("SELECT count(*) FROM generation_charges WHERE user_id=$1 AND settled=false", uid).Scan(&active); err != nil {
		return domain.GenerationTask{}, false, err
	}
	if active >= c.MaxConcurrentTasks {
		return domain.GenerationTask{}, false, &operationError{429, "CONCURRENT_TASK_LIMIT", "正在生成的任务已达上限，请等待完成"}
	}
	if err = tx.QueryRow("SELECT count(*) FROM generation_charges WHERE user_id=$1 AND created_at>now()-interval '1 hour'", uid).Scan(&recent); err != nil {
		return domain.GenerationTask{}, false, err
	}
	if recent >= c.GenerationRequestsPerHour {
		return domain.GenerationTask{}, false, &operationError{429, "GENERATION_RATE_LIMIT", "本小时生成任务已达上限，请稍后再试"}
	}
	endpoint, err := resolveChannel(tx, m.ID)
	if err != nil {
		return domain.GenerationTask{}, false, &operationError{409, "MODEL_UNAVAILABLE", "模型通道暂时不可用"}
	}
	if err = validateModelParameters(m.Capabilities, input); err != nil {
		return domain.GenerationTask{}, false, &operationError{400, "MODEL_PARAMETERS_INVALID", err.Error()}
	}
	if err = validateImageProtocolParameters(endpoint.Protocol, input); err != nil {
		return domain.GenerationTask{}, false, &operationError{400, "MODEL_PARAMETERS_INVALID", err.Error()}
	}
	providerRaw, _ := json.Marshal(frozenProvider{Version: 1, PublicModelID: m.ID, EndpointID: endpoint.ID, Protocol: endpoint.Protocol, BaseURL: endpoint.BaseURL, UpstreamModelID: endpoint.Model, TimeoutSeconds: endpoint.TimeoutSeconds, ModelParameters: map[string]any{"aspectRatio": stringValue(input["aspectRatio"], "1:1"), "resolution": stringValue(input["resolution"], "2K"), "count": quantity}, CreditPrice: m.PriceMinor})
	promptsRaw, _ := json.Marshal(prompts)
	// Persist public model identifiers; real connection details live only in the private charge snapshot.
	input["endpointId"] = m.ID
	input["model"] = m.Name
	publicRaw, _ := json.Marshal(input)
	t := domain.GenerationTask{ID: idgen.New(), UserID: uid, Status: "queued", CreatedAt: time.Now().UTC().Format(time.RFC3339Nano), Input: input, ProjectID: stringValue(input["projectId"], "")}
	_, err = tx.Exec("INSERT INTO generation_tasks(id,user_id,project_id,status,input,created_at) VALUES($1,$2,$3,'queued',$4::jsonb,$5)", t.ID, uid, repository.NullableString(t.ProjectID), publicRaw, t.CreatedAt)
	if err == nil {
		_, err = tx.Exec(`INSERT INTO generation_charges(task_id,user_id,request_key,input_hash,model_id,model_name,unit_price,quantity,provider_snapshot,prompts_snapshot) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10::jsonb)`, t.ID, uid, key, fingerprint, m.ID, m.Name, m.PriceMinor, quantity, providerRaw, promptsRaw)
	}
	if err == nil {
		_, err = tx.Exec("UPDATE credit_accounts SET available=available-$2,held=held+$2,updated_at=now() WHERE user_id=$1", uid, total)
	}
	if err == nil {
		_, err = tx.Exec(`INSERT INTO credit_ledger(user_id,kind,available_delta,held_delta,available_after,held_after,task_id,request_key,note) VALUES($1,'reserve',$2,$3,$4,$5,$6,$7,$8)`, uid, -total, total, available-total, held+total, t.ID, "reserve:"+t.ID, m.Name+" · "+strconv.Itoa(quantity)+" 张")
	}
	if err == nil {
		err = tx.Commit()
	}
	return t, err == nil, err
}

func formatCredits(minor int64) string {
	return strings.TrimRight(strings.TrimRight(fmt.Sprintf("%.2f", float64(minor)/100), "0"), ".")
}

func (s *Service) attachBilling(t *domain.GenerationTask) {
	t.ErrorMessage = publicGenerationError(t.ErrorMessage)
	s.attachImageDetails(t)
	if s.db == nil {
		return
	}
	var b domain.GenerationBilling
	if s.db.QueryRow("SELECT model_name,unit_price,quantity,unit_price*quantity,charged,refunded,settled FROM generation_charges WHERE task_id=$1", t.ID).Scan(&b.ModelName, &b.UnitPrice, &b.Quantity, &b.Reserved, &b.Charged, &b.Refunded, &b.Settled) == nil {
		t.Billing = &b
	}
}

// Task result and wallet settlement commit together; repeated completion is harmless.
func (s *Service) settleGeneration(id, status string, images, modules []string, message string, leaseTokens ...string) error {
	tx, err := s.db.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()
	if len(leaseTokens) > 0 && leaseTokens[0] != "" {
		run := generationRun{server: s, id: id, token: leaseTokens[0]}
		if err = run.lock(context.Background(), tx); err != nil {
			return err
		}
	} else {
		var taskID string
		if err = tx.QueryRow("SELECT id FROM generation_tasks WHERE id=$1 FOR UPDATE", id).Scan(&taskID); err != nil {
			return err
		}
	}
	var uid string
	var price int64
	var quantity int
	var settled bool
	err = tx.QueryRow("SELECT user_id,unit_price,quantity,settled FROM generation_charges WHERE task_id=$1 FOR UPDATE", id).Scan(&uid, &price, &quantity, &settled)
	if err == sql.ErrNoRows {
		raw, _ := json.Marshal(images)
		mods, _ := json.Marshal(modules)
		_, err = tx.Exec("UPDATE generation_tasks SET status=$2,result_images=$3::jsonb,result_modules=$4::jsonb,error_message=$5,lease_until=NULL,lease_token='' WHERE id=$1", id, status, raw, mods, repository.NullableString(message))
		if err == nil {
			err = tx.Commit()
		}
		return err
	}
	if err != nil {
		return err
	}
	if settled {
		return nil
	}
	var journaled bool
	if err = tx.QueryRow("SELECT EXISTS(SELECT 1 FROM generation_deliveries WHERE task_id=$1)", id).Scan(&journaled); err != nil {
		return err
	}
	if journaled {
		images, modules, err = savedDeliveryImages(context.Background(), tx, id)
		if err != nil {
			return err
		}
	}
	// Never charge for inaccessible results, duplicates, or excess upstream output.
	seen := map[string]bool{}
	saved := []string{}
	attribution := []string{}
	for i, path := range images {
		if seen[path] || len(saved) >= quantity {
			continue
		}
		seen[path] = true
		var owns bool
		if err = tx.QueryRow("SELECT EXISTS(SELECT 1 FROM assets WHERE user_id=$1 AND task_id=$2 AND '/v1/assets/'||id||'/content'=$3)", uid, id, path).Scan(&owns); err != nil {
			return err
		}
		if owns {
			saved = append(saved, path)
			module := ""
			if i < len(modules) {
				module = modules[i]
			}
			attribution = append(attribution, module)
		}
	}
	reserved := price * int64(quantity)
	charged := price * int64(len(saved))
	refund := reserved - charged
	var available, held int64
	err = tx.QueryRow("UPDATE credit_accounts SET available=available+$2,held=held-$3,updated_at=now() WHERE user_id=$1 AND held>=$3 RETURNING available,held", uid, refund, reserved).Scan(&available, &held)
	if err != nil {
		return fmt.Errorf("settle wallet: %w", err)
	}
	_, err = tx.Exec("UPDATE generation_charges SET settled=true,charged=$2,refunded=$3 WHERE task_id=$1", id, charged, refund)
	if err == nil {
		_, err = tx.Exec(`INSERT INTO credit_ledger(user_id,kind,available_delta,held_delta,available_after,held_after,task_id,request_key,note) VALUES($1,'settlement',$2,$3,$4,$5,$6,$7,$8)`, uid, refund, -reserved, available, held, id, "settle:"+id, fmt.Sprintf("完成 %d/%d 张；消耗 %s；退回 %s", len(saved), quantity, formatCredits(charged), formatCredits(refund)))
	}
	raw, _ := json.Marshal(saved)
	mods, _ := json.Marshal(attribution)
	if err == nil {
		_, err = tx.Exec("UPDATE generation_tasks SET status=$2,result_images=$3::jsonb,result_modules=$4::jsonb,error_message=$5,lease_until=NULL,lease_token='' WHERE id=$1", id, status, raw, mods, repository.NullableString(message))
	}
	if err == nil {
		_, err = tx.Exec("UPDATE generation_deliveries SET result_source_encrypted='',error_message=CASE WHEN status='saved' THEN error_message ELSE $2 END,status=CASE WHEN status='saved' THEN status ELSE 'failed' END,updated_at=now() WHERE task_id=$1", id, publicGenerationError(message))
	}
	if err == nil {
		err = tx.Commit()
	}
	return err
}

func (s *Service) loadFrozenGeneration(id string, input map[string]any) error {
	if s.db == nil {
		return nil
	}
	var providerRaw, promptsRaw []byte
	err := s.db.QueryRow("SELECT provider_snapshot,prompts_snapshot FROM generation_charges WHERE task_id=$1", id).Scan(&providerRaw, &promptsRaw)
	if err == sql.ErrNoRows {
		return fmt.Errorf("任务缺少渠道快照")
	}
	if err != nil {
		return err
	}
	var frozen frozenProvider
	var prompts generationPromptSet
	if err = json.Unmarshal(providerRaw, &frozen); err != nil {
		return err
	}
	if err = json.Unmarshal(promptsRaw, &prompts); err != nil {
		return err
	}
	if frozen.Version != 1 || frozen.EndpointID == "" || frozen.UpstreamModelID == "" {
		return fmt.Errorf("不支持的任务渠道快照，请重新创建开发任务")
	}
	current, err := s.ai.resolve("image", frozen.EndpointID, "")
	if err != nil {
		return fmt.Errorf("冻结渠道已被删除或禁用: %w", err)
	}
	key, err := s.ai.decrypt(current)
	if err != nil {
		return err
	}
	endpoint := endpointConfig{ID: frozen.EndpointID, Purpose: "image", Protocol: frozen.Protocol, BaseURL: frozen.BaseURL, Model: frozen.UpstreamModelID, TimeoutSeconds: frozen.TimeoutSeconds, Enabled: true}
	if _, ok := s.provider.(*dynamicImageProvider); ok {
		input["protocolClient"] = s.imageProtocolClient(endpoint, key)
	}
	input["generationPrompts"] = prompts
	for key, value := range frozen.ModelParameters {
		input[key] = value
	}
	input["model"] = frozen.UpstreamModelID
	return nil
}
