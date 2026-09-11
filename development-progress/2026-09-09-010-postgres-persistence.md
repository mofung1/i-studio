# 010 PostgreSQL 用户与任务持久化

> 日期：2026-09-09  
> 状态：已完成

## 实现内容

- Go server 新增 PostgreSQL 用户查询/写入 Repository。
- 注册和登录优先使用数据库，数据库不可用时才降级到内存。
- 生成任务创建和查询优先使用数据库，任务输入以 JSONB 保存。
- 保留统一错误码和响应格式，前端无需调整。

## 验证结果

- `go test ./...` 通过。
- `go build ./...` 通过。
- 账号注册成功后重启 Go server，使用同一账号登录成功。
- 生成任务成功写入 PostgreSQL，返回 `queued` 任务 ID。
- PostgreSQL 容器健康，Go server `/v1/health` 返回 `database: ready`。

## 限制

- 任务暂未关联登录用户 ID，后续鉴权中间件完成后补充用户隔离。
- 项目、资产、生成结果表尚未接入 Repository。
- AI 调用保持关闭。

## 下一步

- 增加 JWT 鉴权中间件和登录态校验。
- 实现资产上传（本地开发存储）及 Asset 表持久化。
