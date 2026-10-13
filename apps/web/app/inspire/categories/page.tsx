import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { InspirationCategoryManager } from '@/components/inspiration-category-manager'
import { StudioShell } from '@/components/studio-shell'

export default function InspirationCategoriesPage() {
  return <StudioShell section="inspire" title="灵感" subtitle="分类管理" actions={<Link className="studio-secondary" href="/inspire"><ArrowLeft size={16} aria-hidden="true" />返回发现灵感</Link>}><InspirationCategoryManager /></StudioShell>
}
