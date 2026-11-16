import { ThemeToggle } from '@/components/theme-toggle'
import Link from 'next/link'
import { Plus } from 'lucide-react'
import type { ReactNode } from 'react'
import { AccountMenu } from './account-menu'
import { WorkbenchRail, type StudioSection } from './workbench/workbench-rail'
import { studioToolUrl } from '@/lib/studio-navigation'

export function StudioShell({
  section,
  title,
  subtitle,
  actions,
  projectId,
  children,
}: {
  section: StudioSection
  title: string
  subtitle?: string
  actions?: ReactNode
  projectId?: string | null
  children: ReactNode
}) {
  return (
    <div className="studio-shell">
      <a className="skip-link" href="#studio-main">
        跳至主要内容
      </a>
      <WorkbenchRail section={section} projectId={projectId} />
      <header className="studio-topbar">
        <div className="studio-breadcrumb">
          {projectId && (
            <>
              <Link
                href={`/assets?${new URLSearchParams({ project: projectId })}`}
                aria-label="查看当前项目的素材与作品"
              >
                当前项目
              </Link>
              <span>/</span>
            </>
          )}
          <strong>{title}</strong>
          {subtitle && (
            <>
              <span>/</span>
              <span>{subtitle}</span>
            </>
          )}
        </div>
        <div className="studio-topbar-actions">
          {actions ??
            (section !== 'commerce' && section !== 'inspire' ? (
              <Link
                className="studio-primary"
                href={studioToolUrl(
                  'general',
                  undefined,
                  projectId ? new URLSearchParams({ projectId }) : undefined,
                )}
              >
                <Plus size={16} />
                开始创作
              </Link>
            ) : null)}
          <ThemeToggle />
          <AccountMenu />
        </div>
      </header>
      <div className="studio-content" id="studio-main" tabIndex={-1}>
        {children}
      </div>
    </div>
  )
}
