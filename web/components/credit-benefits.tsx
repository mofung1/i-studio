'use client'

import Link from 'next/link'
import { CalendarCheck, Check, Loader2 } from 'lucide-react'
import type { CreditPolicy } from '@/lib/credit-policy'
import { formatCredits } from '@/lib/credits'

export function CreditBenefits({
  policy,
  unit,
  claiming,
  message,
  onClaim,
}: {
  policy: CreditPolicy
  unit: string
  claiming: boolean
  message: string
  onClaim: () => void
}) {
  const state = policy.checkin
  return (
    <section
      id="credits"
      className="ops-card credit-benefits"
      aria-labelledby="credit-benefits-title"
    >
      <div className="ops-card-heading">
        <h2 id="credit-benefits-title">
          <CalendarCheck size={18} aria-hidden="true" />
          每日签到
        </h2>
        <Link href="/studio">返回创作</Link>
      </div>
      <div className="credit-benefits-grid">
        <div className="credit-benefit-item">
          {state.claimed ? (
            <p>
              今日已领取{' '}
              <strong>
                {formatCredits(state.claimedRewardMinor)} {unit}
              </strong>
            </p>
          ) : state.enabled ? (
            <p>
              每天领取{' '}
              <strong>
                {formatCredits(state.rewardMinor)} {unit}
              </strong>
            </p>
          ) : (
            <p>签到奖励暂未开放。</p>
          )}
          {(state.enabled || state.claimed) && (
            <button
              type="button"
              className="studio-primary"
              disabled={claiming || !state.canClaim}
              onClick={onClaim}
            >
              {claiming ? (
                <Loader2 size={16} className="animate-spin" aria-hidden="true" />
              ) : state.claimed ? (
                <Check size={16} aria-hidden="true" />
              ) : (
                <CalendarCheck size={16} aria-hidden="true" />
              )}
              {claiming
                ? '领取中…'
                : state.claimed
                  ? '今日已签到'
                  : state.canClaim
                    ? '签到领积分'
                    : '今日暂不可领取'}
            </button>
          )}
          {state.unavailableReason && <p role="status">{state.unavailableReason}</p>}
          {message && (
            <p role="status" className="credit-claim-message">
              {message}
            </p>
          )}
        </div>
      </div>
    </section>
  )
}
