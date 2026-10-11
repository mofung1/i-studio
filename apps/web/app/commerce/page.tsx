import Link from 'next/link'
import { ArrowRight } from 'lucide-react'
import { StudioShell } from '@/components/studio-shell'
import { commerceTasks } from '@/components/workbench/shared'

export default function CommercePage() {
  return <StudioShell section="commerce" title="电商工具">
    <main className="commerce-page">
      <div className="commerce-tool-grid">{commerceTasks.map(([id, meta]) => <Link className="commerce-tool" key={id} href={`/workbench?mode=commerce&task=${id}`}>
        <div className="commerce-tool-image"><img src={meta.image} alt={`${meta.title}示意图`} /><span>视觉示意</span></div>
        <div className="commerce-tool-copy"><div className="commerce-tool-heading"><h2>{meta.title}</h2><span>进入工具<ArrowRight size={18} aria-hidden="true" /></span></div><p>{meta.description}</p></div>
      </Link>)}</div>
    </main>
  </StudioShell>
}
