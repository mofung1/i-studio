'use client'
import { Field, FieldGroup, FieldLabel, FieldLegend, FieldSet } from '@/components/admin/ui/field'
import { Input } from '@/components/admin/ui/input'
import { Button } from '@/components/admin/ui/button'

import type { FormEvent } from 'react'
import { Save } from 'lucide-react'
import type { AdminOperations as Operations } from '@/lib/admin'
export function AdminOperationsForm({
  ops,
  gift,
  giftBudget,
  checkinReward,
  checkinBudget,
  onCheckinRewardChange,
  onCheckinBudgetChange,
  creditAlert,
  onGiftBudgetChange,
  onCreditAlertChange,
  busy,
  onChange,
  onGiftChange,
  onSubmit,
}: {
  ops: Operations
  gift: string
  giftBudget?: string
  checkinReward: string
  checkinBudget: string
  onCheckinRewardChange: (value: string) => void
  onCheckinBudgetChange: (value: string) => void
  creditAlert?: string
  onGiftBudgetChange?: (value: string) => void
  onCreditAlertChange?: (value: string) => void
  busy: boolean
  onChange: (value: Operations) => void
  onGiftChange: (value: string) => void
  onSubmit: (event: FormEvent) => void
}) {
  return (
    <form className="ops-card ops-form" onSubmit={(event) => void onSubmit(event)}>
      <FieldSet disabled={busy}>
        <FieldLegend>账户与注册</FieldLegend>
        <FieldGroup className="ops-form-grid">
          <Field>
            <FieldLabel className="settings-field">
              <span>前台积分名称</span>
              <Input
                required
                value={ops.creditName}
                maxLength={12}
                onChange={(event) => onChange({ ...ops, creditName: event.target.value })}
              />
              <small>例如：积分、点数、创作币</small>
            </FieldLabel>
          </Field>
          <Field>
            <FieldLabel className="settings-field">
              <span>注册赠送数量</span>
              <Input
                required
                inputMode="decimal"
                value={gift}
                onChange={(event) => onGiftChange(event.target.value)}
              />
              <small>0 表示不赠送，最多保留两位小数</small>
            </FieldLabel>
          </Field>
        </FieldGroup>
        <div className="ops-form-switches">
          <label className="settings-switch">
            <input
              type="checkbox"
              checked={ops.registrationEnabled}
              onChange={(event) => onChange({ ...ops, registrationEnabled: event.target.checked })}
            />
            开放新用户注册
          </label>
          <label className="settings-switch">
            <input
              type="checkbox"
              checked={ops.registrationInviteRequired ?? false}
              onChange={(event) =>
                onChange({ ...ops, registrationInviteRequired: event.target.checked })
              }
            />
            注册需要邀请码
          </label>
        </div>
        <Field>
          <FieldLabel className="settings-field">
            <span>设置或更换邀请码</span>
            <Input
              type="password"
              autoComplete="off"
              value={ops.registrationInviteCode ?? ''}
              minLength={8}
              maxLength={64}
              pattern="[A-Za-z0-9_-]{8,64}"
              onChange={(event) => onChange({ ...ops, registrationInviteCode: event.target.value })}
              placeholder={
                ops.registrationInviteConfigured ? '已配置，留空保留原邀请码' : '尚未配置'
              }
            />
            <small>
              8–64 位字母、数字、下划线或短横线。保存后不返回原文；关闭邀请限制可恢复公开注册。
            </small>
          </FieldLabel>
        </Field>
      </FieldSet>
      <FieldSet disabled={busy}>
        <FieldLegend>签到与积分获取</FieldLegend>
        <label className="settings-switch">
          <input
            type="checkbox"
            checked={ops.checkinEnabled ?? false}
            onChange={(event) => onChange({ ...ops, checkinEnabled: event.target.checked })}
          />
          开启每日签到奖励
        </label>
        <FieldGroup className="ops-form-grid">
          <Field>
            <FieldLabel className="settings-field">
              <span>每次签到赠送数量</span>
              <Input
                required
                inputMode="decimal"
                value={checkinReward}
                onChange={(event) => onCheckinRewardChange(event.target.value)}
              />
              <small>0 表示不发放，最多两位小数；每账号按北京时间每天领取一次。</small>
            </FieldLabel>
          </Field>
          <Field>
            <FieldLabel className="settings-field">
              <span>每日签到赠送总预算</span>
              <Input
                required
                inputMode="decimal"
                value={checkinBudget}
                onChange={(event) => onCheckinBudgetChange(event.target.value)}
              />
              <small>单位：{ops.creditName}。0 或剩余额度不足时暂停领取，不影响已到账奖励。</small>
            </FieldLabel>
          </Field>
          <Field>
            <FieldLabel className="settings-field">
              <span>积分申请说明</span>
              <Input
                value={ops.creditHelpText ?? ''}
                maxLength={500}
                onChange={(event) => onChange({ ...ops, creditHelpText: event.target.value })}
                placeholder="说明申请积分时需要提供的信息"
              />
            </FieldLabel>
          </Field>
          <Field>
            <FieldLabel className="settings-field">
              <span>积分联系入口</span>
              <Input
                value={ops.creditContactUrl ?? ''}
                maxLength={500}
                onChange={(event) => onChange({ ...ops, creditContactUrl: event.target.value })}
                placeholder="https://客服页面 或 mailto:邮箱"
              />
              <small>支持 http、https 网页或 mailto 邮箱链接；留空时明确提示入口暂未配置。</small>
            </FieldLabel>
          </Field>
        </FieldGroup>
      </FieldSet>
      <FieldSet disabled={busy}>
        <FieldLegend>网站公告</FieldLegend>
        <label className="settings-switch">
          <input
            type="checkbox"
            checked={ops.announcementEnabled ?? false}
            onChange={(event) => onChange({ ...ops, announcementEnabled: event.target.checked })}
          />
          发布公告
        </label>
        <FieldGroup>
          <Field>
            <FieldLabel className="settings-field">
              <span>公告标题</span>
              <Input
                value={ops.announcementTitle ?? ''}
                maxLength={60}
                required={ops.announcementEnabled}
                onChange={(event) => onChange({ ...ops, announcementTitle: event.target.value })}
              />
            </FieldLabel>
          </Field>
          <Field>
            <FieldLabel className="settings-field">
              <span>公告正文</span>
              <textarea
                className="ops-announcement-content"
                value={ops.announcementContent ?? ''}
                maxLength={2000}
                required={ops.announcementEnabled}
                onChange={(event) => onChange({ ...ops, announcementContent: event.target.value })}
              />
              <small>纯文本显示，支持换行；发布后前台可查看，内容更新会重新提示。</small>
            </FieldLabel>
          </Field>
        </FieldGroup>
      </FieldSet>
      <FieldSet disabled={busy}>
        <FieldLegend>单用户使用上限</FieldLegend>
        <FieldGroup className="ops-form-grid">
          {(
            [
              ['maxConcurrentTasks', '同时生成任务数', 16],
              ['generationRequestsPerHour', '每小时生成任务数', 1000],
              ['auxiliaryRequestsPerHour', '每小时提示词辅助次数', 1000],
            ] as const
          ).map(([key, label, max]) => (
            <Field key={key}>
              <FieldLabel className="settings-field">
                <span>{label}</span>
                <Input
                  type="number"
                  required
                  min={1}
                  max={max}
                  value={ops[key]}
                  onChange={(event) => onChange({ ...ops, [key]: Number(event.target.value) })}
                />
              </FieldLabel>
            </Field>
          ))}
        </FieldGroup>
        <p>提示词优化、图片反推和服装分析共用辅助次数上限，首版不另扣积分。</p>
      </FieldSet>
      <FieldSet disabled={busy}>
        <FieldLegend>平台额度与告警</FieldLegend>
        <FieldGroup className="ops-form-grid">
          {(
            [
              ['platformAuxiliaryConcurrent', '平台同时辅助请求数', 1, 100, 4],
              ['platformAuxiliaryPerDay', '平台每日辅助请求总数', 1, 1000000, 1000],
            ] as const
          ).map(([key, label, min, max, fallback]) => (
            <Field key={key}>
              <FieldLabel className="settings-field">
                <span>{label}</span>
                <Input
                  type="number"
                  required
                  min={min}
                  max={max}
                  step={1}
                  value={ops[key] ?? fallback}
                  onChange={(event) => onChange({ ...ops, [key]: Number(event.target.value) })}
                />
              </FieldLabel>
            </Field>
          ))}
          <Field>
            <FieldLabel className="settings-field">
              <span>每日注册赠送总预算</span>
              <Input
                required
                inputMode="decimal"
                value={giftBudget ?? '1000'}
                onChange={(event) => onGiftBudgetChange?.(event.target.value)}
              />
              <small>
                单位：{ops.creditName}。0
                表示没有赠送预算；不足以全额赠送时暂停新注册，不少发承诺数量。
              </small>
            </FieldLabel>
          </Field>
          <Field>
            <FieldLabel className="settings-field">
              <span>每日消耗告警阈值</span>
              <Input
                required
                inputMode="decimal"
                value={creditAlert ?? '1000'}
                onChange={(event) => onCreditAlertChange?.(event.target.value)}
              />
              <small>
                单位：{ops.creditName}。0 关闭；达到阈值在运营概览提示，不中止已创建任务。
              </small>
            </FieldLabel>
          </Field>
          <Field>
            <FieldLabel className="settings-field">
              <span>每账号存储额度（MiB）</span>
              <Input
                type="number"
                required
                min={1}
                max={1048576}
                step={1}
                value={(ops.accountStorageLimitBytes ?? 1073741824) / 1048576}
                onChange={(event) =>
                  onChange({
                    ...ops,
                    accountStorageLimitBytes: Number(event.target.value) * 1048576,
                  })
                }
              />
              <small>包括作品、素材、仍被历史引用的图片及反推暂存。降低额度不删除已有内容。</small>
            </FieldLabel>
          </Field>
        </FieldGroup>
        <p>
          每日额度按北京时间自然日计算。辅助额度按实际开始的请求计数，失败也占用次数；已创建任务继续完成。这里的积分和次数不代表供应商真实账单。
        </p>
      </FieldSet>
      <div className="settings-form-actions">
        <Button disabled={busy}>
          <Save data-icon="inline-start" />
          {busy ? '保存中…' : '保存设置'}
        </Button>
      </div>
    </form>
  )
}
