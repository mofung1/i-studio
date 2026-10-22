'use client'

import { useEffect, useState } from 'react'
import { adminRequest, type ImageMeasurement } from '@/lib/admin'
import { formatCostMicros, parseCostMicros } from '@/lib/supplier-cost'
import { Button } from './ui/button'
import { Input } from './ui/input'
import { Field, FieldGroup, FieldLabel } from './ui/field'
import { Alert, AlertDescription } from './ui/alert'

export function ChannelMeasurements({
  endpointId,
  model,
  revision,
}: {
  endpointId: string
  model: string
  revision: number
}) {
  const [open, setOpen] = useState(false)
  const [items, setItems] = useState<ImageMeasurement[]>([])
  const [selected, setSelected] = useState<ImageMeasurement | null>(null)
  const [estimate, setEstimate] = useState('')
  const [actual, setActual] = useState('')
  const [currency, setCurrency] = useState('CNY')
  const [note, setNote] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [loaded, setLoaded] = useState(false)
  useEffect(() => {
    if (!open) return
    const controller = new AbortController()
    let current = true
    setError('')
    setLoaded(false)
    const params = new URLSearchParams({ endpointId, model })
    adminRequest<{ measurements: ImageMeasurement[] }>(
      `image-measurements?${params}`,
      'GET',
      undefined,
      controller.signal,
    )
      .then((data) => {
        if (current) {
          setItems(Array.isArray(data?.measurements) ? data.measurements : [])
          setLoaded(true)
        }
      })
      .catch((error) => {
        if (current && !controller.signal.aborted)
          setError(error instanceof Error ? error.message : '核验记录读取失败')
      })
    return () => {
      current = false
      controller.abort()
    }
  }, [endpointId, model, revision, open])
  function edit(item: ImageMeasurement) {
    setSelected(item)
    setEstimate(item.estimatedCostMicros === null ? '' : String(item.estimatedCostMicros / 1000000))
    setActual(item.actualCostMicros === null ? '' : String(item.actualCostMicros / 1000000))
    setCurrency(item.currency)
    setNote(item.costNote)
    setError('')
  }
  async function save() {
    if (!selected || busy) return
    const estimatedCostMicros = parseCostMicros(estimate),
      actualCostMicros = parseCostMicros(actual)
    if (
      estimatedCostMicros === undefined ||
      actualCostMicros === undefined ||
      !/^[A-Z]{3}$/.test(currency)
    ) {
      setError('费用最多六位小数；未知请留空，币种使用 CNY 或 USD 等三位大写代码')
      return
    }
    setBusy(true)
    setError('')
    try {
      const result = await adminRequest<ImageMeasurement>(
        `image-measurements/${selected.id}`,
        'PUT',
        { estimatedCostMicros, actualCostMicros, currency, costNote: note },
      )
      setItems((previous) => previous.map((item) => (item.id === result.id ? result : item)))
      setSelected(null)
    } catch (error) {
      setError(error instanceof Error ? error.message : '保存失败')
    } finally {
      setBusy(false)
    }
  }
  return (
    <details className="model-editor-hint" onToggle={(event) => setOpen(event.currentTarget.open)}>
      <summary>输出尺寸与费用核验记录</summary>
      <p>
        最近 30
        次测试。请求档位与实际像素分别记录；费用未知时留空，估算与账单录入分开，不自动改动模型价格或用户积分。
      </p>
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      {loaded && !items.length && <p>还没有核验记录。真实生图测试可能收费，确认范围后再执行。</p>}
      {items.map((item) => (
        <div key={item.id} className="admin-task-metric">
          <div>
            <strong>
              请求 {item.aspectRatio} / {item.resolution}
            </strong>
            <p>
              {item.success ? `实际 ${item.width} × ${item.height} px` : item.errorMessage} ·{' '}
              {((item.elapsedMs ?? 0) / 1000).toFixed(1)} 秒
            </p>
            <p>
              估算：{formatCostMicros(item.estimatedCostMicros, item.currency)} · 账单录入：
              {formatCostMicros(item.actualCostMicros, item.currency)}
            </p>
            <small>
              {new Date(item.createdAt).toLocaleString('zh-CN')}
              {item.costNote && ` · ${item.costNote}`}
            </small>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={busy}
            onClick={() => edit(item)}
          >
            录入费用
          </Button>
        </div>
      ))}
      {selected && (
        <FieldGroup>
          <Field>
            <FieldLabel>
              估算费用
              <Input
                aria-label="估算费用"
                inputMode="decimal"
                value={estimate}
                disabled={busy}
                onChange={(event) => setEstimate(event.target.value)}
                placeholder="未知留空"
              />
            </FieldLabel>
          </Field>
          <Field>
            <FieldLabel>
              供应商账单费用
              <Input
                aria-label="供应商账单费用"
                inputMode="decimal"
                value={actual}
                disabled={busy}
                onChange={(event) => setActual(event.target.value)}
                placeholder="未取得账单请留空"
              />
            </FieldLabel>
          </Field>
          <Field>
            <FieldLabel>
              币种
              <Input
                aria-label="币种"
                maxLength={3}
                value={currency}
                disabled={busy}
                onChange={(event) => setCurrency(event.target.value.toUpperCase())}
              />
            </FieldLabel>
          </Field>
          <Field>
            <FieldLabel>
              费用来源说明
              <Input
                aria-label="费用来源说明"
                maxLength={500}
                value={note}
                disabled={busy}
                onChange={(event) => setNote(event.target.value)}
                placeholder="账单日期或估算依据，请勿填写密钥"
              />
            </FieldLabel>
          </Field>
          <div className="flex gap-2">
            <Button type="button" disabled={busy} onClick={() => void save()}>
              {busy ? '保存中…' : '保存费用记录'}
            </Button>
            <Button type="button" variant="ghost" disabled={busy} onClick={() => setSelected(null)}>
              取消
            </Button>
          </div>
        </FieldGroup>
      )}
    </details>
  )
}
