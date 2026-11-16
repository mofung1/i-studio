import type { ReactNode } from 'react'
import { adminPages } from './navigation'

export function AdminPageHeader({
  title,
  description,
  actions,
  tools,
}: {
  title: string
  description?: string
  actions?: ReactNode
  tools?: ReactNode
}) {
  const help = description ?? adminPages.find((page) => page.title === title)?.description
  return (
    <header className="admin-page-header">
      <div className="admin-page-heading">
        <h1>{title}</h1>
        {help && <p>{help}</p>}
      </div>
      {(tools || actions) && (
        <div className="admin-page-controls">
          {tools && <div className="admin-page-tools">{tools}</div>}
          {actions && <div className="admin-page-actions">{actions}</div>}
        </div>
      )}
    </header>
  )
}
