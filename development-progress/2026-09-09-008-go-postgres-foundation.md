# 008 Go PostgreSQL 基础接入

> 日期：2026-09-09  
> 状态：已完成

## 实现内容

- `apps/server` 增加 pgx PostgreSQL 驱动。
- 增加数据库连接初始化，读取 `DATABASE_URL`。
- 启动时自动创建 `users`、`generation_tasks` 基础表。
- `/v1/health` 增加 `database` 状态字段：`ready`、`not_configured` 或 `unavailable`。
- 数据库不可用时保留内存降级，便于本地前端开发；不会静默认为已持久化。

## 验证结果

- `go mod tidy` 完成。
- `go test ./...` 通过。
- `go build ./...` 通过。

## 环境限制

- 已启动 Docker PostgreSQL，宿主机端口为 `55432`，Go server 健康检查返回 `database: ready`，自动建表成功。

## 下一步

- Docker PostgreSQL 可用后验证 migration。
- 将 AuthService 用户读写切换到 PostgreSQL。
- 将生成任务读写切换到 PostgreSQL，并增加用户鉴权关联。
