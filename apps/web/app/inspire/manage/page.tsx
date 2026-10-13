import { InspirationPromptManager } from '@/components/inspiration-prompt-manager'
import { StudioShell } from '@/components/studio-shell'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'

export default function InspirationManagementPage() {
  return <StudioShell section="inspire" title="灵感" subtitle="提示词管理" actions={<Link className="studio-secondary" href="/inspire"><ArrowLeft size={16} aria-hidden="true" />返回发现灵感</Link>}><InspirationPromptManager /></StudioShell>
}
