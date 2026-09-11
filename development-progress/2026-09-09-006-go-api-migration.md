# 006 Go API 后端切换

> 日期：2026-09-09  
> 状态：已完成

## 决策

- 后端从 NestJS 切换为 Golang。
- 前端继续使用 Next.js，API 保持 `/v1` 路径和现有 JSON 契约。
- MVP 不支持游客模式，账号密码登录保留。

## 实现内容

- 新增 `apps/server` Go 模块（Go 1.25）。
- 使用标准库 `net/http` 实现健康检查、认证、模型能力和生成任务接口。
- 注册/登录使用 Argon2id 密码哈希，JWT 使用 HMAC 签名。
- Go API 默认监听 `127.0.0.1:4000`，兼容现有 Web 配置。
- 根命令 `pnpm dev:api` 已切换到 Go；NestJS 保留为 `pnpm dev:api-nest` 迁移参考。
- 保留 Docker PostgreSQL/Redis 配置，数据库 Repository 下一阶段接入。

## 验证结果

- `go test ./...` 通过。
- `go build ./...` 通过。
- Go API 健康检查、账号注册、模型能力接口已通过本地 HTTP 验证。
- 未调用 AI 接口，不需要 API Key。

## 限制

- 当前用户和任务仍使用内存 Map，重启会丢失数据。
- PostgreSQL 持久化、迁移、Redis 队列尚未接入。
- 原 `apps/api` NestJS 服务已删除；后续后端统一维护在 `apps/server`。
