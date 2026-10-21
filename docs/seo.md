# 官网与 SEO

## 页面与业务边界

前端采用 `web/app` App Router。`(marketing)` 路由组包含官网和功能页，正文、功能介绍、内部链接、步骤与 FAQ 均由 Server Components 输出。导航、主题、登录状态及视觉交互使用客户端控制器，Hero 的标题与介绍通过服务端 children 传入；FAQ 使用原生 details。

| 路径 | 用途 |
| --- | --- |
| `/` | 公开官网首页 |
| `/tools/ai-image-generator` | 文字与参考图生图介绍 |
| `/tools/image-to-prompt` | 双语图片反推介绍 |
| `/tools/ai-product-photo` | 商品主图介绍 |
| `/tools/product-retouch` | 产品精修介绍 |
| `/tools/ai-fashion-model` | 服装组图与模特上身介绍 |
| `/studio` | 复用原工作台，保留鉴权、任务、积分、素材和历史恢复 |
| `/workbench` | 原工作台兼容入口，仍可直接访问 |
| `/commerce` | 原五类电商工具选择页 |
| `/inspiration`、`/inspire` | 复用现有公开灵感广场 |

旧首页的 `mode`、`task`、`prompt`、`resumeTask`、`referenceAsset`、反推和个人提示词等创作深链接，保留全部查询参数进入 `/studio`。普通首页及只有 UTM 的链接仍显示官网。没有将其他历史业务路径统一重定向。

CTA 使用已有 `mode=general` 或 `mode=commerce&task=...`。`/studio?tool=image-to-prompt` 会通过 `StudioToolLauncher` 唤起现有图片反推弹窗，沿用弹窗登录边界；登录链接保留当前路径与参数。没有改变 AI、积分或后端接口。

根布局默认 `noindex, nofollow`，用于工作台、登录、资产、后台等非营销路由。公开营销页使用独立 Metadata 覆盖。灵感广场目前保留原客户端搜索/分页实现，未验证公开案例内容，因此暂不纳入 sitemap，继续 noindex。

## 环境配置

本地示例（端口以实际启动配置为准）：

```dotenv
NEXT_PUBLIC_SITE_URL=http://127.0.0.1:3000
SITE_ENV=development
```

预览设置 `SITE_ENV=preview`。即使使用 `next build && next start`，未明确启用生产收录也仍保持 noindex。

正式部署前，在构建和运行环境中设置：

```dotenv
NEXT_PUBLIC_SITE_URL=https://你的真实域名
SITE_ENV=production
```

同时需要 `NODE_ENV=production`（Next 生产构建/启动自动设置）。若平台提供 `VERCEL_ENV` 或 `CONTEXT`，它们也必须为 `production`。域名必须为 HTTPS origin，不允许路径、查询参数、凭据、示例域名、本地域名、常见内网地址或自定义端口。此逻辑不执行 DNS 探测，不替代部署配置与访问控制。

- **本地/预览/缺少有效生产域名**：营销页 noindex，robots 全站 Disallow，sitemap 返回空 URL 列表；不输出 canonical、分享图绝对 URL 或带生产 URL 的 JSON-LD。
- **明确配置的正式环境**：只允许营销页收录；canonical、OG、Twitter、sitemap 和 JSON-LD 从同一个真实 origin 派生。

`robots.txt` 不是安全措施。用户数据和后台仍依靠原有服务端身份与权限校验。生产 robots 阻止工作台、账号、资产、后台与接口等路径的抓取；对应页面同时声明 noindex。对于已被搜索引擎收录的旧业务 URL，后续运营时应使用搜索引擎移除流程或暂时允许爬虫读取 noindex，单纯 Disallow 不能移除历史索引。

## Metadata 与结构化数据

`web/lib/seo.ts` 封装 Next.js 原生 Metadata，提供独立 title、description、canonical、Open Graph、Twitter 和 robots。首页与五个功能页复用后台网站名称与图标；品牌 Provider 不再直接写 `document.title`，避免覆盖功能页标题。后台保存品牌后刷新服务端路由 Metadata。

营销布局按请求渲染，避免 API 在构建时离线导致默认品牌被永久缓存。`getSiteBranding` 沿用原有 React cache 请求内去重和 2 秒超时回退。

`app/sitemap.ts` 仅列出首页与五个工具页，不包含用户资产、任务、登录和后台。`app/robots.ts` 按环境输出。首页在正式配置后输出 Organization 与 WebSite JSON-LD，内容只包含真实名称、URL、语言和关联关系，不输出评分、价格或用户数量。序列化会转义 `<`。

## 内容与素材维护

- 文案集中于 `web/lib/marketing-content.ts`。每个功能页有独立介绍、能力边界、步骤、FAQ 与 CTA。
- 官网现使用官方内置生图工具专属制作的新素材，统一标注「AI 视觉概念示例」。不复用旧作品、未知授权的灵感库或用户私有资产；不将外部工具的概念图宣传为 iStudio 实际任务。
- 素材统一由 `web/lib/marketing-assets.ts` 维护，保存于 `web/public/images/marketing/`。Prompt、来源、同商品编辑关系和优化尺寸见 [专属视觉素材](marketing-visuals/README.md)。旧电商工具选择页的素材保留，官网及五个 SEO 页不再引用它们。
- `MarketingExample.image` 支持维护本地图片路径、alt 和真实宽高。确认公开展示权利后替换。建议 WebP/AVIF，保留稳定尺寸。
- 分享图使用本批云海城市的 1200×630 裁切，由统一素材配置维护。原 `share.png` 留存但不再作为官网 OG/Twitter 图。
- 未创建教程、隐私政策或用户条款的空链接；应在有正式内容后补充页面与 Footer。

使用 Next.js 原生 [Metadata API](https://nextjs.org/docs/15/app/api-reference/functions/generate-metadata) 与 [Metadata 文件约定](https://nextjs.org/docs/app/api-reference/file-conventions/metadata)，没有新增运行时依赖。
