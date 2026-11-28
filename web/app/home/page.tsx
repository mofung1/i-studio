import type { Metadata } from 'next'

import { CreationHome } from '@/components/creation-home'
import { StudioShell } from '@/components/studio-shell'
import { getSiteBranding } from '@/lib/site-settings-server'

export const dynamic = 'force-dynamic'

export async function generateMetadata(): Promise<Metadata> {
  const { name } = await getSiteBranding()
  return {
    title: `创作首页 | ${name}`,
    description: '从一句描述开始，也可以先浏览灵感，再带入工作台继续创作。',
    robots: { index: false, follow: false },
  }
}

export default function HomePage() {
  return (
    <StudioShell section="home" title="首页" chrome="immersive">
      <CreationHome />
    </StudioShell>
  )
}
