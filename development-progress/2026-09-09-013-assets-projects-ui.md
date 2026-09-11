# 013 项目资产前端与上传闭环

> 日期：2026-09-09  
> 状态：已完成

## 实现内容

- 新增 `/projects` 项目与资产管理页面。
- 支持创建项目、项目列表和资产列表。
- 支持图片上传进度展示（XHR progress）。
- 工作台增加所属项目选择器，项目 ID 随任务提交。
- Go 上传接口增加 JPG/PNG/WebP、10MB 限制。
- 上传文件计算 SHA-256 hash，并解析 JPEG/PNG 宽高；WebP 暂显示待解析。
- Asset 表增加 `width`、`height`、`hash` 字段。
- 新增本地存储根目录 `STORAGE_ROOT`，默认 `storage/uploads`。
- 任务详情页保留参数、状态和任务 ID 入口。

## 验证结果

- `go test ./...` 通过。
- `go build ./...` 通过。
- `pnpm build` 通过，`/projects` 路由成功生成。
- PostgreSQL migration 已包含资产元数据字段。

## 当前限制

- 对象存储目前是本地适配器，尚未接入 OSS/S3/MinIO。
- 队列 Worker 尚未启动，任务仍为 `queued`，不会调用 AI。
- 资产缩略图暂用占位展示，后续接入鉴权下载 URL。

## 下一步

- 实现对象存储接口和本地/MinIO 双实现。
- 引入 Redis 队列（Asynq）和任务状态 Worker。
- 在确认 BananaRouter API Key、模型和参数后接入 AI 执行器。
