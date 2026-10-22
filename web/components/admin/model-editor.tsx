'use client'
import { Field, FieldGroup, FieldLabel, FieldLegend, FieldSet } from '@/components/admin/ui/field'
import { Input } from '@/components/admin/ui/input'
import { Button } from '@/components/admin/ui/button'

import Link from 'next/link'
import { useId, useRef, useState, type FormEvent } from 'react'
import { Check, LoaderCircle, Save, Trash2, Zap } from 'lucide-react'
import {
  adminRequest,
  defaultModelCapabilities,
  type AdminModel as Model,
  type ModelChannel,
} from '@/lib/admin'
import { ChannelMeasurements } from './channel-measurements'
import type { ImageMeasurement } from '@/lib/admin'
import { imageProtocolLabels, type AIEndpoint } from '@/lib/ai-settings'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/select'

type ChannelTest = {
  model: string
  success: boolean
  message: string
  measurement?: ImageMeasurement
}

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
  const errorRef = useRef<HTMLDivElement>(null)
  const formId = useId()
  const [submitted, setSubmitted] = useState(false)
  const [testResults, setTestResults] = useState<Record<string, ChannelTest>>({})
  const [testing, setTesting] = useState('')
  const [testRatio, setTestRatio] = useState('1:1')
  const [testResolution, setTestResolution] = useState('1K')
  const [measurementRevision, setMeasurementRevision] = useState(0)
  const channels = editing.channels ?? []
  const capabilities = editing.capabilities ?? defaultModelCapabilities
  const originalPrimary = useRef(channels.find((channel) => channel.isActive)?.endpointId)
  const primary = channels.find((channel) => channel.isActive)
  const primaryEndpoint = endpoints.find((endpoint) => endpoint.id === primary?.endpointId)
  const primaryChanged = primary?.endpointId !== originalPrimary.current
  const availableEndpoints = endpoints.filter(
    (endpoint) => !channels.some((channel) => channel.endpointId === endpoint.id),
  )
  const locked = busy || !!testing
  const errors: string[] = []
  if (!editing.name.trim()) errors.push('填写前台显示名称。')
  if (channels.some((channel) => !channel.upstreamModelId.trim()))
    errors.push('为每个绑定填写真实的上游模型 ID。')
  if (editing.enabled && (!primary || !primary.enabled || !primaryEndpoint?.enabled))
    errors.push('上架前请选择已启用的主渠道；也可以先取消上架，保存为草稿。')
  if (!capabilities.aspectRatios.length || !capabilities.resolutions.length)
    errors.push('至少保留一个画面比例和一个分辨率。')

  function changeChannel(index: number, patch: Partial<ModelChannel>) {
    onChange({
      ...editing,
      channels: channels.map((channel, i) => (i === index ? { ...channel, ...patch } : channel)),
    })
  }
  function submit(event: FormEvent) {
    if (locked) {
      event.preventDefault()
      return
    }
    if (errors.length) {
      event.preventDefault()
      setSubmitted(true)
      requestAnimationFrame(() => errorRef.current?.focus())
      return
    }
    onSubmit(event)
  }
  async function testChannel(channel: ModelChannel) {
    if (
      locked ||
      !window.confirm(
        `真实生图测试可能产生上游 API 费用。确认以 ${testRatio} / ${testResolution} 生成一张测试图？`,
      )
    )
      return
    const model = channel.upstreamModelId.trim()
    setTesting(channel.endpointId)
    try {
      const result = await adminRequest<{
        success: boolean
        message: string
        measurement?: ImageMeasurement
      }>(`ai-endpoints/${channel.endpointId}/test`, 'POST', {
        mode: 'generate',
        confirmCost: true,
        upstreamModelId: model,
        aspectRatio: testRatio,
        resolution: testResolution,
      })
      setTestResults((previous) => ({ ...previous, [channel.endpointId]: { ...result, model } }))
      setMeasurementRevision((previous) => previous + 1)
    } catch (error) {
      setTestResults((previous) => ({
        ...previous,
        [channel.endpointId]: {
          model,
          success: false,
          message: error instanceof Error ? error.message : '测试失败，请检查渠道配置后重试。',
        },
      }))
    } finally {
      setTesting('')
    }
  }

  return (
    <section
      ref={editorRef}
      className="ops-card ops-editor model-channel-editor"
      aria-label="编辑前台模型"
    >
      <form onSubmit={submit}>
        {submitted && errors.length > 0 && (
          <div ref={errorRef} tabIndex={-1} role="alert" className="model-validation">
            <strong>保存前还需要完成</strong>
            <ul>
              {errors.map((error) => (
                <li key={error}>{error}</li>
              ))}
            </ul>
          </div>
        )}
        <div className="model-editor-section-title">
          <h3>模型信息</h3>
          <p>用户看到的名称与每张价格，独立于渠道设置。</p>
        </div>
        <FieldGroup className="ops-form-grid">
          <Field>
            <FieldLabel className="settings-field">
              <span>前台显示名称</span>
              <Input
                autoFocus
                required
                maxLength={80}
                value={editing.name}
                disabled={locked}
                onChange={(event) => onChange({ ...editing, name: event.target.value })}
                placeholder="例如：GPT Image / Nano Banana"
              />
            </FieldLabel>
          </Field>
          <Field>
            <FieldLabel className="settings-field">
              <span>每张消耗{unit}</span>
              <Input
                required
                inputMode="decimal"
                disabled={locked}
                value={price}
                onChange={(event) => onPriceChange(event.target.value)}
              />
              <small>支持两位小数；0 表示免费模型</small>
            </FieldLabel>
          </Field>
        </FieldGroup>
        <div className="settings-checks">
          <label>
            <input
              type="checkbox"
              disabled={locked}
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
              disabled={locked || !editing.enabled}
              checked={editing.isDefault}
              onChange={(event) => onChange({ ...editing, isDefault: event.target.checked })}
            />
            默认模型
          </label>
          {!editing.enabled && <span className="model-draft-note">保存为草稿，前台暂不可见</span>}
        </div>

        <FieldSet disabled={locked} className="model-editor-section">
          <FieldLegend>渠道与主渠道</FieldLegend>
          <FieldGroup className="ops-form-grid">
            <Field>
              <FieldLabel>
                测试画面比例
                <Select value={testRatio} onValueChange={setTestRatio} disabled={locked}>
                  <SelectTrigger aria-label="测试画面比例">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent portalContainer={editorRef.current}>
                    <SelectGroup>
                      {['1:1', '3:4', '4:3', '9:16', '16:9'].map((value) => (
                        <SelectItem key={value} value={value}>
                          {value}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </FieldLabel>
            </Field>
            <Field>
              <FieldLabel>
                测试请求档位
                <Select value={testResolution} onValueChange={setTestResolution} disabled={locked}>
                  <SelectTrigger aria-label="测试请求档位">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent portalContainer={editorRef.current}>
                    <SelectGroup>
                      {['1K', '2K', '4K'].map((value) => (
                        <SelectItem key={value} value={value}>
                          {value}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </FieldLabel>
            </Field>
          </FieldGroup>
          <p className="model-editor-hint">
            每次测试只请求一张。高档位可能增加供应商费用；实际输出像素会独立记录，不进行本地放大。
          </p>
          <div
            className="model-primary-summary"
            data-ready={!!primary?.enabled && !!primaryEndpoint?.enabled}
          >
            <div>
              <span>{primaryChanged && primary ? '保存后使用' : '当前主渠道'}</span>
              <strong>{primaryEndpoint?.name ?? '尚未选择'}</strong>
            </div>
            <p>
              {primary
                ? '切换保存后仅影响新任务，已创建任务继续使用原渠道。'
                : '添加渠道、填写上游模型 ID，再选择一个主渠道。备用渠道只供手动切换。'}
            </p>
          </div>
          <div className="model-channel-list">
            {!channels.length && (
              <div className="model-channels-empty">
                <strong>还没有绑定渠道</strong>
                <p>从下方选择已配置的生图渠道，同一模型可绑定多个渠道。</p>
              </div>
            )}
            {channels.map((channel, index) => {
              const endpoint = endpoints.find((item) => item.id === channel.endpointId)
              const result = testResults[channel.endpointId]
              const showResult = result?.model === channel.upstreamModelId.trim()
              const stateLabel = channel.isActive
                ? primaryChanged
                  ? '保存后使用'
                  : '当前使用'
                : !channel.enabled
                  ? '绑定已停用'
                  : '备用渠道'
              return (
                <div
                  key={channel.endpointId}
                  className="model-channel-card"
                  data-active={channel.isActive}
                >
                  <div className="model-channel-card-heading">
                    <div>
                      <strong>{endpoint?.name ?? '渠道已删除'}</strong>
                      <span>
                        {endpoint ? imageProtocolLabels[endpoint.protocol] : '请移除此绑定'}
                        {endpoint && !endpoint.enabled && ' · 渠道已停用'}
                      </span>
                    </div>
                    <span className="model-channel-state">
                      {channel.isActive && <Check size={13} aria-hidden="true" />}
                      {stateLabel}
                    </span>
                  </div>
                  <Field>
                    <FieldLabel className="settings-field" htmlFor={`${formId}-upstream-${index}`}>
                      <span>上游模型 ID</span>
                      <Input
                        id={`${formId}-upstream-${index}`}
                        required
                        maxLength={200}
                        value={channel.upstreamModelId}
                        placeholder="填写此渠道实际支持的模型 ID"
                        aria-invalid={submitted && !channel.upstreamModelId.trim()}
                        onChange={(event) =>
                          changeChannel(index, { upstreamModelId: event.target.value })
                        }
                      />
                    </FieldLabel>
                  </Field>
                  <div className="model-channel-card-controls">
                    <div className="settings-checks">
                      <label>
                        <input
                          type="radio"
                          name={`${formId}-activeChannel`}
                          checked={channel.isActive}
                          disabled={!channel.enabled || !endpoint?.enabled}
                          onChange={() =>
                            onChange({
                              ...editing,
                              channels: channels.map((item, i) => ({
                                ...item,
                                isActive: i === index,
                              })),
                            })
                          }
                        />
                        {channel.isActive ? '已选为主渠道' : '设为主渠道'}
                      </label>
                      <label>
                        <input
                          type="checkbox"
                          checked={channel.enabled}
                          onChange={(event) =>
                            changeChannel(index, {
                              enabled: event.target.checked,
                              isActive: event.target.checked && channel.isActive,
                            })
                          }
                        />
                        启用绑定
                      </label>
                    </div>
                    <div className="model-channel-card-actions">
                      <Button
                        variant="outline"
                        type="button"
                        disabled={!endpoint?.enabled || !channel.upstreamModelId.trim()}
                        onClick={() => void testChannel(channel)}
                      >
                        {testing === channel.endpointId ? (
                          <LoaderCircle
                            data-icon="inline-start"
                            className="settings-spinner"
                            aria-hidden="true"
                          />
                        ) : (
                          <Zap data-icon="inline-start" aria-hidden="true" />
                        )}
                        {testing === channel.endpointId
                          ? '正在生成测试图…'
                          : '真实生图测试（可能收费）'}
                      </Button>
                      <Button
                        variant="outline"
                        type="button"
                        className="settings-command model-channel-remove"
                        aria-label={`删除绑定 ${endpoint?.name ?? ''}`}
                        onClick={() =>
                          onChange({ ...editing, channels: channels.filter((_, i) => i !== index) })
                        }
                      >
                        <Trash2 data-icon="inline-start" aria-hidden="true" />
                        删除绑定
                      </Button>
                    </div>
                  </div>
                  {showResult && (
                    <p
                      className="model-channel-test"
                      data-success={result.success}
                      role={result.success ? 'status' : 'alert'}
                    >
                      <strong>{result.success ? '测试通过' : '测试失败'}</strong>
                      <span>{result.message}</span>
                      {result.measurement && (
                        <span>
                          请求 {result.measurement.aspectRatio} / {result.measurement.resolution}
                          ；实际 {result.measurement.width} × {result.measurement.height} px ·{' '}
                          {(result.measurement.elapsedMs ?? 0) / 1000} 秒。供应商费用待账单核对。
                        </span>
                      )}
                    </p>
                  )}
                  <ChannelMeasurements
                    key={`${channel.endpointId}:${channel.upstreamModelId}`}
                    endpointId={channel.endpointId}
                    model={channel.upstreamModelId.trim()}
                    revision={measurementRevision}
                  />
                </div>
              )
            })}
          </div>
          <Field>
            <FieldLabel className="settings-field model-channel-add">
              <span>添加渠道</span>
              <Select
                value=""
                disabled={locked || !availableEndpoints.length}
                onValueChange={(endpointId) =>
                  onChange({
                    ...editing,
                    channels: [
                      ...channels,
                      { endpointId, upstreamModelId: '', enabled: true, isActive: false },
                    ],
                  })
                }
              >
                <SelectTrigger aria-label="添加渠道">
                  <SelectValue
                    placeholder={
                      availableEndpoints.length
                        ? '选择尚未绑定的渠道'
                        : endpoints.length
                          ? '全部渠道已绑定'
                          : '请先配置生图渠道'
                    }
                  />
                </SelectTrigger>
                <SelectContent portalContainer={editorRef.current}>
                  <SelectGroup>
                    {availableEndpoints.map((endpoint) => (
                      <SelectItem key={endpoint.id} value={endpoint.id}>
                        {endpoint.name}
                        {!endpoint.enabled && '（已停用）'}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </FieldLabel>
          </Field>
          <p className="model-editor-hint">
            需要新渠道？
            <Link href="/admin/settings" target="_blank" rel="noopener noreferrer">
              打开渠道配置（新标签页）
            </Link>
            ，保存后关闭编辑器，刷新模型列表再继续。
          </p>
          {editing.enabled && (!primary || !primary.enabled || !primaryEndpoint?.enabled) && (
            <p className="model-channel-warning" role="status">
              上架前请选择已启用的主渠道。移除主绑定时，也可以先取消上架。
            </p>
          )}
        </FieldSet>

        <FieldSet disabled={locked} className="model-editor-section model-capabilities">
          <FieldLegend>生成能力</FieldLegend>
          <p className="model-editor-hint">
            按实际模型支持范围配置；切换渠道后，也请确认这些参数仍可用。
          </p>
          <label className="model-reference-toggle">
            <input
              type="checkbox"
              checked={capabilities.referenceImages}
              onChange={(event) =>
                onChange({
                  ...editing,
                  capabilities: { ...capabilities, referenceImages: event.target.checked },
                })
              }
            />
            支持参考图
          </label>
          {(['aspectRatios', 'resolutions'] as const).map((field) => (
            <div key={field} className="model-capability-row">
              <span>{field === 'aspectRatios' ? '画面比例' : '分辨率'}</span>
              <div className="model-capability-options">
                {defaultModelCapabilities[field].map((value) => (
                  <label key={value} data-checked={capabilities[field].includes(value)}>
                    <input
                      type="checkbox"
                      checked={capabilities[field].includes(value)}
                      onChange={(event) =>
                        onChange({
                          ...editing,
                          capabilities: {
                            ...capabilities,
                            [field]: event.target.checked
                              ? [...capabilities[field], value]
                              : capabilities[field].filter((item) => item !== value),
                          },
                        })
                      }
                    />
                    {value}
                  </label>
                ))}
              </div>
            </div>
          ))}
        </FieldSet>
        <div className="settings-form-actions model-editor-footer">
          <span>{testing ? '生图测试进行中，请等待测试完成' : '保存后生效'}</span>
          <Button variant="outline" type="button" disabled={locked} onClick={onClose}>
            取消
          </Button>
          <Button disabled={locked}>
            {busy ? (
              <LoaderCircle
                data-icon="inline-start"
                className="settings-spinner"
                aria-hidden="true"
              />
            ) : (
              <Save data-icon="inline-start" aria-hidden="true" />
            )}
            {busy ? '保存中…' : '保存模型'}
          </Button>
        </div>
      </form>
    </section>
  )
}
