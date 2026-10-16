# 开发指南

前端是独立的 Next.js / React 项目，后端是 Go / Gin 服务。前后台是两个独立项目，根目录直接使用 `server` / `web`；接口继续使用 `/v1` 路径及原有 JSON 字段。

## 后端

后端采用 Go 官方服务端项目建议的 `cmd` / `internal` 结构，保留一个 Go module。`cmd/server/main.go` 只处理进程退出；`internal/app` 负责配置加载、部署命令和依赖组装。参考 [Go 官方模块组织建议](https://go.dev/doc/modules/layout)。

| 包                     | 职责                                                                     |
| ---------------------- | ------------------------------------------------------------------------ |
| `cmd/server`           | 可执行程序入口，API、管理员命令和灵感导入共用同一二进制                  |
| `internal/app`         | 读取运行配置、连接数据库、执行迁移、创建业务服务并启动 API / Worker      |
| `internal/httpapi`     | Gin 显式路由、HTTP 方法、CORS、异常恢复、后台鉴权与审计中间件、JSON 响应 |
| `internal/studio`      | 创作、积分、资产、个人提示词、AI 配置与运营后台的业务协调                |
| `internal/domain`      | 用户、资产、生成任务与结算数据；不依赖 HTTP、SQL 或第三方 SDK            |
| `internal/repository`  | 账户、任务、资产、分类与管理员授权的数据访问；支持调用方传入事务         |
| `internal/database`    | PostgreSQL 连接、健康状态、内嵌 SQL 迁移                                 |
| `internal/auth`        | 用户名与密码处理、令牌签发与验证、凭据版本、持久化签名密钥               |
| `internal/storage`     | 本地存储、多云适配、签名 URL、按原存储配置解析对象                       |
| `internal/config`      | `.env` 加载、环境变量优先级和运行参数                                    |
| `internal/inspiration` | Markdown 案例解析、文本规范化与批量导入                                  |
| `internal/idgen`       | 业务标识生成                                                             |

依赖从入口流向业务和基础包。`app` 组装 `studio.Dependencies`，`studio` 将业务操作注入 `httpapi.Handlers`；路由包通过函数回调完成鉴权与审计，不导入数据库、存储或业务实现。存储路由通过小接口 `ProfileSource` 获取配置，不依赖整个业务服务。

业务处理函数使用 `http.ResponseWriter` / `*http.Request`，由 Gin 路由接入；上传、文件流与 ZIP 下载共用这一套处理函数。业务内部类型继续保持私有；跨包共享的业务模型放在 `domain`，仅某个接口使用的请求 / 响应类型保留在所属模块。

`studio` 中保留需要一起维护的积分、任务与资产事务。数据访问方法允许使用现有 `sql.Tx`；新增功能不得把同一事务拆成多个分别提交的调用，也不得在 HTTP 层直接触发重复生图。SQL 迁移移至 `internal/database/migrations`，按编号顺序内嵌执行；迁移沿用幂等升级方式；`010_admin_identity.sql` 一次性拆分后台身份，并保留前台数据。

部署配置位于 `server/.env`；从仓库根目录运行时不会回退读取根目录 `.env`。默认本地图片目录为 `server/storage/uploads`。业务包不在导入时连接数据库或启动 Worker。服务默认使用 Gin release 模式，本地可通过 `GIN_MODE=debug` 输出路由表；登录限流继续使用显式代理策略，异常恢复日志不输出请求头或正文。

新增接口时，在 `httpapi` 的对应资源分组声明具体方法和路径，并在 `studio/routes.go` 接入业务操作。后台权限覆盖未匹配路径和不支持的方法；旧管理接口同样只接受独立后台会话，`/v1/admin/auth/login` 和 `/v1/admin/auth/me` 负责后台登录与会话。积分预估接口使用 `GET /v1/generation/quote`，只读价格和余额，不创建任务或预留积分。

```bash
# 在 server 下执行
make run                         # go run ./cmd/server
make build                       # bin/istudio-server
make fmt                         # 格式化 cmd 和 internal
make check                       # 格式、go vet、竞态测试

go run ./cmd/server --help
go run ./cmd/server admin --username your_username --password-stdin
go run ./cmd/server seed-inspiration -h
```

测试与实现同包放置，HTTP 流程通过实际 Gin 路由回归；数据库测试通过 `TEST_DATABASE_URL` 启用，使用独立 schema 并自动清理，不读取正在运行的业务 AI 配置。命令和配置测试不连接业务服务，存储适配测试使用模拟 HTTP 客户端。

```bash
TEST_DATABASE_URL='postgresql://istudio:istudio_dev@127.0.0.1:55432/istudio?sslmode=disable' \
  make -C server check
```

Docker 和 `dev.sh` 已使用 `./cmd/server` 构建，容器内二进制仍为 `istudio-server`。`CGO_ENABLED=0` 构建继续可用。

## 前端

`app` 负责路由和页面组合，`components` 负责界面与交互，`lib` 负责 API、数据契约和纯函数。

- `components/assets/`：作品卡片、任务卡片和图片预览。资产页保留请求取消、筛选、分页与批量操作的协调。
- `components/admin/`：模型列表与编辑、余额编辑、运营表单、概览和报表。`lib/admin.ts` 统一后台数据类型与请求入口，页面控制器处理提交反馈和刷新。
- `components/workbench/`：工作台设置、素材、结果、历史和任务恢复。
- 下拉框沿用共享 `Select`，弹窗沿用现有焦点管理，不新增独立样式体系。

前台私有 JSON 请求使用 `lib/frontend-request.ts`，只携带前台会话；后台请求使用 `lib/admin.ts` 中的 `adminRequest` / `adminFetch`，固定访问 `/v1/admin/` 并使用独立管理员会话。请求路径会校验所属资源，不能通过同一个函数自动猜测使用哪个账号。网站名称、Logo、公开模型列表和已启用的公共灵感是公开只读数据；网站品牌的写入实现在 `lib/admin-site-settings.ts`，不进入前台页面的依赖图。

后台布局使用 `OverlayRoot` 提供弹窗和下拉菜单的挂载容器，确保 Portal 保留后台的样式与颜色变量；原生 `dialog` 和 `popover` 内的下拉菜单仍优先挂载到当前弹层。`useDialogFocus` 只遍历可见、可交互的控件，并把内层原生弹窗的 Escape 交给浏览器处理。

所有前端源码使用同一份 Prettier 配置；TypeScript 同时检查未使用的导入、局部变量和参数。不要将 JSX 压成整行，组件按职责拆分，数据请求与余额变更留在所属控制器中。

```bash
pnpm -C web format
pnpm -C web format:check
pnpm -C web typecheck
pnpm -C web test
pnpm -C web build
```

`typecheck` 会先通过 `next typegen` 生成路由类型，首次检出或清理构建产物后也可直接运行，无需先执行完整构建。`pnpm -C web clean` 清理前端构建目录、旧开发缓存及 TypeScript 缓存；后端 `make -C server clean` 清理本地编译的二进制。依赖目录与运行数据保留。

## 测试文件与运行数据

Go 的 `*_test.go` 与前端 `*.test.ts` / `*.test.tsx` 保留在实现旁边。测试生成的截图、样例图片、原始结果与覆盖率报告统一放在根目录 `test/artifacts/`；Vitest 覆盖率输出使用 `test/artifacts/coverage/web/`，仅配置输出位置，不自动开启覆盖率或调用 AI。检查报告放在 `test/reports/`，独立界面原型放在 `test/previews/`，本地数据库备份放在 `test/backups/`。具体内容见 [测试目录](../test/README.md)。

`test/artifacts/` 和 `test/backups/` 不提交 Git；整个 `test/` 不进入 Docker 构建上下文。`.next/`、`server/bin/` 等可重建产物仍遵循工具默认位置，依靠忽略规则和清理命令管理。上传图片、配置密钥及业务数据继续保存在 `server/storage/uploads/` 和数据库中，不作为测试文件整理。

## 样式

`app/globals.css` 与 `app/studio.css` 是样式入口，分别按顺序导入 `styles/base` 和 `styles/studio`。拆分保留原有 CSS 规则与层叠顺序；`app/layout.tsx` 的入口顺序也保持一致。

基础主题、创作表单、结果、资产、历史和弹窗位于 `styles/base`；应用框架、输入栏、设置和画布的工作台样式位于 `styles/studio`。独立功能继续使用 `library.css`、`operations.css`、`prompt-reverse.css`。

修改既有规则时先在所属文件定位选择器，避免不断向入口末尾追加覆盖。调整导入次序或跨文件移动选择器需要核对层叠关系，并验证桌面、小屏和深色模式；构建成功不能替代这些界面检查。

安全检查：后端使用 Go 1.26.9（`go.mod` 工具链和 Docker 镜像固定版本），运行 `govulncheck ./...`；前端运行 `pnpm audit`。更新依赖后同步锁定文件并完成构建与业务回归。
