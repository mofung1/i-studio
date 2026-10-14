# iStudio

个人部署的 AI 图片创作工作台，包含通用生图、五种电商工具、灵感库、生成资产与 AI 服务配置。首页直接进入工作台。

## 当前功能

- **AI 生图**：文字描述、最多 6 张参考图、模型选择、画面比例、1K / 2K / 4K、风格与参考强度；界面一次可生成 1–4 张。
- **图片反推**：从 AI 生图、发现灵感或本人生成资产上传/选择图片，提炼「还原画面」或「只提取风格」的双语提示词；支持编辑、复制、追加/替换并撤销、选择原图参考、保存为灵感草稿。分析在后台继续，切页或刷新可恢复；可取消或清除临时记录。在「设置 → 图片反推」指定支持 Vision 的 Prompt 服务、超时、图片细节和保留时间，两个分析模板也可自定义。见 [图片反推使用说明](docs/image-to-prompt.md)。
- **网站配置**：在「设置 → 网站配置」修改网站名称、上传 PNG / JPG Logo（不超过 2 MB）或恢复默认品牌；保存后同步到全站导航、浏览器标题和图标。所有已登录账号均可修改，配置由后端持久保存。
- **电商工具**：商品主图、商品详情、爆款复刻、产品精修、服装组图；主图和详情页可按模块组合，单个模块最多 4 张，总计最多 16 张。
- **电商生成约束**：区分商品原图与构图参考，精修默认保留原场景，主图与服装商品图要求完整轮廓，详情模块只采用已提供的信息。结果区显示图片实际像素，便于核对接口返回尺寸；包装小字、印花和人物一致性仍需检查原图。
- **服装组图**：商品组图与模特上身两种模式；上传服装素材，查看并编辑逐张拍摄规划，确认后生成。支持 AI 识图分析、手动规划、单图及整组 ZIP 下载、完整历史配置回填。
- **生成结果**：黑白生成状态动画（适配减少动态效果）、完整比例主图预览、逐图切换、最近生成列表、下载、继续创作与重新生成。
- **通用生图布局**：底部默认使用紧凑配置，长提示词可展开编辑，参考图片可展开管理；提交成功后自动折叠，完成后保持折叠，继续创作或重新生成时展开。主图根据剩余空间等比显示；桌面右侧逐张展示最近生成并隐藏重复的底部缩略图，手机保留横向缩略图。支持全屏查看、缩放、拖动、适应窗口与本地裁剪下载。
- **资产与历史**：查看生成图片、提示词和参数；载入历史配置继续编辑；删除图片或整条记录。生成中的任务需完成后才能删除；没有结果图片的失败任务使用专属插画，点击可查看失败原因。
- **灵感库**：公开浏览，支持搜索、分类、分页加载、复制提示词和带入工作台；内容可手动维护，也可批量导入案例数据。
- **AI 配置**：所有已登录账号均可管理全局服务和 75 个内置 Prompt 模板。采用「用途分组 → 模板」两级导航，默认只展开当前分组，支持跨分组搜索、编辑、启用/停用及恢复默认；覆盖实际生图、模块、精修项、服装规划、AI 帮写和图片反推。Prompt AI 支持图片识别能力开关，API Key 仍以加密方式保存并以掩码展示。
- **灵感提示词管理**：在「发现灵感 → 管理提示词」新增、编辑、删除提示词，支持标题、分类、来源、内容、启用状态和排序；管理列表支持关键词搜索、分类下拉和启用状态筛选，分类包含仅有未启用提示词的条目。顶部可返回发现灵感，公开灵感库只展示已启用内容。编辑文字保留原有案例图片，删除提示词不删除图片文件。
- **灵感分类管理**：从灵感页的分类区域或提示词管理工具栏进入；支持新增、改名、搜索及删除分类。旧分类自动纳入管理，空分类持久保留；删除有内容的分类时先将提示词迁移到其他分类，保留文字、图片和启用状态。新增/编辑提示词通过下拉框选择分类，也可在编辑弹窗中就地新增并选择。

风格与参考强度通过发送给模型的文字指令表达；实际尺寸、参考效果及可用分辨率取决于所配置的模型。

2026-10-13 使用已配置的 GPT Image 2 完成六个电商场景、共 12 张真实出图对照。观察结果、已实施改进及仍存在的印花和尺寸限制见 [电商效果测试记录](docs/commerce-effects-2026-10-13.md)。

2026-10-13 另外完成 6 次真实识图验证，未生成图片；测试发现的风格主体混入与照片方向问题已修正，修正后尚未追加付费复测。见 [图片反推效果记录](docs/prompt-reverse-evaluation-2026-10-13.md)。

## 目录结构

```text
apps/web/       Next.js 15 + React 19 用户端，独立 pnpm 项目
apps/server/    Go API、鉴权、数据库、任务队列、AI 协议客户端
  migrations/   AI 配置表迁移（随服务编译并在启动时执行）
  seed/         灵感库导入所需的 Markdown
  storage/      本地运行数据（uploads 下的文件不提交到 Git）
docker/         Docker Compose 和前后端 Dockerfile
docs/           实现记录与项目检查报告
design/         设计参考
dev.sh          本地前后端启动脚本
TODO.md         后续功能计划
```

旧 `ui`、`UI-1`～`UI-4` 换肤副本、废弃首页与临时骨架屏预览已移除；当前唯一前端位于 `apps/web`。

## 服装组图

从「电商工具 → 服装组图」进入，页面路径为 `/workbench?mode=commerce&task=clothing-set`。

- **商品组图**：上传同一件服装的 1–6 张不同角度照片；选择正面精修、背面精修、立体展示、人台展示、细节特写或卖点图。默认生成正面、立体、细节各一张；每类最多 4 张，整组最多 16 张。立体展示产出静态图片。
- **模特上身**：上传同套搭配的服装照片和一张模特照片，可另上传一张场景参考；生成 1–4 张。模特用于人物身份和体型，场景只用于背景；不提供 AI 模特或场景图库。
- **规划确认**：填写拍摄风格、平台、文字语言、比例与清晰度。支持 Vision 的默认 Prompt 服务可分析图片并提供逐张规划；未配置识图服务或分析失败时仍可手动编辑。每张规划生成一张独立图片，分析本身不创建生图任务。
- **保真要求**：提示词要求保留颜色、版型、印花、Logo 与可见工艺，不编造面料成分、尺码、性能和认证；背面参考不足时显示提醒。实际服装和人物一致性取决于所用模型，生成后应核对原图。
- **结果与历史**：逐张预览、下载，或下载包含已完成图片的 ZIP；重新生成时先回填素材和已确认的逐张规划，供再次检查。中途失败会保留已生成图片。

素材支持 JPG / PNG / WebP，单张最多 10 MB，一次全部素材合计最多 20 MB。服装分析使用 `/v1/clothing/plan`，通过可配置的服装规划模板调用 Prompt 服务，JSON 返回格式由程序固定；通用 AI 帮写模板不参与此接口。生成仍使用现有任务队列，素材和 ZIP 下载都校验账号归属。

## 快速启动

### Docker（完整持久化环境）

需要 Docker 和支持 `env_file.required` 的 Docker Compose v2。AI 服务可在网页中配置，无需先填写供应商密钥。

```bash
cd docker
docker compose up --build
```

| 服务 | 默认地址 / 端口 |
| --- | --- |
| Web | http://127.0.0.1:33000 |
| API | http://127.0.0.1:44000 |
| PostgreSQL | 127.0.0.1:55432 |
| Redis | 127.0.0.1:56379 |

默认仅绑定宿主机回环地址。`WEB_PORT`、`API_PORT`、`POSTGRES_PORT` 和 `REDIS_PORT` 可覆盖端口；前端 API 地址和 CORS 会随 Web / API 端口变化。例如：

```bash
WEB_PORT=33100 API_PORT=44100 docker compose up --build
```

如果通过其他主机名或反向代理访问，需要配置浏览器可达的 `NEXT_PUBLIC_API_BASE_URL` 与 API 的 `WEB_ORIGINS`。`NEXT_PUBLIC_*` 在构建时写入前端，改地址后必须重新构建 Web。

前台按 `Ctrl+C` 停止服务。后台启动用 `docker compose up -d --build`，查看日志用 `docker compose logs -f api web`，停止用 `docker compose down`。`down` 保留命名卷，`down -v` 会删除数据库及 Redis 数据。

### 本地开发

需要 Node.js 20+、pnpm 10 和 Go 1.25。首次运行先复制后端配置：

```bash
cp apps/server/.env.example apps/server/.env
./dev.sh --infra
```

`--infra` 启动 Compose 中的 PostgreSQL / Redis。前端默认 http://127.0.0.1:3000，API 默认 http://127.0.0.1:4000。

```bash
./dev.sh                                   # 使用已启动的基础服务
./dev.sh --web-port 3100 --api-port 4100     # 自定义前后端端口
./dev.sh --no-install                       # 跳过前端依赖安装
```

脚本自动将前端连接到本次 API 端口，无需修改 `.env.local`；检查端口、安装缺失的前端依赖、构建 API，并带 `[api]` / `[web]` 前缀输出日志。停止时只清理本次启动的进程。

同一套数据库 / Redis 当前应只运行一个 API 进程；使用本地 API 前，先停止 Compose 的 API：

```bash
cd docker
docker compose stop api
```

也可以分别启动：

```bash
# 终端 1
cd apps/server
go run .

# 终端 2
cd apps/web
pnpm install --frozen-lockfile
pnpm dev
```

前端单独开发默认请求 `http://127.0.0.1:4000`。如果连接 Docker 后端，可在 `apps/web/.env.local` 配置：

```dotenv
NEXT_PUBLIC_API_BASE_URL=http://127.0.0.1:44000
```

同时将该前端来源加入后端 `WEB_ORIGINS`；Compose 默认允许 33000 和本地开发的 3000。

## 首次配置 AI

1. 打开工作台，注册或登录账号。所有已登录账号均可管理网站、AI 服务及灵感提示词。
2. 进入 `/settings/ai`，添加 Image AI 服务，填写名称、协议、Base URL、API Key、Model 和超时，启用服务。
3. 如需 AI 优化提示词，添加 Prompt AI 服务；模型支持图片输入时开启 Vision。图片反推必须使用已启用的 Vision 服务，可在「图片反推」标签指定服务，默认沿用 Prompt AI。
4. 回到工作台选择模型并生成。每种用途自动选择一个默认服务，也可手动指定；禁用或删除默认服务会重新选择可用项。

| 用途 | 支持协议 |
| --- | --- |
| Prompt AI | OpenAI Compatible Chat |
| Image AI | OpenAI Image API（生成及 multipart 编辑）、Gemini generateContent |

Model 为自由字符串，支持官方、自建或兼容服务。Base URL 填服务根地址或版本根地址；例如 OpenAI Compatible 的 `/v1` 根路径、Gemini 的服务根地址或 `/v1beta`。

AI 服务设置中的 `Timeout / 秒` 控制单次 HTTP 请求（1–600 秒，新增生图服务默认 300 秒）。异步供应商的每张图片等待上限独立配置：`GENERATION_POLL_TIMEOUT_SECONDS` 默认 600 秒，允许 1–3600 秒；同步服务直接使用请求超时。多图按单张顺序调用，每张异步图片有自己的等待窗口。

切换页面或工具不会取消服务器中的生成。返回工作台时会查询当前类型的未完成任务；本标签页记录的任务若已完成，会恢复其结果。恢复只查询状态。此前已超时的旧记录不会因延长等待上限而自动补回供应商图片。

Prompt 配置包含提示词优化、通用生图、电商生图、图片模块、精修选项和服装生图与规划、图片反推共 75 个模板。初始化会补齐缺失模板、更新默认内容并保留已保存的自定义内容和停用状态；生成任务开始时读取一份配置，整组图片使用相同版本。未配置 Prompt AI 时，输入框可按保存的模板整理文字，不识别图片、不调用 AI 服务。模板作用范围、变量与配置示例见 [内置提示词配置](docs/prompt-configuration.md)。关闭 Vision 时，前端不发送图片，后端也会拒绝图片输入。图片反推的双语输出结构由程序校验；停用对应反推模板会禁止该模式分析，避免绕过自定义设置。

**测试连接会实际调用所选服务；图片测试会生成一张图并可能产生费用。** 自动测试使用模拟客户端，不调用已配置的付费服务。

旧 `DEEPSEEK_*` / `BANANA_ROUTER_*` 环境变量仅用于首次迁移已有部署。新部署直接使用网页配置；旧 Endpoint 的异步能力保留，新配置使用标准同步图片协议。

## 数据与备份

- PostgreSQL 保存账号、生图与反推任务、资产元数据、灵感库及 AI 配置；Docker 使用 `istudio_postgres_data` 命名卷。
- 生成图片写入 `STORAGE_ROOT`，按北京时间日期归档；Compose 绑定到 `apps/server/storage/uploads`。
- AI Key 使用 AES-256-GCM 加密，接口仅返回配置状态和尾四位掩码。未提供 `AI_CONFIG_ENCRYPTION_KEY` 时自动创建 `STORAGE_ROOT/.ai/encryption.key`。
- 未提供 `AUTH_JWT_SECRET` 时自动创建随机签名密钥 `STORAGE_ROOT/.auth/signing.key`；显式配置时使用自己的随机长字符串。原来使用固定默认密钥的部署，切换到随机密钥后需要重新登录。
- **备份应同时包含 PostgreSQL、整个 `STORAGE_ROOT` 和自定义环境变量。** 丢失 AI 加密密钥会导致已有供应商 Key 无法解密。

PostgreSQL 不可用时，账号和任务回退到内存，重启后丢失；素材上传、资产持久化与灵感库需要数据库。AI 配置仍可保存到 `.ai/config.json`，网站品牌配置保存到 `.site/config.json`；Logo 文件位于 `STORAGE_ROOT/.site/logos`，备份时需连同上传目录保留。图片反推必须有 PostgreSQL 和图片存储，使用独立的数据库队列；Redis 不可用时，生图使用进程内队列，重启不保证恢复未完成任务；Redis 模式支持恢复处理中队列，但当前没有多实例租约机制。

## 灵感库导入

需要 PostgreSQL；导入命令读取已准备好的 Markdown，并下载案例图。可指定自己的文件和图片源：

```bash
cd apps/server
go run . seed-inspiration -h
go run . seed-inspiration \
  -g1 seed/handdraw-gallery.md \
  -g2 seed/empty.md \
  -cat seed/handdraw-categories.md
```

默认图片源及参数见 `seed-inspiration -h`。图片保存于 `STORAGE_ROOT/inspiration`，不进入 Git；Compose API 的绑定挂载会复用这些文件。`CDN_BASE_URL` 可切换到已上传的案例图地址。

## 验证

```bash
pnpm --dir apps/web typecheck
pnpm --dir apps/web test
pnpm --dir apps/web build
GOCACHE=/tmp/istudio-go-cache go -C apps/server test -race ./...
GOCACHE=/tmp/istudio-go-cache go -C apps/server vet ./...
bash -n dev.sh
docker compose -f docker/docker-compose.yml config --quiet
```

数据库回归默认跳过。通过 `TEST_DATABASE_URL` 开启，测试会创建独立 schema 并在结束时清理，不读取业务 AI 配置：

```bash
TEST_DATABASE_URL='postgresql://istudio:istudio_dev@127.0.0.1:55432/istudio?sslmode=disable' \
  GOCACHE=/tmp/istudio-go-cache go -C apps/server test -race ./...
```

图片反推自动回归包含格式校验、幂等、取消、跨账号访问、私有图片、原图/分析图分离、过期清理和灵感封面保留。前端共 34 项自动测试；产品页面的布局与功能验证见 [界面打磨记录](docs/ui-polish-2026-10-13.md)。

当前检查结果和仍需演进的设计见 [项目检查报告](docs/project-review-2026-10-12.md)，产品计划见 [TODO](TODO.md)。
