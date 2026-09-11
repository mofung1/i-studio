# 007 server 目录切换与 Node API 清理

> 日期：2026-09-09  
> 状态：已完成

## 实现内容

- `apps/api-go` 重命名为 `apps/server`。
- Go module 更新为 `github.com/istudio/server`。
- 健康检查 service 名称更新为 `istudio-server`。
- `pnpm dev:api` 默认启动 `go run ./apps/server`。
- 删除已被 Go server 替代的旧 `apps/api` NestJS 服务。
- 保留前端 API 路径、端口和 JSON 响应契约不变。

## 验证结果

- `go test ./...` 通过。
- `go build ./...` 通过。
- Go API 已完成健康检查和账号注册 HTTP 验证。

## 下一步

- 接入 Docker PostgreSQL 和 Go 数据访问层。
- 将内存用户、项目、资产、生成任务替换为持久化存储。
