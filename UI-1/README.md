# iStudio UI-1

iStudio 的第二套前端界面。与 `apps/web`（原始版本）和 `ui`（Appica Nova 版）并列，
这一版**没有落地页**：打开就是工作台。

## 设计方向：灯箱与工单

界面的隐喻来自这个产品真实的工作现场，而不是通用后台：

| 元素 | 来源 | 在界面里的作用 |
| --- | --- | --- |
| 对位规十字 | 印刷套准标记 | 品牌标记；画布四角标示可成像区域 |
| 灯箱台面 | 影棚修图灯箱 | 画布底色为影棚灰 + 24px 刻度网格 |
| 工单条款 | 摄影工单 / 规格书 | 左侧面板按填写顺序编号 01–05 |
| 联系表 | 胶片联系方式印样 | 画布下方横向胶片条，切换历史结果 |
| 规格读数 | 印刷工单 | 顶栏实时显示 `1:1 · 2K · 2048×2048` |
| 朱砂 | 印章 / 中式印刷 | 只用于「生成中」与「已选中」 |

配色克制：影棚灰（`#e7e6e1`）、瓷土白（`#fcfcfa`）、墨阶（`#171815`），
信号色只有一枚朱砂（`#c4372b`）和一枚竹青（`#2f6b4f`）。
字体走中文优先栈：标题用宋体，界面用黑体，规格读数用等宽。

## 路由

| 路径 | 页面 |
| --- | --- |
| `/` | **工作台**（首页即工作台，`?mode=` `?task=` `?prompt=` 可直接带参进入） |
| `/workbench` | 旧链接兼容，302 到 `/` 并保留查询参数 |
| `/assets` · `/assets?view=tasks` | 资产库 · 生成图片 / 按任务查看 |
| `/inspire` | 灵感库，提示词可直接带去工作台 |
| `/tasks/[id]` | 任务详情与重试 |
| `/login` | 登录 / 注册 |

## 与后端的契约

业务逻辑与 `apps/web` 完全一致，未做任何改写：

- `lib/contracts/generation.ts` —— 生成输入的 zod 校验（与 Go 端字段一一对应）
- `lib/api.ts` —— API 基址、资产上传、错误读取
- `components/workbench/use-generation-task.ts` —— 提交、轮询、历史结果
- `components/workbench/use-inspiration-prompts.ts` —— 灵感库分页与搜索

后端接口沿用：`/v1/auth/*`、`/v1/generation/capabilities`、`/v1/generation/tasks`、
`/v1/assets`、`/v1/inspiration/*`。

## 本地运行

```bash
cd UI-1
pnpm install
cp .env.local.example .env.local   # 按需改 NEXT_PUBLIC_API_BASE_URL
pnpm dev                            # http://127.0.0.1:3100
```

默认 API 地址为 `http://127.0.0.1:4000`。

## 校验

```bash
pnpm typecheck
pnpm test
pnpm build
```

## 无障碍与动效

- 所有图标按钮都有 `aria-label`，选择组用 `aria-pressed`，状态用 `role="status"`
- 焦点环 2px + 2px offset，键盘可达；灯箱内做了 Tab 循环
- 动效只用 `transform` / `opacity`，曲线统一为 `--ease-out` / `--ease-in-out`
- `prefers-reduced-motion` 下全部动效收敛为即时
