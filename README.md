# iStudio

面向国内和跨境电商团队的 AI 图片创作平台。

## 目录结构

```text
apps/web     Next.js 用户端（独立 pnpm 项目）
apps/server  Go API server
docker       Docker Compose（PostgreSQL / Redis / API / Web）
ui           Appica Nova 版前端（保留原路由与业务逻辑的换肤版）
UI-1         灯箱与工单版前端（无落地页，首页即工作台）
UI-2         柔光台版前端（浅色玻璃 + 柔和彩色，先做生成页与登录页）
UI-3         黑白工坊版前端（黑白主题 + 柠檬黄点缀，先做生成页与登录页）
UI-4         Studio Calm 版前端（简约大气、雾蓝与薄荷色点缀，当前只设计生图主页）
```

## 本地开发

### 前后端一键启动（dev.sh）

```bash
./dev.sh              # 前端 http://127.0.0.1:3000 + API http://127.0.0.1:4000
./dev.sh --infra      # 顺带用 Docker 起 postgres / redis（数据持久化）
./dev.sh --web-port 3100 --api-port 4100   # 自定义端口（会自动放行 CORS 来源）
./dev.sh --no-install # 跳过 pnpm install
```

脚本会做的事：检查 `go`/`node`/`pnpm` 与端口占用、探测 Postgres/Redis 是否可达（连不上会说明会降级成内存存储 / 进程内队列）、编译后端二进制后与 Next dev 一起启动，日志分别带 `[api]` / `[web]` 前缀；按 `Ctrl+C` 同时停掉两端并释放端口。

### Docker 一键启动（推荐）

```bash
cd docker
docker compose up --build
```

同时启动 PostgreSQL、Redis、Go API 和 Next.js Web。默认端口：

| 服务 | 端口 |
| --- | --- |
| Web | `33000` |
| API | `44000` |
| PostgreSQL | `55432` |
| Redis | `56379` |

可通过环境变量覆盖（`WEB_PORT`、`API_PORT`、`POSTGRES_PORT`、`REDIS_PORT`）。前台运行时按 `Ctrl+C` 停止整组服务；数据保存在 Docker volumes 中，下次启动仍保留。

### 前端单独开发

```bash
cd apps/web
pnpm install
pnpm dev
```

默认运行在 http://127.0.0.1:3000。

### 后端

```bash
cd apps/server
cp .env.example .env   # 配置数据库、认证等部署参数；AI 服务在 Web 中填写
go run .
```

启动后用首个注册账号进入 `/settings/ai`，配置 Prompt AI 和 Image AI 的协议、Base URL、API Key、Model、超时并启用。每种用途自动选择一个默认 Endpoint，也可以手动切换；删除或禁用默认项会自动选取另一个启用项。其他账号可使用这些服务，只允许首个账号管理全局配置。

Prompt AI 支持 OpenAI Compatible Chat；Image AI 支持 OpenAI Image API（生成与 multipart 编辑）和 Gemini generateContent。模型名是自由字符串，同一协议客户端适用于官方、自建或中转地址。OpenAI Chat 的 Base URL 可为服务的版本根路径（例如 `https://api.openai.com/v1` 或 `https://api.deepseek.com`）；OpenAI Image 使用 `/v1` 版本根路径；Gemini 可填服务根地址或 `/v1beta`。工作台读取已启用 Endpoint，不再限制固定模型名单。

Prompt 配置页可编辑通用、电商系统提示词和四种电商任务模板，支持启用、保存、查看与恢复默认。初始化仅补齐缺失模板并更新默认内容，保留用户已保存的内容。Prompt Endpoint 的 Vision capability 控制图片输入；关闭时前端只发送文字，后端拒绝图片请求。

API Key 在后端用 AES-256-GCM 加密存储，响应仅返回配置状态和尾四位掩码。未设置 `AI_CONFIG_ENCRYPTION_KEY` 时，自动生成 `STORAGE_ROOT/.ai/encryption.key`（权限 0600）。备份或迁移数据库时必须同时保存此文件；多实例应使用同一个 32 字节 Base64 密钥。Docker 已挂载 `STORAGE_ROOT`，密钥会随该目录持久保存。无 PostgreSQL 时，AI 设置回退到 `STORAGE_ROOT/.ai/config.json` 的加密本地存储；账号、素材等仍遵循现有内存降级行为。

首次初始化且没有 Endpoint 时，旧 `DEEPSEEK_*` 自动迁移为 `openai_chat`，旧 `BANANA_ROUTER_*` 自动迁移为两个图片协议对应的旧模型配置（保留 GPT 默认值及异步路径）。迁移标记避免启动重复创建，之后以数据库为主。旧部署导入的 `capabilities.async` 保留异步图片扩展；新配置使用标准同步 OpenAI Image API。BananaRouter 仅作为旧变量名称存在。

“测试连接”会真实调用所选协议与模型，图片测试会生成一张图片并可能产生费用。自动回归使用本地模拟服务，不发起付费请求。

## 交付验证

```bash
cd apps/web && pnpm typecheck && pnpm test && pnpm build
GOCACHE=/tmp/istudio-go-cache go -C apps/server test -race ./...
```

后端在启动时执行 `apps/server/migrations/001_ai_configuration.sql`，新增 `ai_endpoints`、`prompt_templates` 与 `schema_migrations`（首次导入标记）。新增接口：

- `GET/POST /v1/ai-endpoints`
- `PUT/DELETE /v1/ai-endpoints/:id`
- `POST /v1/ai-endpoints/:id/test`
- `POST /v1/ai-endpoints/:id/default`
- `GET/PUT /v1/prompt-templates`（PUT 可传 `restoreDefault: true`）
