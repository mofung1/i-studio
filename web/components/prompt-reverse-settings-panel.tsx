'use client'

import { DialogActions } from '@/components/dialog-actions'
import { useEffect, useState } from 'react'
import {
  ArrowUpRight,
  Check,
  CircleAlert,
  LoaderCircle,
  RotateCcw,
  Save,
  ScanText,
} from 'lucide-react'
import type { ReverseConfiguration, ReverseSettings } from '@/lib/prompt-reverse'
import { adminRequest } from '@/lib/admin'
import { type AIEndpoint, type PromptTemplate } from '@/lib/ai-settings'
import { AdminStatusBadge } from './admin/status-badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './select'

type SettingsDraft = Omit<ReverseSettings, 'timeoutSeconds' | 'retentionHours'> & {
  timeoutSeconds: string
  retentionHours: string
}
const recommendedSettings: ReverseSettings = {
  endpointId: '',
  imageDetail: 'auto',
  timeoutSeconds: 120,
  retentionHours: 24,
}
const detailOptions: {
  value: ReverseSettings['imageDetail']
  title: string
  description: string
}[] = [
  { value: 'auto', title: '自动', description: '日常参考图' },
  { value: 'high', title: '精细', description: '文字与纹理' },
  { value: 'low', title: '快速', description: '整体构图' },
]
const toDraft = (settings: ReverseSettings): SettingsDraft => ({
  ...settings,
  timeoutSeconds: String(settings.timeoutSeconds),
  retentionHours: String(settings.retentionHours),
})

export function PromptReverseSettingsPanel({
  endpoints,
  templates,
  onDirtyChange,
  onSavingChange,
  onOpenServices,
  onOpenTemplates,
}: {
  endpoints: AIEndpoint[]
  templates: PromptTemplate[]
  onDirtyChange: (dirty: boolean) => void
  onSavingChange: (saving: boolean) => void
  onOpenServices: () => void
  onOpenTemplates: (key: string) => void
}) {
  const [draft, setDraft] = useState<SettingsDraft | null>(null)
  const [original, setOriginal] = useState<SettingsDraft | null>(null)
  const [configuration, setConfiguration] = useState<ReverseConfiguration | null>(null)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [saving, setSaving] = useState(false)
  const [loadAttempt, setLoadAttempt] = useState(0)
  const choices = endpoints.filter(
    (item) => item.purpose === 'prompt' && item.enabled && item.capabilities.vision,
  )
  const dirty = draft !== null && JSON.stringify(draft) !== JSON.stringify(original)
  const selectedService = draft?.endpointId
    ? endpoints.find((item) => item.id === draft.endpointId && item.purpose === 'prompt')
    : endpoints.find((item) => item.purpose === 'prompt' && item.isDefault && item.enabled)
  const serviceReady = !!selectedService?.enabled && !!selectedService.capabilities.vision
  const configurationReason =
    configuration &&
    !configuration.available &&
    draft?.endpointId === configuration.settings.endpointId
      ? configuration.reason
      : ''
  const unavailableReason =
    configurationReason ||
    (selectedService && !selectedService.enabled
      ? '所选服务已停用，请选择其他识图服务。'
      : selectedService && !selectedService.capabilities.vision
        ? '此服务尚未开启图片识别，可在 AI 服务中配置。'
        : '还没有可用的识图服务，请先添加支持图片识别的 Prompt 服务。')

  useEffect(() => {
    onDirtyChange(dirty)
    return () => onDirtyChange(false)
  }, [dirty, onDirtyChange])
  useEffect(() => {
    onSavingChange(saving)
    return () => onSavingChange(false)
  }, [saving, onSavingChange])
  useEffect(() => {
    const controller = new AbortController()
    setError('')
    adminRequest<ReverseConfiguration>(
      'prompt-reverse-settings',
      'GET',
      undefined,
      controller.signal,
    )
      .then((data) => {
        if (controller.signal.aborted) return
        setConfiguration(data)
        setDraft(toDraft(data.settings))
        setOriginal(toDraft(data.settings))
      })
      .catch((reason) => {
        if (!controller.signal.aborted)
          setError(
            reason instanceof TypeError
              ? '无法连接配置服务，请检查网络后重新读取'
              : reason instanceof Error
                ? reason.message
                : '配置读取失败',
          )
      })
    return () => controller.abort()
  }, [loadAttempt])
  useEffect(() => {
    if (!dirty) return
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault()
      event.returnValue = ''
    }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [dirty])

  function update(patch: Partial<SettingsDraft>) {
    setDraft((previous) => (previous ? { ...previous, ...patch } : previous))
    setNotice('')
    setError('')
  }
  async function save() {
    if (!draft || saving || !dirty) return
    const settings: ReverseSettings = {
      ...draft,
      timeoutSeconds: Number(draft.timeoutSeconds),
      retentionHours: Number(draft.retentionHours),
    }
    if (
      !Number.isInteger(settings.timeoutSeconds) ||
      settings.timeoutSeconds < 15 ||
      settings.timeoutSeconds > 600 ||
      !Number.isInteger(settings.retentionHours) ||
      settings.retentionHours < 1 ||
      settings.retentionHours > 168
    ) {
      setError('分析超时需为 15–600 秒，保留时间需为 1–168 小时。')
      return
    }
    setSaving(true)
    setError('')
    setNotice('')
    try {
      const data = await adminRequest<ReverseConfiguration>(
        'prompt-reverse-settings',
        'PUT',
        settings,
      )
      setConfiguration(data)
      setDraft(toDraft(data.settings))
      setOriginal(toDraft(data.settings))
      setNotice('图片反推配置已保存')
    } catch (reason) {
      setError(
        reason instanceof TypeError
          ? '无法连接配置服务，当前修改已保留，请检查网络后重试'
          : reason instanceof Error
            ? reason.message
            : '配置保存失败',
      )
    } finally {
      setSaving(false)
    }
  }

  return (
    <section
      id="reverse-panel"
      role="tabpanel"
      aria-labelledby="reverse-tab"
      className="reverse-settings"
    >
      <header className="reverse-settings-heading">
        <div>
          <h2>图片反推</h2>
          <p>从参考图提取双语提示词，识图接口与密钥在 AI 服务中统一管理。</p>
        </div>
        {draft && (
          <AdminStatusBadge
            tone={
              serviceReady && !configurationReason && draft.endpointId === original?.endpointId
                ? 'success'
                : 'warning'
            }
          >
            {serviceReady && !configurationReason
              ? draft.endpointId !== original?.endpointId
                ? '服务待保存'
                : '服务已配置'
              : '服务待配置'}
          </AdminStatusBadge>
        )}
      </header>
      {!draft ? (
        <div className="reverse-settings-load" aria-live="polite">
          {error ? (
            <>
              <CircleAlert size={22} aria-hidden="true" />
              <strong>暂时无法读取配置</strong>
              <p className="settings-error" role="alert">
                {error}
              </p>
              <button
                type="button"
                className="settings-command"
                onClick={() => setLoadAttempt((value) => value + 1)}
              >
                重新读取
              </button>
            </>
          ) : (
            <>
              <LoaderCircle className="settings-spinner" size={22} aria-hidden="true" />
              <span role="status">正在读取反推配置…</span>
            </>
          )}
        </div>
      ) : (
        <form
          className="reverse-config-form"
          aria-busy={saving}
          onSubmit={(event) => {
            event.preventDefault()
            void save()
          }}
        >
          <section className="reverse-config-section" aria-labelledby="reverse-service-title">
            <div className="reverse-config-label">
              <h3 id="reverse-service-title">识图服务</h3>
              <p>选择实际支持图片输入的多模态模型，与生图服务分别配置。</p>
            </div>
            <div className="reverse-config-controls">
              <Select
                value={draft.endpointId || 'default'}
                onValueChange={(value) => update({ endpointId: value === 'default' ? '' : value })}
                disabled={saving}
              >
                <SelectTrigger
                  size="lg"
                  aria-label="图片反推识图服务"
                  aria-describedby="reverse-service-help"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="default">跟随默认 Prompt 服务</SelectItem>
                  {choices.map((item) => (
                    <SelectItem key={item.id} value={item.id}>
                      {item.name} · {item.model}
                    </SelectItem>
                  ))}
                  {draft.endpointId && !choices.some((item) => item.id === draft.endpointId) && (
                    <SelectItem value={draft.endpointId} disabled>
                      所选服务已不可用
                    </SelectItem>
                  )}
                </SelectContent>
              </Select>
              {serviceReady && !configurationReason ? (
                <div className="reverse-service-summary">
                  <span className="reverse-service-mark">
                    <ScanText size={20} aria-hidden="true" />
                  </span>
                  <div>
                    <span>
                      {draft.endpointId !== original?.endpointId ? '保存后使用' : '当前使用'}{' '}
                      <strong>{selectedService!.name}</strong>
                    </span>
                    <p>{selectedService!.model}</p>
                  </div>
                  <span className="reverse-service-capability">
                    <Check size={13} aria-hidden="true" />
                    支持识图
                  </span>
                </div>
              ) : (
                <div className="reverse-service-unavailable" role="status">
                  <CircleAlert size={18} aria-hidden="true" />
                  <p>{unavailableReason}</p>
                </div>
              )}
              <div className="reverse-service-help" id="reverse-service-help">
                <span>
                  {draft.endpointId
                    ? '固定使用所选服务，不受默认 Prompt 服务切换影响。'
                    : '默认 Prompt 服务也必须支持识图；更换默认服务后这里会同步跟随。'}
                  列表仅显示已启用并勾选「支持图片识别」的服务。
                </span>
                <button
                  type="button"
                  className="reverse-settings-link"
                  disabled={saving}
                  onClick={onOpenServices}
                >
                  管理 AI 服务
                  <ArrowUpRight size={14} aria-hidden="true" />
                </button>
              </div>
              <p className="reverse-config-help">
                勾选识图能力不会改变模型本身的能力，请确认供应商支持图片输入。配置状态不代表实际接口连通性。
              </p>
            </div>
          </section>

          <section className="reverse-config-section" aria-labelledby="reverse-analysis-title">
            <div className="reverse-config-label">
              <h3 id="reverse-analysis-title">分析偏好</h3>
              <p>根据图片内容选择细节。每次分析同时返回中文与英文。</p>
            </div>
            <div className="reverse-config-controls">
              <div className="reverse-analysis-fields">
                <div>
                  <fieldset
                    className="reverse-detail-options"
                    disabled={saving}
                    aria-describedby="reverse-detail-help"
                  >
                    <legend>图片细节</legend>
                    <div>
                      {detailOptions.map((option) => (
                        <label
                          key={option.value}
                          className={`reverse-detail-option${draft.imageDetail === option.value ? ' is-selected' : ''}`}
                        >
                          <span className="reverse-detail-title">
                            <strong>{option.title}</strong>
                            <input
                              type="radio"
                              name="reverse-image-detail"
                              value={option.value}
                              checked={draft.imageDetail === option.value}
                              onChange={() => update({ imageDetail: option.value })}
                              aria-label={`${option.title}分析`}
                            />
                          </span>
                          <span className="reverse-detail-description">{option.description}</span>
                          {option.value === 'auto' && (
                            <span className="reverse-detail-recommended">推荐</span>
                          )}
                        </label>
                      ))}
                    </div>
                  </fieldset>
                  <p className="reverse-config-help" id="reverse-detail-help">
                    精细模式可能增加识图用量，实际细节表现取决于所选服务。
                  </p>
                </div>
                <div className="reverse-number-row">
                  <div>
                    <label htmlFor="reverse-timeout">分析超时</label>
                    <p id="reverse-timeout-help">15–600 秒，反推时覆盖服务通道超时，不影响生图。</p>
                  </div>
                  <div className="reverse-number-control">
                    <input
                      id="reverse-timeout"
                      type="number"
                      inputMode="numeric"
                      min={15}
                      max={600}
                      step={1}
                      required
                      aria-label="分析超时（秒）"
                      aria-describedby="reverse-timeout-help"
                      value={draft.timeoutSeconds}
                      disabled={saving}
                      onChange={(event) => update({ timeoutSeconds: event.target.value })}
                    />
                    <span aria-hidden="true">秒</span>
                  </div>
                </div>
              </div>
            </div>
          </section>

          <section className="reverse-config-section" aria-labelledby="reverse-storage-title">
            <div className="reverse-config-label">
              <h3 id="reverse-storage-title">结果保留</h3>
              <p>保留临时原图与分析记录，方便回来继续编辑。</p>
            </div>
            <div className="reverse-config-controls">
              <div className="reverse-number-row">
                <div>
                  <label htmlFor="reverse-retention">保留时长</label>
                  <p id="reverse-retention-help">可设置 1–168 小时。</p>
                </div>
                <div className="reverse-number-control">
                  <input
                    id="reverse-retention"
                    type="number"
                    inputMode="numeric"
                    min={1}
                    max={168}
                    step={1}
                    required
                    aria-label="结果保留时间（小时）"
                    aria-describedby="reverse-retention-help reverse-retention-cleanup"
                    value={draft.retentionHours}
                    disabled={saving}
                    onChange={(event) => update({ retentionHours: event.target.value })}
                  />
                  <span aria-hidden="true">小时</span>
                </div>
              </div>
              <div className="reverse-retention-presets" role="group" aria-label="常用保留时长">
                {[
                  { hours: 24, label: '24 小时' },
                  { hours: 72, label: '3 天' },
                  { hours: 168, label: '7 天' },
                ].map((item) => (
                  <button
                    key={item.hours}
                    type="button"
                    disabled={saving}
                    aria-pressed={Number(draft.retentionHours) === item.hours}
                    onClick={() => update({ retentionHours: String(item.hours) })}
                  >
                    <Check
                      size={12}
                      aria-hidden="true"
                      style={{ opacity: Number(draft.retentionHours) === item.hours ? 1 : 0 }}
                    />
                    {item.label}
                  </button>
                ))}
              </div>
              <p className="reverse-config-help" id="reverse-retention-cleanup">
                到期后清理临时图片与记录，已保存的灵感及封面会保留。
              </p>
            </div>
          </section>

          <section className="reverse-config-section" aria-labelledby="reverse-templates-title">
            <div className="reverse-config-label">
              <h3 id="reverse-templates-title">反推提示词</h3>
              <p>两种模式独立配置。模板停用后，对应模式无法发起分析。</p>
            </div>
            <div className="reverse-template-options">
              {[
                { key: 'reverse.scene', name: '还原画面', description: '主体、场景、构图与光线' },
                { key: 'reverse.style', name: '只提取风格', description: '色彩、材质与视觉表达' },
              ].map((mode) => {
                const enabled = templates.some((item) => item.key === mode.key && item.enabled)
                return (
                  <button
                    key={mode.key}
                    type="button"
                    disabled={saving}
                    onClick={() => onOpenTemplates(mode.key)}
                    aria-label={`编辑${mode.name}提示词`}
                  >
                    <strong>
                      {mode.name}
                      <ArrowUpRight size={15} aria-hidden="true" />
                    </strong>
                    <span>{mode.description}</span>
                    <AdminStatusBadge tone={enabled ? 'success' : 'danger'}>
                      {enabled ? '已启用' : '已停用'}
                    </AdminStatusBadge>
                  </button>
                )
              })}
            </div>
          </section>
          {error && (
            <p className="reverse-settings-error settings-error" role="alert">
              {error}
            </p>
          )}
          <footer className="reverse-config-footer">
            <div
              className="reverse-config-state"
              data-tone={dirty ? 'warning' : 'success'}
              role="status"
              aria-live="polite"
            >
              {notice ? (
                <>
                  <Check size={15} aria-hidden="true" />
                  <span>{notice}</span>
                </>
              ) : dirty ? (
                <>
                  <span className="reverse-unsaved-dot" aria-hidden="true" />
                  <span>有未保存的更改</span>
                </>
              ) : (
                <span>配置已同步 · 仅对新建分析生效</span>
              )}
            </div>
            <DialogActions className="reverse-config-actions">
              <button
                type="button"
                className="settings-command"
                disabled={saving}
                onClick={() => {
                  setDraft(toDraft({ ...recommendedSettings, endpointId: draft.endpointId }))
                  setNotice('')
                  setError('')
                }}
              >
                <RotateCcw size={15} aria-hidden="true" />
                恢复推荐参数
              </button>
              <button type="submit" className="settings-primary" disabled={saving || !dirty}>
                {saving ? (
                  <LoaderCircle className="settings-spinner" size={16} aria-hidden="true" />
                ) : (
                  <Save size={16} aria-hidden="true" />
                )}
                {saving ? '保存中…' : '保存配置'}
              </button>
            </DialogActions>
          </footer>
        </form>
      )}
    </section>
  )
}
