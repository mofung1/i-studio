import { InspirationGallery } from '@/components/inspiration-gallery'
import { StudioShell } from '@/components/studio-shell'
import Link from 'next/link'
import { Pencil } from 'lucide-react'

export default function InspirePage() {
  return <StudioShell section="inspire" title="灵感" actions={<Link className="studio-primary" href="/inspire/manage"><Pencil size={15} aria-hidden="true" />管理提示词</Link>}>
    <main className="studio-inspiration"><InspirationGallery /></main>
  </StudioShell>
}
