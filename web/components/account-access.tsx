'use client'

import { LoaderCircle, LockKeyhole, RefreshCw } from 'lucide-react'
import type { ReactNode } from 'react'
import { useAccount } from './account-provider'
import { LoginLink } from './login-link'
import { StudioShell } from './studio-shell'
import type { StudioSection } from './workbench/workbench-rail'

export function AccountAccess({
  title,
  description,
  compact = false,
  returnTo,
  onLogin,
}: {
  title: string
  description: string
  compact?: boolean
  returnTo?: string
  onLogin?: () => void
}) {
  const { loading, error, refresh } = useAccount()
  return (
    <div className={`account-access${compact ? ' is-compact' : ''}`}>
      <div className="account-access-content">
        <span className="account-access-icon" aria-hidden="true">
          {loading ? (
            <LoaderCircle size={24} className="animate-spin" />
          ) : (
            <LockKeyhole size={24} />
          )}
        </span>
        {loading ? (
          <p role="status">正在确认登录状态…</p>
        ) : (
          <>
            <h2>{error ? '暂时无法确认登录状态' : title}</h2>
            <p>{error || description}</p>
            <div className="account-access-actions">
              {error && (
                <button className="studio-secondary" type="button" onClick={refresh}>
                  <RefreshCw size={15} aria-hidden="true" />
                  重试
                </button>
              )}
              <LoginLink className="studio-primary" returnTo={returnTo} onClick={onLogin}>
                登录 / 注册
              </LoginLink>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

export function AccountBoundary({
  section,
  title,
  description,
  children,
  returnTo,
}: {
  section: StudioSection
  title: string
  description: string
  children: ReactNode
  returnTo?: string
}) {
  const { account } = useAccount()
  if (account.authenticated) return children
  return (
    <StudioShell section={section} title={title} actions={false}>
      <AccountAccess title={`登录后查看${title}`} description={description} returnTo={returnTo} />
    </StudioShell>
  )
}
