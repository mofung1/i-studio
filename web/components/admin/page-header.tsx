import type { ReactNode } from 'react'

export function AdminPageHeader({
  title,
  actions,
  tools,
}: {
  title: string
  actions?: ReactNode
  tools?: ReactNode
}) {
  return (
    <header className="admin-page-header">
      <h1>{title}</h1>
      {(tools || actions) && (
        <div className="admin-page-controls">
          {tools}
          {actions}
        </div>
      )}
    </header>
  )
}
