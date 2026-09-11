package main

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
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
			q.server.updateTaskResult(id, "failed", nil, "AI 服务尚未配置")
			continue
		}
		input, ok := q.server.taskInput(id)
		if !ok {
			q.server.updateTaskResult(id, "failed", nil, "无法读取任务参数")
			continue
		}
		if err := q.server.attachSourceImages(input); err != nil {
			q.server.updateTaskResult(id, "failed", nil, err.Error())
			continue
		}
		input["taskId"] = id
		remote, err := q.server.provider.Submit(context.Background(), input)
		if err != nil {
			fmt.Printf("task %s provider submit failed: %v\n", id, err)
			q.server.updateTaskResult(id, "failed", nil, err.Error())
			continue
		}
		if len(remote.Images) > 0 {
			images, persistErr := q.server.persistGeneratedImages(id, remote.Images)
			if persistErr != nil {
				q.server.updateTaskResult(id, "failed", nil, persistErr.Error())
				continue
			}
			q.server.updateTaskResult(id, "succeeded", images, "")
			continue
		}
		q.server.updateTaskStatus(id, "waiting_provider")
		finished := false
		lastPollError := ""
		for attempt := 0; attempt < 24; attempt++ {
			time.Sleep(5 * time.Second)
			result, pollErr := q.server.provider.Poll(context.Background(), remote.ID)
			if pollErr != nil {
				lastPollError = pollErr.Error()
				fmt.Printf("task %s provider poll failed: %v\n", id, pollErr)
				continue
			}
			switch result.Status {
			case "success":
				if len(result.Images) == 0 {
					q.server.updateTaskResult(id, "failed", nil, "供应商返回成功状态，但没有生成图片")
					finished = true
					attempt = 24
					continue
				}
				images, persistErr := q.server.persistGeneratedImages(id, result.Images)
				if persistErr != nil {
					q.server.updateTaskResult(id, "failed", nil, persistErr.Error())
					finished = true
					attempt = 24
					continue
				}
				q.server.updateTaskResult(id, "succeeded", images, "")
				finished = true
				attempt = 24
			case "failed", "cancelled", "expired":
				message := result.Error
				if message == "" {
					message = "供应商返回失败状态，但未提供错误详情"
				}
				fmt.Printf("task %s provider returned %s: %s\n", id, result.Status, message)
				q.server.updateTaskResult(id, "failed", nil, message)
				finished = true
				attempt = 24
			}
		}
		if !finished {
			message := "等待供应商结果超时，请稍后重试"
			if lastPollError != "" {
				message += "；最后一次查询错误：" + lastPollError
			}
			q.server.updateTaskResult(id, "failed", nil, message)
		}
	}
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
