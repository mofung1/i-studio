import { InspirationGallery } from '@/components/inspiration-gallery'
import { StudioShell } from '@/components/studio-shell'
import Link from 'next/link'
import { Pencil } from 'lucide-react'
import { PromptReverseButton } from '@/components/prompt-reverse-provider'

export default function InspirePage() {
  return <StudioShell section="inspire" title="灵感" actions={<div className="inspiration-topbar-tools"><PromptReverseButton /></div>}>
    <main className="studio-inspiration"><InspirationGallery /></main>
  </StudioShell>
}
