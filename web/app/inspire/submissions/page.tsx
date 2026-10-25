import { StudioShell } from '@/components/studio-shell'
import { MyInspirationSubmissions } from '@/components/inspiration-submissions'

export const metadata = { title: '我的投稿', robots: { index: false, follow: false } }
export default function SubmissionsPage() {
  return (
    <StudioShell section="inspire" title="我的投稿">
      <MyInspirationSubmissions />
    </StudioShell>
  )
}
