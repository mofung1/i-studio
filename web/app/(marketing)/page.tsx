import { redirect } from 'next/navigation'
import Link from 'next/link'
import { BottomCta, Faq } from '@/components/marketing/sections'
import { homeDescription, homeFaqs } from '@/lib/marketing-content'
import { marketingMetadata, serializeJsonLd, siteStructuredData } from '@/lib/seo'
import { getSiteBranding } from '@/lib/site-settings-server'
import { legacyStudioQuery } from '@/lib/studio-navigation'
import { EditorialHero } from '@/components/marketing/editorial-hero'
import { CreativeGallery } from '@/components/marketing/visual-sections'
import { ToolShowcase } from '@/components/marketing/tool-showcase'
import { WorkbenchPreview } from '@/components/marketing/workbench-preview'

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
      <main id="marketing-main" className="marketing-home" tabIndex={-1}>
        <EditorialHero />
        <div className="marketing-container">
          <ToolShowcase />
          <WorkbenchPreview />
          <CreativeGallery />
          <section className="marketing-section marketing-faq-section" aria-labelledby="home-faq">
            <div>
              <h2 id="home-faq">费用与常见问题</h2>
              <p>生成前查看预计积分，完成后按实际交付结算，未交付部分自动退回。</p>
              <Link className="marketing-text-link" href="/account#credits">
                查看积分获取方式
              </Link>
            </div>
            <Faq items={homeFaqs} />
          </section>
        </div>
      </main>
      <BottomCta compact />
      <p className="marketing-visual-disclosure marketing-container">
        创作示例为 AI 概念作品；工作台图片为真实界面截图。
      </p>
    </>
  )
}
