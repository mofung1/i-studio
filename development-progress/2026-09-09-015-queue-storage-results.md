# 015 Redis 队列、对象存储与结果状态

> 日期：2026-09-09  
> 状态：已完成

## 实现内容

- 接入 go-redis，使用 Redis List 投递生成任务。
- Worker 更新任务状态：`queued -> processing -> waiting_provider`。
- Redis 不可用时提供有界内存队列降级。
- 增加 `objectStorage` 接口和本地文件实现，为 OSS/S3/MinIO 保留替换点。
- 增加鉴权资产内容接口 `/v1/assets/:id/content`。
- 项目资产页展示真实缩略图并支持下载。
- 任务详情页每 2 秒轮询状态，新增生成结果区域和未接入 AI 空状态。
- 补充旧数据库 `generation_tasks.project_id` 幂等 migration。

## 验证结果

- `go test ./...`、`go build ./...` 通过。
- Web TypeScript 检查通过。
- 测试任务成功写入 PostgreSQL，并由 Worker 更新为 `waiting_provider`。
- Web 首页已恢复并返回 HTTP 200。

## 接入确认点

真实 AI 执行器尚未启用。接入 BananaRouter 前需要确认 API Key、Base URL、接口路径、认证方式、请求/响应示例，以及四个模型的比例和分辨率能力。
