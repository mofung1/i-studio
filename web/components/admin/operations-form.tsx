'use client'

import type { FormEvent } from 'react'
import { Save } from 'lucide-react'
import type { AdminOperations as Operations } from '@/lib/admin'
export function AdminOperationsForm({
  ops,
  gift,
  busy,
  onChange,
  onGiftChange,
  onSubmit,
}: {
  ops: Operations
  gift: string
  busy: boolean
  onChange: (value: Operations) => void
  onGiftChange: (value: string) => void
  onSubmit: (event: FormEvent) => void
}) {
  return (
    <form className="ops-card ops-form" onSubmit={(event) => void onSubmit(event)}>
      <fieldset disabled={busy}>
        <legend>账户与注册</legend>
        <div className="ops-form-grid">
          <label className="settings-field">
            <span>前台积分名称</span>
            <input
              required
              value={ops.creditName}
              maxLength={12}
              onChange={(event) => onChange({ ...ops, creditName: event.target.value })}
            />
            <small>例如：积分、点数、创作币</small>
          </label>
          <label className="settings-field">
            <span>注册赠送数量</span>
            <input
              required
              inputMode="decimal"
              value={gift}
              onChange={(event) => onGiftChange(event.target.value)}
            />
            <small>0 表示不赠送，最多保留两位小数</small>
          </label>
        </div>
        <label className="settings-switch">
          <input
            type="checkbox"
            checked={ops.registrationEnabled}
            onChange={(event) => onChange({ ...ops, registrationEnabled: event.target.checked })}
          />
          开放新用户注册
        </label>
      </fieldset>
      <fieldset disabled={busy}>
        <legend>单用户使用上限</legend>
        <div className="ops-form-grid">
          {(
            [
              ['maxConcurrentTasks', '同时生成任务数', 16],
              ['generationRequestsPerHour', '每小时生成任务数', 1000],
              ['auxiliaryRequestsPerHour', '每小时提示词辅助次数', 1000],
            ] as const
          ).map(([key, label, max]) => (
            <label className="settings-field" key={key}>
              <span>{label}</span>
              <input
                type="number"
                required
                min={1}
                max={max}
                value={ops[key]}
                onChange={(event) => onChange({ ...ops, [key]: Number(event.target.value) })}
              />
            </label>
          ))}
        </div>
        <p>提示词优化、图片反推和服装分析共用辅助次数上限，首版不另扣积分。</p>
      </fieldset>
      <div className="settings-form-actions">
        <button className="settings-primary" disabled={busy}>
          <Save size={16} />
          {busy ? '保存中…' : '保存设置'}
        </button>
      </div>
    </form>
  )
}
