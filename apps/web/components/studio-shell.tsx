import { ThemeToggle } from '@/components/theme-toggle'
import Link from 'next/link'
import { Plus } from 'lucide-react'
import type { ReactNode } from 'react'
import { AccountMenu } from './account-menu'
import { WorkbenchRail, type StudioSection } from './workbench/workbench-rail'

export function StudioShell({ section, title, subtitle, actions, children }: { section: StudioSection; title: string; subtitle?: string; actions?: ReactNode; children: ReactNode }) {
  return <div className="studio-shell">
    <WorkbenchRail section={section} />
    <header className="studio-topbar"><div className="studio-breadcrumb"><strong>{title}</strong>{subtitle && <><span>/</span><span>{subtitle}</span></>}</div><div className="studio-topbar-actions">{actions ?? (section !== 'commerce' && section !== 'inspire' ? <Link className="studio-primary" href="/workbench?mode=general"><Plus size={16} />开始创作</Link> : null)}<ThemeToggle /><AccountMenu /></div></header>
    <div className="studio-content">{children}</div>
  </div>
}
