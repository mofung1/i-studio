import Link from 'next/link'
import { ArrowLeft, Pencil } from 'lucide-react'
import { InspirationCategoryManager } from '@/components/inspiration-category-manager'
import { StudioShell } from '@/components/studio-shell'

export default function InspirationCategoriesPage() {
  return <StudioShell section="inspire" title="灵感" subtitle="分类管理" actions={
    <nav className="inspiration-category-navigation" aria-label="灵感管理导航">
      <Link className="studio-secondary inspiration-category-return" href="/inspire" aria-label="返回发现灵感" title="返回发现灵感"><ArrowLeft size={16} aria-hidden="true" /><span>返回发现灵感</span></Link>
      <Link className="studio-primary" href="/inspire/manage"><Pencil size={15} aria-hidden="true" />管理提示词</Link>
    </nav>
  }><InspirationCategoryManager /></StudioShell>
}
