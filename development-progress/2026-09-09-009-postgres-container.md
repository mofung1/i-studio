# 009 PostgreSQL 容器连接验证

> 日期：2026-09-09  
> 状态：已完成

## 处理

- 发现宿主机 5432 已有其他 PostgreSQL 服务，且 Compose 容器未形成预期映射。
- Compose PostgreSQL 改为明确绑定 `127.0.0.1:55432:5432`，避免端口冲突。
- `.env.example` 的 `DATABASE_URL` 同步更新为 55432。
- 重新创建 PostgreSQL 容器并验证健康状态。

## 验证结果

- Go server 使用 PostgreSQL 连接成功。
- `/v1/health` 返回 `database: ready`。
- 启动 migration 自动创建 `users` 和 `generation_tasks` 表。

## 注意

- Redis 6379 已被本机已有实例占用，Compose Redis 未启动；后续可直接复用现有 Redis 或改用其他端口。
