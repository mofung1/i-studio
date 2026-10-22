package studio

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"maps"
	"sort"
	"strconv"
	"time"

	redis "github.com/redis/go-redis/v9"

	runtimeconfig "github.com/istudio/server/internal/config"
)

const (
	generationQueueKey           = "istudio:generation"
	generationProcessingKey      = "istudio:generation:processing"
	defaultGenerationWorkerCount = 4
	defaultGenerationPollTimeout = 10 * time.Minute
)

type taskQueue struct {
	redis    *redis.Client
	fallback chan string
	server   *Service
}

func newTaskQueue(s *Service) *taskQueue {
	q := &taskQueue{fallback: make(chan string, 100), server: s}
	if options, err := redis.ParseURL(runtimeconfig.Env("REDIS_URL", "redis://127.0.0.1:6379")); err == nil {
		client := redis.NewClient(options)
		if client.Ping(context.Background()).Err() == nil {
			q.redis = client
		}
	}
	workerCount := generationWorkerCount(runtimeconfig.Env("GENERATION_WORKERS", ""))
	for range workerCount {
		go q.worker()
	}
	if s.db != nil {
		go q.maintainDatabaseQueue()
	}
	return q
}

func generationWorkerCount(raw string) int {
	count, err := strconv.Atoi(raw)
	if err != nil || count < 1 {
		return defaultGenerationWorkerCount
	}
	if count > 16 {
		return 16
	}
	return count
}

func (q *taskQueue) enqueue(id string) bool {
	if q.redis != nil {
		ctx, cancel := context.WithTimeout(context.Background(), time.Second)
		err := q.redis.LPush(ctx, generationQueueKey, id).Err()
		cancel()
		if err == nil {
			return true
		}
	}
	select {
	case q.fallback <- id:
		return true
	default:
		// A full wake-up channel cannot invalidate a durably queued task. The DB
		// dispatcher will notify workers again when capacity becomes available.
		if q.server.db != nil {
			return true
		}
		q.server.updateTaskResult(id, "failed", nil, nil, "生成队列已满，请稍后重试")
		return false
	}
}

func (q *taskQueue) nextTask() (string, bool) {
	if q.redis == nil {
		id, ok := <-q.fallback
		return id, ok && id != ""
	}
	if q.redis != nil {
		values, err := q.redis.BRPopLPush(context.Background(), generationQueueKey, generationProcessingKey, 3*time.Second).Result()
		if err == nil && values != "" {
			return values, true
		}
	}
	select {
	case id := <-q.fallback:
		return id, id != ""
	case <-time.After(250 * time.Millisecond):
		return "", false
	}
}

func (q *taskQueue) acknowledgeTask(id string) {
	if q.redis == nil || id == "" {
		return
	}
	if err := q.redis.LRem(context.Background(), generationProcessingKey, 1, id).Err(); err != nil {
		fmt.Printf("failed to acknowledge generation task %s: %v\n", id, err)
	}
}

func (q *taskQueue) worker() {
	for {
		id, ok := q.nextTask()
		if !ok {
			continue
		}
		q.processTask(id)
		q.acknowledgeTask(id)
	}
}

func (q *taskQueue) processTask(id string) {
	token, recovering, claimed := q.server.claimGenerationRun(id)
	if !claimed {
		return
	}
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	var run *generationRun
	finish := func(status string, images, modules []string, message string) {
		q.server.updateTaskResult(id, status, images, modules, message, token)
	}
	if q.server.db != nil {
		run = &generationRun{server: q.server, id: id, token: token}
		go q.renewGenerationLease(ctx, cancel, run)
		if recovering {
			var journaled bool
			if err := q.server.db.QueryRow("SELECT EXISTS(SELECT 1 FROM generation_deliveries WHERE task_id=$1)", id).Scan(&journaled); err != nil {
				return
			}
			if !journaled {
				images, err := q.server.legacySavedGenerationImages(id)
				if err != nil {
					return
				}
				finish("failed", images, nil, "服务处理被中断，已按可交付图片结算，其余预留余额退回；当前服务不能查询旧任务，重新生成会创建新任务并计费")
				return
			}
			var complete bool
			if err := q.server.db.QueryRow("SELECT (SELECT count(*) FROM generation_deliveries d JOIN assets a ON a.id=d.asset_id AND a.task_id=d.task_id WHERE d.task_id=$1 AND d.status='saved')=c.quantity FROM generation_charges c WHERE c.task_id=$1", id).Scan(&complete); err != nil {
				return
			}
			if complete {
				finish("succeeded", nil, nil, "")
				return
			}
		}
		var active, charged bool
		if err := q.server.db.QueryRow("SELECT u.status='active',EXISTS(SELECT 1 FROM generation_charges c WHERE c.task_id=t.id) FROM generation_tasks t JOIN users u ON u.id=t.user_id WHERE t.id=$1", id).Scan(&active, &charged); err != nil || !active || !charged {
			finish("failed", nil, nil, "账号不可用或任务需要重新提交，预留余额已退回")
			return
		}
		if q.server.ai == nil {
			finish("failed", nil, nil, "无法读取任务保存配置，预留余额已退回")
			return
		}
		if _, err := q.server.ai.encryptionKey(); err != nil {
			finish("failed", nil, nil, "无法读取任务保存配置，预留余额已退回")
			return
		}
	}
	if q.server.provider == nil {
		finish("failed", nil, nil, "AI 服务尚未配置")
		return
	}
	input, ok := q.server.taskInput(id)
	if !ok {
		finish("failed", nil, nil, "无法读取任务参数")
		return
	}
	if err := q.server.loadFrozenGeneration(id, input); err != nil {
		finish("failed", nil, nil, "无法读取任务模型配置，预留余额已退回")
		return
	}
	if err := q.server.attachSourceImages(input); err != nil {
		finish("failed", nil, nil, "参考图片无法读取，请重新选择素材。")
		return
	}
	images, modules, err := q.generateBatchesContext(ctx, id, input, run)
	if errors.Is(err, errGenerationLeaseLost) || ctx.Err() != nil {
		return
	}
	if err != nil {
		fmt.Printf("task %s generation failed (%s): %s\n", id, generationFailureReason(err), publicGenerationError(err.Error()))
		finish("failed", images, modules, publicGenerationError(err.Error()))
		return
	}
	finish("succeeded", images, modules, "")
}

func (q *taskQueue) renewGenerationLease(ctx context.Context, cancel context.CancelFunc, run *generationRun) {
	ticker := time.NewTicker(30 * time.Second)
	defer ticker.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			queryCtx, stop := context.WithTimeout(ctx, 5*time.Second)
			result, err := q.server.db.ExecContext(queryCtx, "UPDATE generation_tasks SET lease_until=now()+interval '2 minutes' WHERE id=$1 AND lease_token=$2 AND lease_until>now() AND status IN ('processing','waiting_provider')", run.id, run.token)
			stop()
			if err != nil {
				cancel()
				return
			}
			n, err := result.RowsAffected()
			if err != nil || n != 1 {
				cancel()
				return
			}
		}
	}
}

// generateBatches 返回图片列表与逐图模块归属（modules[i] 为 images[i] 所属模块 key，
// 非模块化生成时为空切片）。两者按下标一一对应。
func (q *taskQueue) generateBatches(id string, input map[string]any) ([]string, []string, error) {
	return q.generateBatchesContext(context.Background(), id, input, nil)
}

func (q *taskQueue) generateBatchesContext(ctx context.Context, id string, input map[string]any, run *generationRun) ([]string, []string, error) {
	templates, frozen := input["generationPrompts"].(generationPromptSet)
	var err error
	if !frozen {
		templates, err = q.server.generationPromptSnapshot()
	}
	if err != nil {
		return nil, nil, fmt.Errorf("无法读取生成提示词配置：%w", err)
	}
	input["generationPrompts"] = templates
	defer delete(input, "generationPrompts")
	if dynamic, ok := q.server.provider.(*dynamicImageProvider); ok && input["protocolClient"] == nil {
		client, err := dynamic.clientFor(input)
		if err != nil {
			return nil, nil, err
		}
		input["protocolClient"] = client
		defer delete(input, "protocolClient")
	}
	if stringValue(input["taskType"], "") == "clothing-set" {
		return q.generateClothingBatches(ctx, id, input, run)
	}
	if counts := customModuleCounts(input); len(counts) > 0 {
		return q.generateModuleBatches(ctx, id, input, counts, run)
	}
	images, err := q.generateLinearBatches(ctx, id, input, run)
	modules := make([]string, len(images))
	if err != nil {
		return images, modules, err
	}
	return images, modules, nil
}

// customModuleCounts 返回 custom 模式下的模块明细（模块 -> 张数）；
// 非 custom 模式或未配置模块时返回空 map，走线性分批。
func customModuleCounts(input map[string]any) map[string]int {
	taskType := stringValue(input["taskType"], "")
	if taskType != "product-main" && taskType != "detail-page" {
		return nil
	}
	if stringValue(input["moduleMode"], "smart") != "custom" {
		return nil
	}
	raw, ok := input["moduleCounts"].(map[string]any)
	if !ok || len(raw) == 0 {
		return nil
	}
	counts := make(map[string]int, len(raw))
	for key, value := range raw {
		if count := intValue(value, 0); count > 0 {
			counts[key] = count
		}
	}
	return counts
}

const imageRequestBatchSize = 1

func (q *taskQueue) generateClothingBatches(ctx context.Context, id string, input map[string]any, run *generationRun) ([]string, []string, error) {
	raw, _ := json.Marshal(input["clothingPlan"])
	var shots []clothingShot
	if err := json.Unmarshal(raw, &shots); err != nil || len(shots) == 0 {
		return nil, nil, fmt.Errorf("服装生成规划缺失，请重新确认规划")
	}
	previousCount, previousID, previousHint := input["count"], input["taskId"], input["moduleHint"]
	defer func() {
		input["count"], input["taskId"], input["moduleHint"] = previousCount, previousID, previousHint
		delete(input, "generationModule")
	}()
	images, attribution := []string{}, []string{}
	for index, shot := range shots {
		input["count"] = 1
		input["taskId"] = fmt.Sprintf("%s-clothing-%d", id, index+1)
		input["moduleHint"] = shot.Description
		input["generationModule"] = shot.ModuleKey
		path, err := q.generateImage(ctx, id, input, index+1, shot.ModuleKey, run)
		if err != nil {
			return images, attribution, fmt.Errorf("%s 生成失败：%w", shot.Label, err)
		}
		images = append(images, path)
		attribution = append(attribution, shot.ModuleKey)
	}
	return images, attribution, nil
}

func (q *taskQueue) generateLinearBatches(ctx context.Context, id string, input map[string]any, run *generationRun) ([]string, error) {
	remaining := intValue(input["count"], 1)
	batchSize := imageRequestBatchSize
	images := make([]string, 0, remaining)
	for batch := 1; remaining > 0; batch++ {
		size := min(remaining, batchSize)
		input["count"] = size
		input["taskId"] = fmt.Sprintf("%s-%d", id, batch)
		path, err := q.generateImage(ctx, id, input, batch, "", run)
		if err != nil {
			return images, fmt.Errorf("第 %d 批生成失败：%w", batch, err)
		}
		images = append(images, path)
		remaining--
	}
	return images, nil
}

// generateModuleBatches 按模块逐个生成，每个模块批次注入专属 moduleHint，
// 使不同模块产出构图差异化的图片，而非全部共用同一个 prompt。
// 返回值第二项为逐图模块归属，与图片列表按下标一一对应。
func (q *taskQueue) generateModuleBatches(ctx context.Context, id string, input map[string]any, counts map[string]int, run *generationRun) ([]string, []string, error) {
	batchSize := imageRequestBatchSize
	savedHint := stringValue(input["moduleHint"], "")
	defer func() { input["moduleHint"] = savedHint }()

	modules := make([]string, 0, len(counts))
	for module := range counts {
		modules = append(modules, module)
	}
	sort.Strings(modules)

	images := make([]string, 0)
	attribution := make([]string, 0)
	for _, module := range modules {
		remaining := counts[module]
		for batch := 1; remaining > 0; batch++ {
			size := min(remaining, batchSize)
			input["count"] = size
			input["taskId"] = fmt.Sprintf("%s-%s-%d", id, module, batch)
			input["moduleHint"] = configuredModuleHint(input, stringValue(input["taskType"], ""), module)
			path, err := q.generateImage(ctx, id, input, len(images)+1, module, run)
			if err != nil {
				return images, attribution, fmt.Errorf("模块 %s 第 %d 批生成失败：%w", moduleLabel(module), batch, err)
			}
			images = append(images, path)
			attribution = append(attribution, module)
			remaining--
		}
	}
	return images, attribution, nil
}

func (q *taskQueue) imageClient(input map[string]any) imageProvider {
	if client, ok := input["protocolClient"].(imageProvider); ok {
		return client
	}
	return q.server.provider
}

func (q *taskQueue) waitForImages(id, remoteID string, client imageProvider) ([]string, error) {
	return q.waitForImagesContext(context.Background(), id, remoteID, client)
}

func (q *taskQueue) waitForImagesContext(parent context.Context, id, remoteID string, client imageProvider) ([]string, error) {
	timeout := generationPollTimeout(runtimeconfig.Env("GENERATION_POLL_TIMEOUT_SECONDS", ""))
	ctx, cancel := context.WithTimeout(parent, timeout)
	defer cancel()
	images, err := pollProviderImages(ctx, id, remoteID, client, 5*time.Second)
	if errors.Is(err, context.DeadlineExceeded) {
		return nil, fmt.Errorf("等待供应商结果超时（等待上限 %d 秒）：%w", int(timeout/time.Second), err)
	}
	return images, err
}

func generationPollTimeout(raw string) time.Duration {
	seconds, err := strconv.Atoi(raw)
	if err != nil || seconds < 1 {
		return defaultGenerationPollTimeout
	}
	return time.Duration(min(seconds, 3600)) * time.Second
}

// The deadline covers both waits and HTTP polls, regardless of how many queries run.
func pollProviderImages(ctx context.Context, id, remoteID string, client imageProvider, interval time.Duration) ([]string, error) {
	lastPollError := ""
	for {
		timer := time.NewTimer(interval)
		select {
		case <-ctx.Done():
			timer.Stop()
			if lastPollError != "" {
				return nil, fmt.Errorf("最后一次查询错误：%s：%w", lastPollError, ctx.Err())
			}
			return nil, ctx.Err()
		case <-timer.C:
		}
		result, err := client.Poll(ctx, remoteID)
		if err != nil {
			lastPollError = err.Error()
			fmt.Printf("task %s provider poll failed: %s\n", id, publicGenerationError(err.Error()))
			continue
		}
		switch result.Status {
		case "success", "succeeded", "completed":
			if len(result.Images) == 0 {
				return nil, fmt.Errorf("供应商返回成功状态，但没有生成图片")
			}
			return result.Images, nil
		case "failed", "cancelled", "expired":
			if result.Error != "" {
				return nil, fmt.Errorf("%s", result.Error)
			}
			return nil, fmt.Errorf("供应商返回失败状态，但未提供错误详情")
		}
	}
}

func (s *Service) attachSourceImages(input map[string]any) error {
	if s.db == nil {
		return nil
	}
	images := make([]map[string]string, 0, 4)
	type sourceAsset struct{ id, role string }
	assets := []sourceAsset{}
	clothing := stringValue(input["taskType"], "") == "clothing-set"
	for _, key := range []string{"productAssetIds", "referenceAssetIds"} {
		ids, _ := input[key].([]any)
		for _, id := range ids {
			role := "reference"
			if key == "productAssetIds" {
				role = "product"
			}
			if clothing {
				role = "garment"
			}
			assets = append(assets, sourceAsset{stringValue(id, ""), role})
		}
	}
	if clothing {
		for _, key := range []struct{ name, role string }{{"modelAssetId", "model"}, {"sceneAssetId", "scene"}} {
			if id := stringValue(input[key.name], ""); id != "" {
				assets = append(assets, sourceAsset{id, key.role})
			}
		}
	}
	totalBytes := 0
	for _, asset := range assets {
		var storageKey, mime string
		if err := s.db.QueryRow("SELECT storage_key,mime FROM assets WHERE id=$1", asset.id).Scan(&storageKey, &mime); err != nil {
			return fmt.Errorf("无法读取任务素材")
		}
		file, err := s.storage.Open(storageKey)
		if err != nil {
			return fmt.Errorf("任务素材文件不存在")
		}
		data, readErr := io.ReadAll(io.LimitReader(file, 10<<20+1))
		_ = file.Close()
		if readErr != nil || len(data) == 0 || len(data) > 10<<20 {
			return fmt.Errorf("任务素材读取失败")
		}
		totalBytes += len(data)
		if totalBytes > 20<<20 {
			return fmt.Errorf("任务素材总大小不能超过 20MB")
		}
		image := map[string]string{"mime": mime, "data": base64.StdEncoding.EncodeToString(data)}
		if asset.role != "" {
			image["role"] = asset.role
		}
		images = append(images, image)
	}
	if len(images) > 0 {
		input["sourceImages"] = images
	}
	return nil
}

func (s *Service) taskInput(id string) (map[string]any, bool) {
	if s.db != nil {
		var raw []byte
		if s.db.QueryRow("SELECT input FROM generation_tasks WHERE id=$1", id).Scan(&raw) != nil {
			return nil, false
		}
		var input map[string]any
		if json.Unmarshal(raw, &input) != nil {
			return nil, false
		}
		return maps.Clone(input), true
	}
	s.mu.RLock()
	defer s.mu.RUnlock()
	t, ok := s.tasks[id]
	if !ok {
		return nil, false
	}
	input, ok := t.Input.(map[string]any)
	if !ok {
		return nil, false
	}
	// 队列会为每次单图调用临时覆写 count、taskId、moduleHint，并附加
	// sourceImages。内存存储模式也必须返回副本，否则任务详情和重试参数会被
	// 最后一次供应商请求污染（例如用户选 10 张，任务 input 最终会变成 1 张）。
	return maps.Clone(input), true
}
