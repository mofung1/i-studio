import type { ReactNode } from 'react'

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
  const heading = <h1 className="sr-only">{title}</h1>
  if (!description && !tools && !actions) return heading

  return (
    <header className="admin-page-header">
      {heading}
      {description && <p className="admin-page-description">{description}</p>}
      {(tools || actions) && (
        <div className="admin-page-controls">
          {tools && <div className="admin-page-tools">{tools}</div>}
          {actions && <div className="admin-page-actions">{actions}</div>}
        </div>
      )}
    </header>
  )
}
