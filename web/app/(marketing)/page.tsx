import { redirect } from 'next/navigation'
import { BottomCta, Faq } from '@/components/marketing/sections'
import { homeDescription, homeFaqs } from '@/lib/marketing-content'
import { marketingMetadata, serializeJsonLd, siteStructuredData } from '@/lib/seo'
import { getSiteBranding } from '@/lib/site-settings-server'
import { legacyStudioQuery } from '@/lib/studio-navigation'
import { EditorialHero } from '@/components/marketing/editorial-hero'
import { EcommerceShowcase, CreativeGallery } from '@/components/marketing/visual-sections'
import { ToolShowcase } from '@/components/marketing/tool-showcase'

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
        <EditorialHero />
        <div className="marketing-container">
          <ToolShowcase />
          <EcommerceShowcase />
          <CreativeGallery />
          <section className="marketing-section marketing-faq-section" aria-labelledby="home-faq">
            <div>
              <h2 id="home-faq">
                关于创作，
                <br />
                你可能还想知道
              </h2>
            </div>
            <Faq items={homeFaqs} />
          </section>
        </div>
      </main>
      <BottomCta />
      <p className="marketing-visual-disclosure marketing-container">展示图片为 AI 概念作品。</p>
    </>
  )
}
