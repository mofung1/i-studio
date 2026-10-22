'use client'

import Link from 'next/link'
import { CalendarCheck, Check, Loader2 } from 'lucide-react'
import type { CreditPolicy } from '@/lib/credit-policy'
import { formatCredits } from '@/lib/credits'

export function CreditBenefits({
  policy,
  unit,
  username,
  claiming,
  message,
  onClaim,
}: {
  policy: CreditPolicy
  unit: string
  username: string
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
        <h2 id="credit-benefits-title">获取{unit}</h2>
        <Link href="/studio">返回创作</Link>
      </div>
      <div className="credit-benefits-grid">
        <div className="credit-benefit-item">
          <h3>
            <CalendarCheck size={18} aria-hidden="true" />
            每日签到
          </h3>
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
          <small>按北京时间每天领取一次，次日 00:00 更新。</small>
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
        <div className="credit-benefit-item">
          <h3>补充{unit}</h3>
          <p>{policy.helpText || `如需补充${unit}，请联系网站管理员，并提供你的用户名。`}</p>
          <p>
            当前用户名：<strong>{username}</strong>
          </p>
          {policy.contactUrl ? (
            <a className="studio-secondary" href={policy.contactUrl}>
              联系管理员获取{unit}
            </a>
          ) : (
            <small>
              联系入口暂未配置。
              {state.enabled ? '你可以先通过每日签到领取。' : '请等待网站管理员配置联系入口。'}
            </small>
          )}
          <small>当前采用管理员人工发放，到账后可在下方流水中核对。</small>
        </div>
      </div>
      <div className="credit-rules">
        <p>
          当前新账号注册赠送 {formatCredits(policy.signupGiftMinor)} {unit}
          ，已有账号不补发；实际以注册时生效的配置为准。
        </p>
        <p>
          生成按所选模型单价 × 图片张数预留{unit}
          ，完成后按实际交付张数结算，失败或未交付部分自动退回。生成中的预留不计入可用余额。
        </p>
        <p>提示词优化、图片反推和服装分析不另扣{unit}，受平台辅助次数和额度限制。</p>
      </div>
    </section>
  )
}
