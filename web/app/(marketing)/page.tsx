import Link from 'next/link'
import { redirect } from 'next/navigation'
import { ArrowUpRight, Check } from 'lucide-react'
import { BottomCta, Example, Faq, Steps, ToolCards } from '@/components/marketing/sections'
import { homeDescription, homeExamples, homeFaqs, homeSteps } from '@/lib/marketing-content'
import { marketingMetadata, serializeJsonLd, siteStructuredData } from '@/lib/seo'
import { getSiteBranding } from '@/lib/site-settings-server'
import { legacyStudioQuery } from '@/lib/studio-navigation'

export async function generateMetadata() {
  const { name } = await getSiteBranding()
  return marketingMetadata({
    title: 'AI 图片生成器与电商商品图制作工具',
    description: homeDescription.replaceAll('iStudio', name),
    path: '/',
    name,
  })
}

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const legacy = legacyStudioQuery(await searchParams)
  if (legacy) redirect(legacy)
  const { name } = await getSiteBranding()
  const structuredData = siteStructuredData(name)
  return (
    <>
      {structuredData && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: serializeJsonLd(structuredData) }}
        />
      )}
      <main id="marketing-main" tabIndex={-1}>
        <section className="marketing-hero marketing-container">
          <div className="marketing-hero-copy">
            <p className="marketing-product-line">
              <span aria-hidden="true" />
              {name} · 一站式 AI 图片创作平台
            </p>
            <h1>让灵感拥有画面</h1>
            <p className="marketing-hero-description">
              AI 图片生成、参考图创作、电商商品图制作与图片提示词反推。
              <br className="marketing-desktop-break" />
              从个人灵感到商业视觉，在 {name} 一站完成。
            </p>
            <div className="marketing-hero-actions">
              <Link className="marketing-button" href="/studio">
                免费开始创作 <ArrowUpRight size={18} aria-hidden="true" />
              </Link>
              <Link
                className="marketing-button marketing-button-secondary"
                href="/tools/ai-product-photo"
              >
                探索电商工具
              </Link>
            </div>
            <p className="marketing-cta-note">进入工作台无需付费，生成图片按所选模型消耗积分。</p>
          </div>
          <div className="marketing-hero-gallery">
            {homeExamples.map((example, i) => (
              <Example key={example.kind} example={example} priority={i === 1} focus />
            ))}
          </div>
          <p className="marketing-example-note">
            电商与服装图片为项目自有 AI 功能示意；真实作品将在获得展示授权后补充。
          </p>
        </section>
        <div className="marketing-container">
          <section className="marketing-section" aria-labelledby="core-tools">
            <div className="marketing-section-heading">
              <h2 id="core-tools">
                从创意到成品，
                <br />
                一站完成 AI 图片创作
              </h2>
              <p>
                灵感不必停在脑海里。
                <br />
                找到合适的工具，把每一步接起来。
              </p>
            </div>
            <div id="ai-tools" className="marketing-tool-group">
              <h3 className="marketing-group-title">AI 创作工具</h3>
              <ToolCards group="ai" />
            </div>
            <div id="commerce-tools" className="marketing-tool-group">
              <h3 className="marketing-group-title">电商视觉工具</h3>
              <ToolCards group="commerce" />
            </div>
          </section>
          <section
            className="marketing-section marketing-split"
            aria-labelledby="creation-showcase"
          >
            <div className="marketing-split-copy">
              <h2 id="creation-showcase">
                从一句话开始，
                <br />
                探索无限创意
              </h2>
              <p>
                文字是画面的起点，参考图让方向更清晰。把构图、光线与风格写进描述，留下值得继续打磨的版本。
              </p>
              <ul className="marketing-checks">
                {[
                  '文字描述生成图片',
                  '上传参考图辅助创作',
                  '多种风格与参考强度',
                  '画面比例与清晰度选择',
                ].map((text) => (
                  <li key={text}>
                    <Check size={17} aria-hidden="true" />
                    {text}
                  </li>
                ))}
              </ul>
              <Link className="marketing-text-link" href="/tools/ai-image-generator">
                开始 AI 图片创作 <ArrowUpRight size={17} aria-hidden="true" />
              </Link>
            </div>
            <div className="marketing-prompt-board">
              <span>把想法写下来</span>
              <p>
                “一座漂浮在云端的花园，
                <br />
                晨光穿过透明的叶片，
                <br />
                安静、轻盈，像一场白日梦。”
              </p>
              <div>
                <span>文字描述</span>
                <span>参考图片</span>
                <span>风格与比例</span>
              </div>
              <small>创作描述示意 · 生成案例待补充</small>
            </div>
          </section>
          <section
            className="marketing-section marketing-split marketing-split-reverse"
            aria-labelledby="commerce-showcase"
          >
            <div className="marketing-split-copy">
              <h2 id="commerce-showcase">
                让商品视觉制作
                <br />
                更简单
              </h2>
              <p>
                从一张清楚的商品照片开始。为主图换一个场景，为材质补一道光，也为服装规划一组展示画面。
              </p>
              <ul className="marketing-checks">
                {[
                  '商品主图与展示场景',
                  '产品图片精修',
                  '按模块组织详情素材',
                  '服装组图与模特上身',
                ].map((text) => (
                  <li key={text}>
                    <Check size={17} aria-hidden="true" />
                    {text}
                  </li>
                ))}
              </ul>
              <Link className="marketing-text-link" href="/tools/ai-product-photo">
                探索 AI 电商工具 <ArrowUpRight size={17} aria-hidden="true" />
              </Link>
            </div>
            <div>
              <Example example={homeExamples[1]!} />
              <p className="marketing-example-note">
                左：原图场景示意 · 右：商品展示场景示意。AI 生成后需核对商品轮廓、文字与细节。
              </p>
            </div>
          </section>
          <section className="marketing-section" aria-labelledby="home-steps">
            <h2 id="home-steps">三步开始你的 AI 创作</h2>
            <Steps steps={homeSteps} />
          </section>
          <section className="marketing-section marketing-faq-section" aria-labelledby="home-faq">
            <div>
              <h2 id="home-faq">
                关于创作，
                <br />
                你可能还想知道
              </h2>
              <p>常见问题，在这里找到答案。</p>
            </div>
            <Faq items={homeFaqs} />
          </section>
        </div>
      </main>
      <BottomCta />
    </>
  )
}
