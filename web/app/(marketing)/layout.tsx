import type { ReactNode } from 'react'
import { MarketingNavigation } from '@/components/marketing/navigation'
import { MarketingFooter } from '@/components/marketing/sections'
import { getSiteBranding } from '@/lib/site-settings-server'

// Branding and deployment indexing flags must not freeze to an API-offline build fallback.
export const dynamic = 'force-dynamic'

export default async function MarketingLayout({ children }: { children: ReactNode }) {
  const branding = await getSiteBranding()
  return (
    <div className="marketing-site">
      <a className="skip-link" href="#marketing-main">
        跳至主要内容
      </a>
      <MarketingNavigation />
      {children}
      <MarketingFooter name={branding.name} />
    </div>
  )
}
