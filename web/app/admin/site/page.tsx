'use client'
import { AdminPageHeader } from '@/components/admin/page-header'

import { SiteSettingsPanel } from '@/components/site-settings-panel'

export default function AdminSitePage() {
  return (
    <main className="ai-settings admin-site-page">
      <AdminPageHeader title="网站配置" />
      <SiteSettingsPanel />
    </main>
  )
}
