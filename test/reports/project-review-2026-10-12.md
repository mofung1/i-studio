# 项目检查记录 · 2026-10-12

检查范围：当前 `web`、`server`、本地启动脚本、Docker 配置、路由与旧 UI 引用。检查以本地个人部署为目标，并保留现有生图配置栏折叠行为。

## 已修复

| 位置 | 问题与修复 |
| --- | --- |
| `web/components/workbench/use-inspiration-prompts.ts` | 慢查询会阻止后续分类请求，旧结果可能覆盖新筛选。新筛选取消旧请求，只有当前请求可更新结果。 |
| `web/components/workbench.tsx` | 历史配置异步载入后立即重新生成会读取旧 React 状态。等待配置进入新一轮渲染再提交；载入失败不生成，过期的载入请求不回填。 |
| `web/components/workbench/use-generation-task.ts` | 切换工具后旧提交响应会污染新工作区。提交使用请求编号，在切换作用域或卸载后忽略旧响应；阻止重复提交。 |
| `web/components/workbench/use-generation-task.ts` | 一次任务状态查询失败会被误当作生图失败。保留服务端任务状态并重试查询。 |
| `server/internal/studio/provider.go` | 通用生图的风格和参考强度未进入模型请求。生成提示词会包含所选风格及有参考图时的参考强度说明。 |
| `server/queue.go` | 无 Redis 时空队列持续空转。改为阻塞等待；Redis 出错时限制重试频率。队列满时记录失败并返回明确错误。 |
| `server/validation.go` | 零或负数量被回退值误接收，部分枚举错误类型被默认为有效值；自定义模块可为空。补齐数量、类型、风格、参考强度、模块和需求长度校验。 |
| `server/internal/repository/records.go`、`server/internal/studio/generation_handlers.go` | 删除任务 / 资产缺少事务，单图删除未同步模块标签。事务提交后才删除文件，按相同图片索引过滤模块归属；生成中的任务禁止删除。 |
| `server/internal/studio/generated_assets.go` | 保存图片后写数据库失败会遗留文件。插入资产记录失败时清理已保存文件。 |
| `server/internal/auth/secret.go` | 未配置时所有部署共享固定签名密钥。改为创建并持久化随机密钥；保留显式配置的密钥。 |
| `web/app/login/page.tsx`、`lib/navigation.ts` | 登录缺少提交状态与自动填充信息；返回地址可通过反斜杠绕过相对路径判断。补齐表单反馈并用 URL 同源校验返回地址。 |
| `web/components/confirm-dialog.tsx`、`workbench/regenerate-dialog.tsx` | 确认弹窗初始焦点、焦点恢复和禁用按钮的 Tab 顺序不完整。统一焦点管理；删除默认聚焦取消，操作期间不能重复操作或关闭。 |
| `dev.sh`、`docker/docker-compose.yml` | 缺失配置在 `pipefail` 下会提前退出；自定义端口未同步 API 地址和 CORS；退出时可能误杀其他占用端口的进程。修复默认配置、端口联动及进程清理范围。 |
| `web/app/settings/ai/page.tsx` | Prompt 草稿切换设置分类时缺少提醒。补充确认及浏览器离开提醒；客户端路由的统一草稿拦截仍可继续完善。 |
| `web/components/workbench/result-workspace.tsx` | 下载失败会成为未处理的 Promise 拒绝。捕获失败并给出可重试反馈。 |
| 数据库测试 | 原删除测试直接使用运行环境 `DATABASE_URL` 并执行迁移。所有数据库回归改为专用测试变量和独立 schema。 |

## 已清理

- 删除未被启动、构建或当前页面引用的 `ui`、`UI-1`、`UI-2`、`UI-3`、`UI-4` 五套旧前端，共 245 个受版本控制文件。
- 删除废弃 `HomePage`、`HomePageV2`、首页背景存储工具及三张专属背景图片。
- 删除 `/home-v2` 和 `/skeleton-preview-temp` 路由。
- 移除 126 条旧首页 CSS 规则、专属变量与未使用动画，以及指向不存在 `packages/ui` 的 Tailwind 扫描配置。
- 保留真实路由的加载骨架、错误页导航、通用 UI 组件和运行数据。

## 后续设计问题

这些是已确认的架构边界，本轮未扩大为新的产品功能：

1. **队列部署边界**：Redis 的处理中列表恢复没有实例租约。应保持单 API 实例，不能用启动恢复机制协调多个同时运行的 API。进程内队列不具备重启恢复能力。
2. **历史完整分页**：资产页目前读取最近 50 条任务，历史抽屉按当前工具读取最近 40 条、全部范围读取最近 60 条；图片“加载更多”只展开已读取任务的图片。服务端支持 `limit`（最大 200），完整游标分页仍需补齐。
3. **生成快照**：占位张数已固定为提交时数量；画面比例和部分结果参数仍取可编辑配置。下一步宜保存完整提交快照，避免生成过程中改设置导致展示信息与原任务不一致。
4. **样式维护**：`globals.css` 和 `studio.css` 仍有多轮覆盖。旧首页已清理；进一步拆分样式应逐页进行视觉回归，避免全量重写影响当前布局。
5. **大图缓存**：受保护图片缓存按张数限制，未按总字节限制。大量高分辨率图片可能占用较多浏览器内存。

UI 检查参考：[Vercel Web Interface Guidelines](https://raw.githubusercontent.com/vercel-labs/web-interface-guidelines/main/command.md)。未将规范建议全部机械套用；本轮优先修复可复现的数据、交互与可访问性问题。

## 验证方式

- 前端 TypeScript、Vitest 和 Next.js 生产构建。
- 后端 `go test -race`、`go vet`；数据库测试只在独立 schema 内执行。
- 模拟接口的浏览器回归：生图折叠、历史重新生成、作用域切换、查询重试、灵感快速筛选、登录状态和弹窗键盘操作。
- 启动脚本语法、缺失配置与自定义端口模拟；Compose 默认和自定义端口解析。

测试不会调用已有配置中的真实付费 AI 服务。

本次结果：前端 17 项单元测试、类型检查与生产构建通过；后端含隔离 PostgreSQL 的 race 测试与 vet 通过；7 组交互回归及桌面 / 手机 / 横屏折叠回归通过；启动脚本和 Compose 端口联动检查通过。
