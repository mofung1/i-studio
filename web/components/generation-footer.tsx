'use client'

import { Loader2, Sparkles } from 'lucide-react'
import type { ReactNode } from 'react'
import { useAccount } from './account-provider'
import {
  GenerationCost,
  type CreditHelpNavigation,
  type useGenerationCost,
} from './generation-cost'
import { LoginLink } from './login-link'

interface GenerationFooterProps {
  cost: ReturnType<typeof useGenerationCost>
  label: string
  onSubmit: () => void
  disabled?: boolean
  busy?: boolean
  title?: string
  describedBy?: string
  creditHelp?: CreditHelpNavigation
  popoverContainer?: HTMLElement | null
  children?: ReactNode
}

export function GenerationFooter({
  cost,
  label,
  onSubmit,
  disabled = false,
  busy = false,
  title,
  describedBy,
  creditHelp,
  popoverContainer,
  children,
}: GenerationFooterProps) {
  const { account } = useAccount()

  return (
    <div className="generation-footer">
      <GenerationCost
        {...cost}
        fallbackBalance={{ availableMinor: account.available, creditName: account.creditName }}
        creditHelp={creditHelp}
        popoverContainer={popoverContainer}
      />
      {children}
      {!cost.authenticated && !cost.loading ? (
        <LoginLink className="generate-button">
          <Sparkles size={17} aria-hidden="true" />
          登录后开始创作
        </LoginLink>
      ) : (
        <button
          className="generate-button"
          type="button"
          disabled={disabled || busy || cost.loading || !cost.quote?.canAfford}
          title={title}
          aria-describedby={describedBy}
          onClick={onSubmit}
        >
          {busy ? (
            <Loader2 size={17} className="animate-spin" aria-hidden="true" />
          ) : (
            <Sparkles size={17} aria-hidden="true" />
          )}
          {cost.loading ? '正在确认登录状态…' : label}
        </button>
      )}
    </div>
  )
}
