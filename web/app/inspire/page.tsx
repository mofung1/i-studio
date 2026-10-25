import { InspirationGallery } from '@/components/inspiration-gallery'
import { StudioShell } from '@/components/studio-shell'
import { PromptReverseButton } from '@/components/prompt-reverse-provider'
import { getSiteBranding } from '@/lib/site-settings-server'
import Link from 'next/link'

export async function generateMetadata() {
  const { name } = await getSiteBranding()
  return {
    title: `灵感广场 | ${name}`,
    description: '公开浏览创作灵感，搜索与复制提示词，带入 AI 图片创作工作台。',
  }
}

export default function InspirePage() {
  return (
    <StudioShell
      section="inspire"
      title="灵感"
      actions={
        <div className="inspiration-topbar-tools">
          <Link className="studio-secondary" href="/inspire/submissions">
            我的投稿
          </Link>
          <Link className="studio-primary" href="/inspire/submissions?new=1">
            分享提示词
          </Link>
          <PromptReverseButton />
        </div>
      }
    >
      <main className="studio-inspiration">
        <h1 className="sr-only">公开灵感广场</h1>
        <InspirationGallery />
      </main>
    </StudioShell>
  )
}
