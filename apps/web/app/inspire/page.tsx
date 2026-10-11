import { InspirationGallery } from '@/components/inspiration-gallery'
import { StudioShell } from '@/components/studio-shell'

export default function InspirePage() {
  return <StudioShell section="inspire" title="灵感">
    <main className="studio-inspiration"><InspirationGallery /></main>
  </StudioShell>
}
