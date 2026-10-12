import { InspirationPromptManager } from '@/components/inspiration-prompt-manager'
import { StudioShell } from '@/components/studio-shell'

export default function InspirationManagementPage() {
  return <StudioShell section="inspire" title="灵感" subtitle="提示词管理"><InspirationPromptManager /></StudioShell>
}
