# 002 生成任务 API 与前端提交闭环

> 日期：2026-09-09  
> 状态：已完成

## 目标

让工作台在不接入 AI 的前提下具备可演示的“参数校验 -> 创建任务 -> 返回任务状态”流程。

## 实现内容

- 新增 `POST /v1/generation/tasks`：复用共享 Zod 契约校验参数，创建内存任务并返回任务 ID。
- 新增 `GET /v1/generation/tasks/:id`：查询任务状态。
- 任务初始状态为 `queued`，明确返回 `aiEnabled: false`，不会调用供应商或产生费用。
- 工作台“创建生成任务”按钮接入 API；API 不可用时仍显示参数校验结果，不阻塞原型演示。
- 修复 contracts 包 ESM/CommonJS 兼容问题，使 Nest API 可正常启动。

## 文件范围

- `apps/api/src/generation/generation.controller.ts`
- `packages/contracts/package.json`
- `packages/contracts/tsconfig.json`
- `apps/web/components/workbench.tsx`

## 验证结果

- `pnpm build` 通过。
- `pnpm test` 通过（contracts 3 个测试通过）。
- Nest API 启动日志正常，已注册 `/v1/generation/tasks` 与 `/v1/generation/tasks/:id`。
- 当前沙箱不同命令会话之间无法互访本地监听端口，跨会话 `curl` 验证受限；不影响本机单会话运行。

## 遗留问题

- 任务目前存储在内存，进程重启后丢失；待 Prisma migration 和数据库环境可用后持久化。
- 尚未接入队列、SSE、上传资产和 AI 供应商。

## 下一步

实现资产上传的本地/对象存储抽象和任务持久化前置接口；接入 BananaRouter 前先确认 Key、模型和请求参数。
