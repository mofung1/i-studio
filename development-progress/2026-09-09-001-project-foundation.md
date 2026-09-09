# 001 正式项目工程基础与首个工作台闭环

> 日期：2026-09-09  
> 状态：已完成

## 目标

- 建立正式 Monorepo 工程，不直接把 `UI/` 演示项目当作生产代码。
- 搭建 Web、API、共享 UI、共享业务契约和本地基础设施。
- 实现无需 AI Key 的任务首页、统一工作台和生成参数校验基础。

## 本次范围

- `apps/web`：Next.js 用户端。
- `apps/api`：NestJS API，提供健康检查、生成能力和参数校验接口。
- `packages/ui`：shadcn/ui 风格的源码级基础组件。
- `packages/contracts`：通用生图及四类商品图的 Zod 参数契约。
- `packages/config`：共享 TypeScript 配置。
- `infra/docker`：PostgreSQL 与 Redis 本地开发配置。

## 明确不在本次范围

- BananaRouter 真实调用、图片上传和对象存储。
- 登录、点数扣费、支付和生产数据库迁移。
- 无限画布、管理后台和 Worker 任务执行。

## 待确认

- 当前未接入 AI 生图，不需要 API Key。
- 后续接入 BananaRouter 前，需要确认 API Key、具体生图模型、文生图/图生图接口路径、请求参数和输出格式；如启用视觉理解、抠图、安全审核，也需分别确认对应接口。

## 验证结果

- `pnpm build` 通过：contracts、ui、api、web 均构建成功。
- `pnpm test` 通过：contracts 3 个测试通过，其余工作区以 `--passWithNoTests` 通过。
- Next.js 路由成功生成 `/` 与 `/workbench`。
- 已启动并验收 Web：`http://127.0.0.1:3000/`。
- 浏览器验收通过：首页、通用工作台、商品工作台及商品场景图任务均可打开；商品任务切换、参数显隐、默认左侧配置面板均符合当前原型决策。
- `pnpm --filter @istudio/api exec prisma validate` 未完成：Prisma 需要从 `binaries.prisma.sh` 下载引擎，当前环境 DNS 无法解析；尚未执行数据库迁移或生成 Client。
- AI 调用保持关闭（`aiEnabled: false`），页面不会产生真实调用或费用。

## 下一步

1. 启动 Web/API 做浏览器验收。
2. 在确认数据库环境后完成 Prisma Client 生成与首个 migration。
3. 开始 Auth/游客模式、上传资产和生成任务 API。
4. 接入 BananaRouter 前先向产品确认 Key 与接口参数，不对不支持的参数静默降级。
