'use client'
import { AdminPageHeader } from '@/components/admin/page-header'

import { useState } from 'react'
import { SiteSettingsPanel } from '@/components/site-settings-panel'
import { useAdminUnsavedChanges } from '@/components/admin/use-unsaved-changes'

export default function AdminSitePage() {
  const [dirty, setDirty] = useState(false)
  useAdminUnsavedChanges(dirty)
  return (
    <main className="ai-settings admin-site-page">
      <AdminPageHeader title="网站配置" />
      <SiteSettingsPanel onDirtyChange={setDirty} />
    </main>
  )
}
