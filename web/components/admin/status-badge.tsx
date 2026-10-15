import type { ReactNode } from 'react'

export type AdminTone = 'success' | 'danger' | 'warning' | 'neutral'

export function AdminStatusBadge({
  tone = 'neutral',
  children,
}: {
  tone?: AdminTone
  children: ReactNode
}) {
  return (
    <span className="admin-status" data-tone={tone}>
      <span className="admin-status-dot" aria-hidden="true" />
      {children}
    </span>
  )
}
