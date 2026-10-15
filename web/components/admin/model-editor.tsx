'use client'

import { useRef, type FormEvent } from 'react'
import { Save } from 'lucide-react'
import type { AdminModel as Model } from '@/lib/admin'
import type { AIEndpoint } from '@/lib/ai-settings'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/select'
export function AdminModelEditor({
  editing,
  endpoints,
  unit,
  price,
  busy,
  onChange,
  onPriceChange,
  onClose,
  onSubmit,
}: {
  editing: Model
  endpoints: AIEndpoint[]
  unit: string
  price: string
  busy: boolean
  onChange: (value: Model) => void
  onPriceChange: (value: string) => void
  onClose: () => void
  onSubmit: (event: FormEvent) => void
}) {
  const editorRef = useRef<HTMLElement>(null)
  return (
    <section ref={editorRef} className="ops-card ops-editor" aria-label="编辑前台模型">
      <form onSubmit={(event) => void onSubmit(event)}>
        <div className="ops-form-grid">
          <label className="settings-field">
            <span>前台显示名称</span>
            <input
              autoFocus
              required
              maxLength={80}
              value={editing.name}
              disabled={busy}
              onChange={(event) => onChange({ ...editing, name: event.target.value })}
            />
          </label>
          <label className="settings-field">
            <span>生图服务通道</span>
            <Select
              value={editing.endpointId}
              disabled={busy}
              onValueChange={(endpointId) => onChange({ ...editing, endpointId })}
            >
              <SelectTrigger aria-label="生图服务通道">
                <SelectValue placeholder="选择通道" />
              </SelectTrigger>
              <SelectContent portalContainer={editorRef.current}>
                {endpoints.map((item) => (
                  <SelectItem key={item.id} value={item.id}>
                    {item.name}
                    {!item.enabled && '（已停用）'}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </label>
          <label className="settings-field">
            <span>每张消耗{unit}</span>
            <input
              required
              inputMode="decimal"
              disabled={busy}
              value={price}
              onChange={(event) => onPriceChange(event.target.value)}
            />
            <small>支持两位小数；0 表示免费模型</small>
          </label>
        </div>
        <div className="settings-checks">
          <label>
            <input
              type="checkbox"
              disabled={busy}
              checked={editing.enabled}
              onChange={(event) =>
                onChange({
                  ...editing,
                  enabled: event.target.checked,
                  isDefault: event.target.checked && editing.isDefault,
                })
              }
            />
            上架到前台
          </label>
          <label>
            <input
              type="checkbox"
              disabled={busy || !editing.enabled}
              checked={editing.isDefault}
              onChange={(event) => onChange({ ...editing, isDefault: event.target.checked })}
            />
            默认模型
          </label>
        </div>
        <div className="settings-form-actions">
          <button
            type="button"
            className="settings-command"
            disabled={busy}
            onClick={() => onClose()}
          >
            取消
          </button>
          <button className="settings-primary" disabled={busy}>
            <Save size={15} />
            保存模型
          </button>
        </div>
      </form>
    </section>
  )
}
