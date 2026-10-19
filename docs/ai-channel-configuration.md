# AI 渠道配置与开发升级

## 第一次使用：先渠道，后模型

1. 管理员登录后进入 **AI 服务 → 添加生图渠道**。
2. 点击 **OpenAI 官方** 或 **Gemini 官方** 快捷填写名称、协议和地址；中转站选择 **兼容中转站** 后，按服务商文档填写地址和协议。快捷预设仅用于新增渠道；切换预设会清空未保存的密钥和测试模型，避免混用服务。
3. 填入 API Key，保持“启用”，点击 **保存渠道**。测试模型 ID 是可选项，只影响渠道页测试，不决定正式任务用哪个模型。
4. 点击页首 **前往模型与定价**，添加模型，设置前台显示名称和每张积分价格。
5. 在 **渠道与主渠道 → 添加渠道** 中选择刚才的渠道，填写该绑定实际使用的 **上游模型 ID**。可继续添加其他备用渠道，各自配置 ID。
6. 选择一个 **设为主渠道**，按模型真实能力勾选比例、分辨率和参考图支持。勾选 **上架到前台** 后点击 **保存模型**。
7. 如需验证，先使用渠道页的 **测试连接**；绑定卡片中的 **真实生图测试（可能收费）** 会测试该卡片的模型 ID，需要费用确认。每个渠道的结果分别展示。

后续切换只需编辑模型，在另一张渠道卡片选择 **设为主渠道**。界面会显示 **保存后使用**；点击 **保存模型** 才完成切换。新任务使用新渠道，已创建任务保持原渠道。备用渠道不会自动接管任务。

上架但未选主渠道、绑定缺少上游 ID、比例或分辨率为空时，编辑器会在保存前提示。暂时配不完整时，可取消上架并保存为草稿（已经添加的绑定仍需填写 ID）。

在模型编辑器中使用“打开渠道配置（新标签页）”新增渠道后，回到模型页关闭编辑器、刷新列表，再继续绑定。

## 升级顺序

1. 停止 API 和 Worker，完成/结算旧测试任务；保留现有加密密钥或 `AI_CONFIG_ENCRYPTION_KEY`。
2. 在数据库客户端导出结构，列出外键与本次影响范围。只有确认本地开发环境后才考虑可选重置。
3. 备份后部署代码并运行原迁移入口。新迁移为 `011_model_channels.sql`，不要手动改写旧迁移记录。
4. 已有公共模型会保留名称和价格并设为草稿，不会自动迁移绑定。重新配置渠道、绑定、选择主渠道后上架。
5. 旧任务快照不兼容新版 Worker；旧的未完成任务会失败并按原规则结算/退款，不会重新请求其他渠道。历史任务与已保存图片不受新主渠道切换影响。

可使用 PostgreSQL 自带 CLI 提前备份（连接信息通过自己的受保护环境提供）：

```sh
pg_dump --schema-only --no-owner --no-acl > before-ai-channels-schema.sql
```

这条命令使用当前 libpq 连接环境；执行前务必核对目标。不要将数据库密码或密钥写入仓库。

## 添加 OpenAI 官方渠道

管理员登录 `/admin/settings` → 生图渠道 → 添加生图渠道：

| 字段              | 填写                                          |
| ----------------- | --------------------------------------------- |
| 名称              | 例如 `OpenAI 官方`                            |
| 协议              | `openai_images`（OpenAI Image API）           |
| Base URL          | `https://api.openai.com/v1`                   |
| API Key           | 管理员持有的有效官方密钥                      |
| 测试用上游模型 ID | 填实际已开通的图片模型 ID；仅用于渠道页的测试 |
| 超时              | 1–600 秒，按服务实际响应时间配置              |
| 启用              | 开启                                          |

保存后可先测试连接，再点击“测试生图（可能收费）”。实际生成使用公共模型绑定里的上游模型 ID，渠道页测试 ID 不决定前台模型映射。

## 添加 Gemini 官方渠道

同一位置添加，名称例如 `Gemini 官方`，协议选 `gemini_native`，Base URL 为 `https://generativelanguage.googleapis.com/v1beta`，填写 Gemini API Key。认证使用 `x-goog-api-key`，请求使用原生 generateContent 格式。

测试 ID 与公共模型绑定 ID 均由管理员按自己账号实际可用模型填写，通常是原生模型 ID，而非平台中文展示名称。不要将示例展示名当作已核验的官方模型 ID。

## 添加第三方中转站

每个站点建立独立 Endpoint，按其文档选择协议和根路径：

- 兼容 Images generations/edits：`openai_images`，Base URL 例如 `https://your-provider.example/v1`。
- 支持 Chat 返回多模态图片：`openai_chat`，使用消息图片输入、`modalities` 与 `image_config` 的兼容格式；Base URL 可为 `https://your-provider.example/api/v1`。
- 兼容 Gemini 原生接口：`gemini_native`，例如 `https://your-provider.example/v1beta`。

不填完整 `/images/generations`、`/chat/completions` 或某个具体模型的 `:generateContent` 路径，不添加 `/async`。私网、localhost、带凭据/查询/片段的地址不允许。DNS 解析到私网也会在请求时阻止。

不能仅凭模型名称推断协议，也不能因为站点宣称“OpenAI 兼容”就认为支持图片 Chat。当前 Chat 图片协议对照 [OpenRouter 文档](https://openrouter.ai/docs/api/api-reference/chat/create-a-chat-completion) 实现并通过 Mock 验证，其他变体需要先手动测试。此实现不新增任意请求体模板或供应商专属兼容分支。

更换站点时建议创建新 Endpoint，再切换模型绑定；直接改写已有 Endpoint 的 Base URL 不会改变旧任务冻结的 URL，旧任务仍会读取该 Endpoint 当前密钥。

## 配置公共模型和多渠道绑定

进入 `/admin/models`（模型与定价）：

1. 添加/编辑模型，填写公开显示名称及每张积分价格。
2. 在“添加渠道”中选择 Endpoint，每个 Endpoint 只能添加一次。
3. 对每个绑定填写独立上游模型 ID。一个 Endpoint 可以被多个公共模型复用，ID 可以各不相同。
4. 启用绑定，选择一个“当前使用”的主渠道。其余只是备用配置，不参与自动调度。
5. 按真实上游能力勾选参考图支持、比例与分辨率，至少选择一种比例和分辨率。
6. 可对某个绑定点击“真实生图测试（可能收费）”，测试该绑定的上游 ID，不会改变主渠道。
7. 上架并保存。没有主渠道的模型只能保存为草稿。

用户只看见模型名称与原生图参数，不看见渠道列表、协议或密钥。

## 手动切换主渠道

编辑目标公共模型 → 选择另一个已启用绑定的“备用”单选框 → 保存模型。

保存成功后新任务立即使用新渠道，无需环境变量、重启或部署。已创建任务继续使用旧快照。切换失败不会留下半次切换；并发保存遇到模型版本冲突会返回 409，刷新后重新确认。

删除/停用主绑定前先选其他主绑定，或下架并清除主绑定。Endpoint 仍被任意模型绑定时不能直接删除；先在模型编辑器删除关联。Endpoint 仍作为任意模型主渠道时不能停用，即使该模型已下架也应先清除其主标记。

## 测试连接与真实生图

- “测试连接”：GET 模型列表，只验证连接和认证；不调用生成接口，不证明某个模型支持生图。
- “真实生图”：同步生成一张测试图；前端明确确认费用，后端要求 `mode=generate` 和 `confirmCost=true`。测试不预留/扣除平台积分，可能产生上游费用。
- 绑定测试传入当前填写的上游 ID，不必先把备用渠道切成主渠道。
- 编辑密钥留空会保留现有密钥；返回配置只有掩码。Endpoint PUT 必须携带最新 `updatedAt`，过期编辑返回 409。保留原加密主密钥，否则已有渠道无法解密。
- 401/403、超时、上游错误、安全拒绝、纯文字图片响应均在管理员测试结果中可诊断，不会自动重试备用渠道。

管理测试 API：`POST /v1/admin/ai-endpoints/:id/test`。

```json
{ "mode": "connection" }
```

```json
{
  "mode": "generate",
  "confirmCost": true,
  "upstreamModelId": "actual-upstream-id"
}
```

测试是验证上游响应，不会创建前台历史或向正式对象存储上传结果。正式任务的图片下载/解码、存储及积分链路由现有 Worker 执行。

## 可选开发重置脚本

脚本 `scripts/reset-ai-development.py` 只在人工运行时生效，需要本机 `psql` 与 `pg_dump`（建议与 PostgreSQL 服务版本一致）。未接入应用启动、迁移、构建或测试。

通过 `DEV_AI_RESET_DATABASE_URL` 显式指定本地连接，只接受 `127.0.0.1`、`localhost`、`::1`。拒绝远端及 URL 中的主机覆盖参数。默认仅预览外键、数量和清理范围。

```sh
python3 scripts/reset-ai-development.py --backup-dir /private/tmp/istudio-ai-backups
```

人工核对输出、确认开发库且停止 API/Worker 后，使用数据库真实名称明确确认：

```sh
APP_ENV=development python3 scripts/reset-ai-development.py \
  --backup-dir /private/tmp/istudio-ai-backups \
  --confirm-development YOUR_LOCAL_DATABASE_NAME --apply
```

脚本先备份完整结构、外键清单和相关 AI 表数据，再开启事务取得锁并重新检查活跃任务；任意未结算预留或活跃任务都会阻止执行。没有 `TRUNCATE CASCADE`，也不重置迁移版本。

实际清理范围：

- 删除全部公共模型及其绑定、图片用途 Endpoint。
- 删除没有关联素材的终态测试任务及其已结算 charge。
- 清空保留的已结算 charge 的私有 provider 快照，去除废弃密钥副本；价格、消耗、退款账务不变。
- 保留用户/管理员/认证、积分账户与完整流水、项目、所有素材记录和对象文件、带素材的历史任务、提示词 Endpoint/模板、反推、预设和存储/系统配置。

需要处理未结算任务时，先通过原 Worker 完成/恢复结算，不用 SQL 直接清空余额。备份目录含私有配置的密文，应妥善保管。脚本不会删除图片对象，也不会操作 Redis；停机后恢复队列时，旧的无效唤醒按现有任务存在性/状态检查忽略。

本次没有运行此脚本的清理模式，没有清空当前开发业务库。

## 验证命令与边界

```sh
cd server
TEST_DATABASE_URL='postgres://TEST_ROLE:TEST_PASSWORD@127.0.0.1:TEST_PORT/DEDICATED_TEST_DB?sslmode=disable' go test -race ./...
cd ../web
pnpm test
pnpm typecheck
pnpm build
```

数据库集成测试必须指向专用测试库，只在新建随机 schema 中运行，结束仅删除自己的测试 schema。未设置测试连接时数据库测试会跳过，不能把跳过当成迁移已验证。本次已使用独立本地 PostgreSQL 17 测试库实际执行迁移和回归。

自动测试使用 Mock Server/受控传输，不调用真实付费上游。真实 OpenAI、Gemini 和中转站的权限、模型 ID 与参数支持尚需管理员手动确认。
