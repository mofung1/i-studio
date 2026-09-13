# 交给 Codex 的修复 Prompt

本文件包含三段可直接复制的 prompt，按批次使用。

- **Prompt A（第一批 · 止血）**：建议先跑这一条，改动集中在前端，风险低。
- **Prompt B（第二批 · 补闭环）**：涉及前后端与队列，A 验收后再跑。
- **Prompt C（第三批 · 计费与合规）**：大工程，最后跑。

使用前把工作目录切到 `/Users/mofung/Documents/product/i-studio`，确认 `pnpm dev:test` 能正常起服务（Web 3000 / API 4000）。

---

## Prompt A · 第一批（止血：拆掉假数据与误导性交互）

```text
你在 /Users/mofung/Documents/product/i-studio 这个仓库里工作。这是一个叫 iStudio 的 AI 电商图片创作平台：Next.js 15 前端（apps/web）+ Go API（apps/server）+ pnpm workspace。产品已有完整 PRD（docs/PRD-AI电商创作平台-MVP.md），当前主链路「上传 → 生成 → 下载」已经跑通，但界面里存在一批硬编码假功能和误导性交互，会让用户建立错误预期。

本次任务：清理这些假数据与假交互，修复几处流程断点。只做前端与极少量必要的后端改动，不要重构架构，不要引入新第三方依赖。

【全局约束】
1. 不新增 npm / Go 第三方依赖，只用仓库已有的（lucide-react、@istudio/ui、next、react）。
2. 保持现有视觉风格与 globals.css 的类名体系，不要重新设计布局、不要改颜色规范。
3. 界面文案一律简体中文，语气克制，不要营销腔。
4. 不要修改 docs/PRD-AI电商创作平台-MVP.md 和 UI/ 目录（UI/ 是设计原型，不是运行入口）。
5. 不要实现点数、计费、报价（那是后续批次）。
6. 每完成一个任务就跑一次 `pnpm --filter @istudio/web typecheck`，全部完成后跑下面的验收命令。

【任务 1 · 移除首页硬编码假数据】
文件：apps/web/components/home-page.tsx
- 第 87-93 行「最近项目」是写死的 "Aero H1 秋季上新 · 场景图 · 12 个资产 · 刚刚"，对任何用户都一样，点击进空工作台。改为：已登录时用 useEffect 调 GET /v1/projects（带 Authorization: Bearer token，token 从 localStorage 的 istudio-access-token 读取）取前 3 个项目真实渲染，项目卡片链接带上 projectId；未登录或没有项目时渲染空态引导（"还没有项目，先创建第一个" + 跳 /projects 的链接），绝对不要显示假项目。
- 第 95-102 行「发现灵感」三张图点击没有任何行为。给每张图加上 "即将上线" 的视觉标记并禁用点击（不要删掉这个模块，也不要假装有功能）。
- 参考 apps/web/app/projects/page.tsx 里已有的取数写法。

【任务 2 · 顶部导航的假控件】
文件：apps/web/components/top-navigation.tsx
- 第 28 行点数徽标 `1,280` 是写死数字，点击无反应。因为后端还没有计费能力，直接移除这个徽标（不要保留假数字）。
- 第 29 行通知铃铛没有功能、没有未读态。同样移除，或者在 aria-label 上标注 "即将上线" 并禁用。二选一，我倾向移除。
- 第 30 行头像写死字母 "M"。改为：已登录时调用 GET /v1/auth/me（后端已实现，返回 { authenticated, user }），用真实用户名首字符；未登录显示 "登录" 文字按钮跳 /login。

【任务 3 · 补上登出入口（当前完全没有）】
文件：apps/web/components/top-navigation.tsx
- 全仓库搜不到任何 logout 实现，用户无法退出。把第 30 行的头像按钮改成一个轻量下拉菜单：点击展开，显示当前用户名，下方一个「退出登录」项。
- 退出逻辑：移除 localStorage 的 istudio-access-token，然后跳转首页 `/` 并刷新。
- 需要键盘可达和点击外部区域关闭。

【任务 4 · 工作台的假 AI 功能】
文件：apps/web/components/workbench.tsx
- 第 339-344 行 improveDescription 只是把文本替换成一句固定文案，不能撤销，通用模式下点了还提示"已优化画面描述"。直接移除这个「AI 优化」按钮（第 414 行 ai-write 那一块）和 improveDescription 函数。不要留一个假按钮。
- 第 417-422 行「视觉方向」模块里的第 420 行 `.reference-insight` 是假的"智能匹配"卡片：标签和描述写死，配图用的是 taskMeta.scene.image（Unsplash 图），不是用户上传的参考图，而电商模式根本没有参考图上传入口。处理方式：删除第 420 行整个 `.reference-insight` 块（含"基于商品图推荐当前方向"这句话）；保留六维标签组本身，但上方说明改为"未上传参考图时不生效"。

【任务 5 · 生成中状态改为真实状态驱动】
文件：apps/web/components/workbench.tsx（第 453-459 行）
- 现在生成中展示的还是那张 Unsplash 参考图 canvasImage，配 scan-line 动画；下面的 stage-track 是静态 DOM（固定一个 done、一个 active、一个空），不随真实状态变化。这属于伪造进度。
- 改为：不再展示任何假图。生成中区域根据 generationTask.status 显示不同文案（queued → "排队中，前面还有任务"；processing → "正在生成"；waiting_provider → "已提交给 AI 服务，等待返回"），配一个不确定进度的循环动画条（不要百分比、不要分段圆点、不要三段式阶段条）。
- 删除 stage-track 和 stage-labels 这两个固定结构。

【任务 6 · 登录后保留上下文，支持回跳】
文件：apps/web/components/workbench.tsx、apps/web/app/login/page.tsx
- 现状：workbench.tsx 第 157-159 行未登录直接 router.replace('/login')；login/page.tsx 第 21 行登录成功后写死跳 `/workbench?mode=general`。结果用户从"白底精修"卡片进来，登录后被扔到通用生图，描述、模型、比例、数量、商品任务选择全部丢失。
- 改为：workbench 不再在加载时强制跳转，允许未登录用户看到并编辑完整工作台，只在点击生成按钮且没有 token 时才跳转登录，跳转时带上回跳地址 `?next=` + encodeURIComponent(当前 pathname + search)。
- login 页用 useSearchParams 读 next，登录成功后 location.href = next（没有 next 时才用 /workbench?mode=general）。注意 useSearchParams 在 app router 下需要 Suspense 边界，处理一下避免构建报错。
- 首页 apps/web/components/home-page.tsx 第 54 行的 GET 表单已经会把 prompt/model/aspectRatio/resolution/count 带到 workbench URL，确认这条链路在登录后仍然完整（不要再丢参数）。

【任务 7 · 文案与实现对齐】
文件：apps/web/components/workbench.tsx
- 第 385-388 行：通用模式文案写"可选，最多 4 张"、商品模式写"支持 1-3 张"，但实现只取 `event.target.files?.[0]`，永远只能 1 张。先读 packages/contracts/src/generation.ts 确认 productAssetIds / referenceAssetIds 是否允许数组多值：如果允许，把上传改成多选（商品图至少支持 3 张、参考图至少 4 张，缩略图可删除、第一张标为主图）；如果契约只允许单张，就把文案改成"仅支持 1 张"。两种都要保证文案和实际行为一致，不要让用户按文案操作却失败。
- 第 407-408 行：创作风格、参考强度用了 defaultValue 不受控，而且 buildPayload（第 249-259 行）里硬编码 style: 'unspecified'、referenceStrength: 'medium'，用户选了根本不生效。改为受控 state 并真正进入提交参数。
- 第 266 行：productName 用文件名兜底成 'Aero H1'、productCategory 写死 '其他'，用户完全不能填，而这两个字段会直接进提示词编排。在商品模式参数区加两个输入框：商品名称（必填，空值提交时给字段级错误提示）、商品类目（选填，给几个常见类目选项 + 允许手填）。提交时用用户输入，不再用文件名兜底。
- 第 230-233 行：卖点是把 requirements 按 /[\n，。；]/ 切分出来的，用户完全不知道这个规则。把商品模式的文本框 placeholder 明确写成"每行一条卖点，最多 8 条"，并在下方显示当前解析出的卖点数量。
- 第 438 行：模型下拉第一项写 "Auto · 推荐"，实际 value 是 gpt-image-2，平台根本没有自动路由。把选项文案改成模型真实名称（GPT Image 2 / Gemini 2.5 Flash / Gemini 3.1 Flash / Gemini 3 Pro Image），不要出现"Auto"。

【验收标准】
1. 未登录访问 /workbench?mode=commerce&task=white-background 能完整看到工作台，点生成才跳登录，登录后回到同一个 URL 且参数还在。
2. 首页在没有项目时显示空态，没有任何写死的项目名、灵感数据和点数数字。
3. 顶部能退出登录，退出后头像回到未登录态；登录后头像显示真实用户名首字符。
4. 工作台里看不到"AI 优化"按钮、"智能匹配"卡片、生成中的 Unsplash 假图和三段式进度条。
5. 商品模式可以填写商品名称与类目，上传区的文案与实际可上传数量一致。
6. 以下命令全部通过：
   pnpm typecheck
   pnpm build
   GOCACHE=/tmp/istudio-go-cache go -C apps/server test -race ./...

【收尾】
在 development-progress/ 下新增一份记录文档，命名 `2026-09-11-021-体验止血与假数据清理.md`，按该目录 README 的规则写（目标、实现内容、文件范围、验证结果、遗留问题、下一步）。遗留问题里请明确写出哪些是"暂时下线等待真实能力"，方便后续接回。

完成后用中文简报：改了哪些文件、每个任务的实现方式、哪些任务因为契约或依赖限制做了降级处理、以及你建议第二批优先做什么。
```

---

## Prompt B · 第二批（补结果闭环与并发）

```text
你在 /Users/mofung/Documents/product/i-studio 这个仓库里工作。iStudio 是 AI 电商图片创作平台（Next.js 15 前端 apps/web + Go API apps/server + PostgreSQL + Redis）。第一批已经清理完假数据和流程断点，主链路「上传 → 生成 → 下载」稳定可用。现在的问题是：结果页是断头路，用户下载一次之后没有下一步；生成结果无法沉淀复用；后端队列是单 worker 串行，多人排队会拖垮耗时。

本次任务共 6 项，按编号顺序做。约束：不新增第三方依赖；保持现有视觉与 globals.css 类名体系；文案简体中文；不改 docs/PRD-* 和 UI/ 目录。

【任务 1 · 结果区补齐复用动作】
文件：apps/web/components/workbench.tsx（结果区第 461-465 行）、apps/web/app/tasks/[id]/page.tsx
- 现在生成完成后只有「下载」一个动作。补齐一级操作：下载、加入项目、创建变体、重新生成。批量下载（ZIP）和平台尺寸裁剪收进"更多"。
- 创建变体：复用原任务的 input，带上被选中图片的引用，重新打开工作台参数（前端带入原参数即可，后端 POST /v1/generation/tasks 已支持同结构提交）。
- 重新生成：用原 input 原样提交新任务，并跳到新任务。
- 加入项目：如果任务没有 projectId，弹一个项目选择（调 GET /v1/projects，可新建），PATCH 到任务上；如果后端还没有这个接口，就补一个最小实现。
- 每个操作要有 loading 与失败反馈，下载失败必须给用户可见提示（现在 downloadProtectedAsset 是静默失败）。

【任务 2 · 生成结果落资产记录】
后端：apps/server/main.go、apps/server/db.go
- 现在生成结果只写 generation_tasks.result_images，没有落 assets 表，导致结果无法收藏、复用、做变体。
- 在任务成功持久化图片后（persistGeneratedImages 附近），为每张结果图写一条 assets 记录（type = generated，project_id 取任务的 project_id，parent 关系用 task id 关联），并在 generation_tasks 里记录对应的 asset id。
- 前端资产列表（apps/web/app/projects/page.tsx）需要能区分"上传素材"和"生成结果"，并支持按类型筛选。

【任务 3 · 工作台状态恢复与草稿保存】
文件：apps/web/components/workbench.tsx
- generationTask 只存在组件 state，刷新页面或关闭工作台结果就消失。改为：提交成功后把 task id 写进 URL query（?task=xxx），组件挂载时如果 URL 带 task id 就拉取该任务并展示结果。
- 参数草稿：登录用户 2 秒防抖写入 localStorage（按 mode 分别存通用/商品两套），刷新后恢复。
- 生成中允许继续编辑新草稿，不要因为正在生成就禁用整个提交按钮（当前第 439 行 disabled={isSubmitting || isGenerating}）。

【任务 4 · 队列并发与重试】
文件：apps/server/queue.go
- 当前只有一个 goroutine 串行消费（worker 函数），多用户排队时耗时线性叠加；也没有自动重试、没有部分成功。
- 改为：可配置 worker 数量（环境变量 GENERATION_WORKERS，默认 4），用 goroutine 池消费；任务失败自动重试最多 2 次（指数退避），仍失败才标记 failed；单张图片失败不要导致整个任务 failed，能出几张算几张，状态用 partial_success。
- 注意：Redis BRPop 和内存 fallback channel 两条路径都要覆盖，数据库更新要防止并发写冲突。

【任务 5 · 任务详情参数可读化】
文件：apps/web/app/tasks/[id]/page.tsx（第 100 行）
- 现在是把原始 input JSON 用 <pre> 直接铺开，商家用户看到的是 {"mode":"commerce","taskType":"scene"...}。
- 改为卡片式展示：创作目标、商品名称、模型、比例、清晰度、数量、平台、语言、耗时（createdAt 到完成时间）、状态。字段做中文映射，缺失字段显示"—"。原始 JSON 折叠收进一个 <details> 里，标签写"查看原始参数"。

【任务 6 · 图片加载与下载反馈】
文件：apps/web/components/authenticated-image.tsx
- 加载失败现在是 `.catch(() => undefined)` 静默，用户只看到空白。改为：显示可重试的错误占位。
- 下载（downloadProtectedAsset）用 blob 后立即 revokeObjectURL，且没有进度和成功/失败反馈。改为：延迟 revoke，返回 Promise 并让调用方显示 loading；失败抛出可见错误。
- 下载文件名现在固定 .png，结果是 jpeg 时会拿到错误扩展名。根据实际 mime 推断扩展名。

【验收标准】
1. 生成完成后可以做变体、重跑、加入项目，每个动作都有成功或失败反馈。
2. 生成结果出现在资产列表里，能按"上传素材 / 生成结果"筛选。
3. 刷新工作台页面，结果和未提交的参数草稿都还在。
4. 同时提交 4 个任务，总耗时接近单个任务耗时（而不是 4 倍）。
5. 任务详情页展示的是中文参数卡片，原始 JSON 默认折叠。
6. 断网或图片 404 时，图片区域显示可重试的错误提示而不是空白。
7. 以下命令全部通过：pnpm typecheck && pnpm build && GOCACHE=/tmp/istudio-go-cache go -C apps/server test -race ./...

【收尾】
在 development-progress/ 下新增记录文档 `2026-09-11-022-结果闭环与队列并发.md`。完成后用中文简报实现要点、压测数据（4 并发的实测耗时）、以及没有做到的降级项。
```

---

## Prompt C · 第三批（计费与合规）

```text
你在 /Users/mofung/Documents/product/i-studio 这个仓库里工作。iStudio 是 AI 电商图片创作平台（Next.js 15 前端 apps/web + Go API apps/server + PostgreSQL + Redis）。前两批已经完成体验止血和结果闭环。现在缺的是上线前必须的商业模式与合规能力。

PRD 里的相关约定（docs/PRD-AI电商创作平台-MVP.md 第 8.8 节）：任务提交前由服务端生成报价单 quote_id（有效期 10 分钟）；提交时预冻结点数，单张成功后结算，失败部分自动解冻；点数流水类型包括赠送、购买、冻结、消耗、退回、过期；钱包扣减必须用数据库事务、乐观锁或行锁；CreditLedger 为不可变流水。

本次任务：
1. 数据层：新增 wallets、credit_ledger、quotes 三张表（迁移放进现有 migrateDatabase），钱包扣减走事务 + 乐观锁（version 字段）。
2. 接口：POST /v1/generation/quotes（按模型、分辨率、数量算价，返回 quote_id 与明细）、GET /v1/wallet、GET /v1/wallet/ledger。创建任务时必须携带有效 quote_id 与 Idempotency-Key，过期或复用要报错。
3. 结算：单张成功才结算，失败部分自动解冻；任务重试不重复扣费。
4. 前端：顶部恢复真实点数余额（第一批被移除的徽标在这里接回来）；工作台参数变化后 500ms 内更新预计消耗；余额不足时不创建任务，展示差额。
5. 合规：注册页加用户协议与隐私政策勾选（未勾选不能提交）；新增 /terms 和 /privacy 两个静态页面，内容先按国内常见 SaaS 模板起草并明确标注"待法务复核"。
6. 内容安全：提交前做输入文本风险词预检（风险词表可配置，先放数据库或配置文件），命中时不调用模型、不扣点，并明确指出需要修改的内容类型。

约束：不新增第三方依赖；不改 UI/ 目录；所有后台敏感操作要有审计日志；具体点数值、套餐价格、免费额度先做成可配置项，不要在代码里硬编码（PRD 第 18.2 节明确这些数值待产品确认）。

【验收标准】
1. 生成前能看到本次预计消耗，提交后余额冻结，成功结算，失败退回，流水可查且金额前后一致。
2. 同一个 Idempotency-Key 重复提交只扣一次费。
3. 余额不足时任务不创建，前端展示差额。
4. 未勾选协议无法完成注册。
5. pnpm typecheck && pnpm build && GOCACHE=/tmp/istudio-go-cache go -C apps/server test -race ./... 全部通过，并补上钱包对账的单测（构造成功、部分成功、全失败三种场景，验证流水与余额零差异）。

【收尾】
在 development-progress/ 下新增记录文档 `2026-09-11-023-点数计费与合规基线.md`，遗留问题里列出所有待产品确认的数值项。
```

---

## 附：给 Codex 的通用环境说明（可拼接到任意一段 prompt 末尾）

```text
环境信息：
- 工作目录：/Users/mofung/Documents/product/i-studio
- 启动：pnpm dev:test（会拉起 PostgreSQL/Redis、Go API :4000、Next.js Web :3000）；只跑前端可用 pnpm dev:web
- 后端需要 apps/server/.env，从 .env.example 复制；BANANA_ROUTER_API_KEY 缺失时生图不可用（会返回 AI_PROVIDER_UNAVAILABLE），但不影响 UI 改动
- 交付验证：pnpm typecheck && pnpm build && GOCACHE=/tmp/istudio-go-cache go -C apps/server test -race ./...
- 真实生图会产生供应商费用，验证 UI 改动时不要主动触发付费请求
- 进度记录写在 development-progress/，命名规则见该目录 README.md
```
