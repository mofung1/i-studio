import type { ReactNode } from 'react'
import { ChevronDown, Info } from 'lucide-react'

/** Page context stays available without competing with the working area. */
export function AdminPageHeader({
  title,
  description,
  actions,
  tools,
  children,
}: {
  title: string
  description: string
  actions?: ReactNode
  tools?: ReactNode
  children?: ReactNode
}) {
  return (
    <header className="admin-page-header">
      <details key={title} className="admin-page-info">
        <summary>
          <Info size={15} aria-hidden="true" />
          <span>页面说明</span>
          <ChevronDown size={14} aria-hidden="true" />
        </summary>
        <div className="admin-page-info-body">
          <h1>{title}</h1>
          <p>{description}</p>
          {children}
        </div>
      </details>
      {(tools || actions) && (
        <div className="admin-page-controls">
          {tools}
          {actions}
        </div>
      )}
    </header>
  )
}
