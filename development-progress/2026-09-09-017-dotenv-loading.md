# 2026-09-09  Go 服务环境变量加载

- Go 服务启动时自动读取 `apps/server/.env`；从 `apps/server` 目录直接启动时读取当前目录的 `.env`。
- 已保留系统环境变量优先级，`.env` 不会覆盖已有环境变量。
- 使用方式：复制 `apps/server/.env.example` 为 `apps/server/.env`，填写 `BANANA_ROUTER_API_KEY` 后重启 Go 服务。
