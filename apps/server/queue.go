package main

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"sort"
	"strings"
	"time"

	"github.com/redis/go-redis/v9"
)

type taskQueue struct {
	redis    *redis.Client
	fallback chan string
	server   *server
}

func newTaskQueue(s *server) *taskQueue {
	q := &taskQueue{fallback: make(chan string, 100), server: s}
	if options, err := redis.ParseURL(env("REDIS_URL", "redis://127.0.0.1:6379")); err == nil {
		client := redis.NewClient(options)
		if client.Ping(context.Background()).Err() == nil {
			q.redis = client
		}
	}
	go q.worker()
	return q
}

func (q *taskQueue) enqueue(id string) {
	if q.redis != nil {
		if q.redis.LPush(context.Background(), "istudio:generation", id).Err() == nil {
			return
		}
	}
	select {
	case q.fallback <- id:
	default:
		fmt.Printf("queue full, task %s remains queued\n", id)
	}
}

func (q *taskQueue) worker() {
	for {
		var id string
		if q.redis != nil {
			values, err := q.redis.BRPop(context.Background(), 3*time.Second, "istudio:generation").Result()
			if err == nil && len(values) == 2 {
				id = values[1]
			}
			if id == "" {
				select {
				case id = <-q.fallback:
				default:
				}
			}
		} else {
			id = <-q.fallback
		}
		if id == "" {
			continue
		}
		q.server.updateTaskStatus(id, "processing")
		if q.server.provider == nil {
			q.server.updateTaskResult(id, "failed", nil, nil, "AI 服务尚未配置")
			continue
		}
		input, ok := q.server.taskInput(id)
		if !ok {
			q.server.updateTaskResult(id, "failed", nil, nil, "无法读取任务参数")
			continue
		}
		if err := q.server.attachSourceImages(input); err != nil {
			q.server.updateTaskResult(id, "failed", nil, nil, err.Error())
			continue
		}
		images, modules, err := q.generateBatches(id, input)
		if err != nil {
			fmt.Printf("task %s generation failed: %v\n", id, err)
			q.server.updateTaskResult(id, "failed", nil, nil, err.Error())
			continue
		}
		paths, err := q.server.persistGeneratedImages(id, images)
		if err != nil {
			q.server.updateTaskResult(id, "failed", nil, nil, err.Error())
			continue
		}
		q.server.updateTaskResult(id, "succeeded", paths, modules, "")
	}
}

// generateBatches 返回图片列表与逐图模块归属（modules[i] 为 images[i] 所属模块 key，
// 非模块化生成时为空切片）。两者按下标一一对应。
func (q *taskQueue) generateBatches(id string, input map[string]any) ([]string, []string, error) {
	if counts := customModuleCounts(input); len(counts) > 0 {
		return q.generateModuleBatches(id, input, counts)
	}
	images, err := q.generateLinearBatches(id, input)
	if err != nil {
		return nil, nil, err
	}
	return images, make([]string, len(images)), nil
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

func (q *taskQueue) generateLinearBatches(id string, input map[string]any) ([]string, error) {
	remaining := intValue(input["count"], 1)
	batchSize := 4
	if strings.HasPrefix(stringValue(input["model"], ""), "gemini-") {
		batchSize = 1
	}
	images := make([]string, 0, remaining)
	for batch := 1; remaining > 0; batch++ {
		size := min(remaining, batchSize)
		input["count"] = size
		input["taskId"] = fmt.Sprintf("%s-%d", id, batch)
		q.server.updateTaskStatus(id, "processing")
		remote, err := q.server.provider.Submit(context.Background(), input)
		if err != nil {
			return nil, fmt.Errorf("第 %d 批提交失败：%w", batch, err)
		}
		batchImages := remote.Images
		if len(batchImages) == 0 {
			q.server.updateTaskStatus(id, "waiting_provider")
			batchImages, err = q.waitForImages(id, remote.ID)
			if err != nil {
				return nil, fmt.Errorf("第 %d 批生成失败：%w", batch, err)
			}
		}
		if len(batchImages) != size {
			return nil, fmt.Errorf("第 %d 批预期 %d 张，供应商实际返回 %d 张", batch, size, len(batchImages))
		}
		images = append(images, batchImages...)
		remaining -= size
	}
	return images, nil
}

// generateModuleBatches 按模块逐个生成，每个模块批次注入专属 moduleHint，
// 使不同模块产出构图差异化的图片，而非全部共用同一个 prompt。
// 返回值第二项为逐图模块归属，与图片列表按下标一一对应。
func (q *taskQueue) generateModuleBatches(id string, input map[string]any, counts map[string]int) ([]string, []string, error) {
	batchSize := 4
	if strings.HasPrefix(stringValue(input["model"], ""), "gemini-") {
		batchSize = 1
	}
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
			input["moduleHint"] = moduleHints[module]
			q.server.updateTaskStatus(id, "processing")
			remote, err := q.server.provider.Submit(context.Background(), input)
			if err != nil {
				return nil, nil, fmt.Errorf("模块 %s 第 %d 批提交失败：%w", module, batch, err)
			}
			batchImages := remote.Images
			if len(batchImages) == 0 {
				q.server.updateTaskStatus(id, "waiting_provider")
				batchImages, err = q.waitForImages(id, remote.ID)
				if err != nil {
					return nil, nil, fmt.Errorf("模块 %s 第 %d 批生成失败：%w", module, batch, err)
				}
			}
			if len(batchImages) != size {
				return nil, nil, fmt.Errorf("模块 %s 第 %d 批预期 %d 张，供应商实际返回 %d 张", module, batch, size, len(batchImages))
			}
			images = append(images, batchImages...)
			for range batchImages {
				attribution = append(attribution, module)
			}
			remaining -= size
		}
	}
	return images, attribution, nil
}

func (q *taskQueue) waitForImages(id, remoteID string) ([]string, error) {
	lastPollError := ""
	for attempt := 0; attempt < 24; attempt++ {
		time.Sleep(5 * time.Second)
		result, err := q.server.provider.Poll(context.Background(), remoteID)
		if err != nil {
			lastPollError = err.Error()
			fmt.Printf("task %s provider poll failed: %v\n", id, err)
			continue
		}
		switch result.Status {
		case "success":
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
	if lastPollError != "" {
		return nil, fmt.Errorf("等待供应商结果超时；最后一次查询错误：%s", lastPollError)
	}
	return nil, fmt.Errorf("等待供应商结果超时，请稍后重试")
}

func (s *server) attachSourceImages(input map[string]any) error {
	if s.db == nil {
		return nil
	}
	images := make([]map[string]string, 0, 4)
	totalBytes := 0
	for _, key := range []string{"productAssetIds", "referenceAssetIds"} {
		assetIDs, _ := input[key].([]any)
		for _, value := range assetIDs {
			assetID, _ := value.(string)
			var storageKey, mime string
			if err := s.db.QueryRow("SELECT storage_key,mime FROM assets WHERE id=$1", assetID).Scan(&storageKey, &mime); err != nil {
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
			images = append(images, map[string]string{"mime": mime, "data": base64.StdEncoding.EncodeToString(data)})
		}
	}
	if len(images) > 0 {
		input["sourceImages"] = images
	}
	return nil
}

func (s *server) taskInput(id string) (map[string]any, bool) {
	if s.db != nil {
		var raw []byte
		if s.db.QueryRow("SELECT input FROM generation_tasks WHERE id=$1", id).Scan(&raw) != nil {
			return nil, false
		}
		var input map[string]any
		if json.Unmarshal(raw, &input) != nil {
			return nil, false
		}
		return input, true
	}
	s.mu.RLock()
	defer s.mu.RUnlock()
	t, ok := s.tasks[id]
	if !ok {
		return nil, false
	}
	input, ok := t.Input.(map[string]any)
	return input, ok
}
