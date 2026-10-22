# iStudio 展示素材

当前版本：2026-10-22。首页从单一暖阳手作风改为混合视觉：手作微缩 3D 负责创意与氛围，写实商品／时装摄影负责可信度，4K 主视觉与真实工作台截图负责产品可信度。所有 AI 图片仍是概念示例，不是产品内实际任务、用户案例或商品保真承诺。

## 当前首页选择

- 主视觉 `hero/coastal-creator-2x.webp`：3328×1872，398,592 字节。由 `gemini-3-pro-image-preview` 以首版主视觉为参考、4K 重绘（源文件 5504×3072），保留机器人、踏板车与左侧留白构图。DPR 2 屏幕会请求最大 srcset 变体，不是放大 1x 图。
- 首页画廊 4 张：微缩画室、香水、时尚人像与未来温室，按不同题材展示。L07 已移除首页中的重复主视觉竖裁；相关源文件与出处仍保留在素材清单中。
- 商品对比：使用内置 image_gen 新生成象牙白护肤罐基础图，再以基础图为参考编辑暖阳洞石场景；1120×1400，分别 24,550 与 91,130 字节。两图保持同款商品与近似机位，仍为 AI 概念示例。
- 工具预览：2 张暖阳概念图 + 3 张 chromatic 摄影演示；产品精修与商品图共用同一香水，只调整反射与光影。
- 工作台：`workbench/workbench-creation-2026-10.webp`，2880×1800，263,512 字节。Playwright 登录真实工作台后截取，画面包含中文提示词、参考图、`gemini-3-pro-image-preview`、16:9 · 4K 参数与 5504×3072 结果；账户标识替换为「iStudio 创作者」。

## 页面与交互

- Hero 文案改为「想象，不止于画面。」，补上「AI 图片生成 · 商品视觉 · 服装模特」与一句价值说明。
- 滚动节奏：文案在 13% 内退场，标题在 34% 前清空，主图从 30% 才开始扩张，避免图片压住尚未淡出的文字；续篇从 78% 起渐入。移动端与减少动态偏好下不启用滚动画布。
- 新增「真实工作台」区块，桌面展示完整界面；手机端改为提示卡，引导去电脑操作但不阻止继续浏览或打开工作台。
- 手机工具目录压缩为 5 条约 125px 的行 + 92px 缩略图，隐藏提示词、原图和大幅预览；Hero 与工作台各保留一处非阻断的 PC 提示。
- 首页只在底部保留一次 AI 概念说明。

## 文件与体积

- 根 [manifest.json](manifest.json)：14 项，合计 2,386,374 字节；11 项带来源 SHA-256；预算 2.5 MB。
- [tool-showcase/manifest.json](tool-showcase/manifest.json)：5 张，合计 572,206 字节；预算 1 MB。
- 工作台截图 263,512 字节；单图预算 400 KB。

发布资源位于 `web/public/images/marketing/`：`hero/`、`gallery/`、`ecommerce/`、`chromatic/`、`sunny/`、`workbench/` 与 `tool-showcase/`。`gallery/coastal-detail-2x.webp` 和 `hero/coastal-og-2x.webp` 由主视觉裁切。

## 提示词与来源

- [prompts.json](prompts.json)：sunny 批次提示词，外加 4K 主视觉重绘与工作台截图方法。
- [sources.json](sources.json)：sunny 批次来源台账，外加 4K 主视觉与工作台记录。
- [manifest.json](manifest.json)：当前发布清单，混用 sunny、neutral、chromatic 及最新商品对比批次。
- [comparison-2026-10-22.json](comparison-2026-10-22.json)：本轮商品对比完整提示词、引用关系、原图和发布路径；使用内置 image_gen。
- `archive/2026-10-21-sunny/`、`archive/2026-10-21-neutral/`、`archive/2026-10-21-chromatic/`：各批次原始清单。
- `test/artifacts/marketing-hero-4k-2026-10-21/`：4K 原始 PNG 与工作台原始截图，不提交 Git。

历史批次重新编码（会恢复对应批次，请勿用于覆盖最新商品对比）：在 `web` 下运行 `node scripts/prepare-marketing-assets.cjs` 和 `node scripts/prepare-showcase-assets.cjs`。脚本只缩放、裁切和编码本地图片，不下载或生成图片，不读取模型密钥。

2026-10-22 商品对比：原始 PNG 保留于 `test/artifacts/marketing-comparison-2026-10-22/originals/`；用 Next.js 已依赖的 sharp 缩小至 1120×1400，以 WebP quality 85、effort 6 编码，更新根清单对应两项。新图不覆盖历史归档。

## 验证

2026-10-22：278 项前端测试、生产构建与类型检查通过；本轮修改区域已通过桌面 1280×720、手机 390×844 的独立预览检查。新对比图均加载成功，滑杆方向键和读屏值同步。详见 [本轮报告](../../test/reports/ui-polish-2026-10-22.md)。

上一版验收记录（2026-10-21）：

TypeScript 类型检查与 255 项前端测试通过（Node 24）。浏览器检查了 1440、1280、1024 与 390 宽度，浅色与深色主题：无控制台错误与横向溢出；Hero 标题在图片扩张前退场，DPR 2 下加载最大主视觉变体；手机工具目录为 5 条约 125px 的行，工作台截图替换为提示卡。未执行生产构建（开发服务器正在运行），未做真机触控验收。
