'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import {
  Check,
  Globe,
  Images,
  LoaderCircle,
  Pencil,
  Plus,
  RotateCcw,
  Save,
  ScanText,
  Settings2,
  Trash2,
  X,
  Zap,
} from 'lucide-react'
import { PromptTemplateBrowser } from '@/components/prompt-template-browser'
import { promptGroupLabel } from '@/lib/prompt-groups'
import { SiteSettingsPanel } from '@/components/site-settings-panel'
import { PromptReverseSettingsPanel } from '@/components/prompt-reverse-settings-panel'
import { AdminStatusBadge } from '@/components/admin/status-badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/select'
import { getAdminAccessToken } from '@/lib/api'
import {
  settingsRequest,
  type AIEndpoint,
  type AIProtocol,
  type EndpointInput,
  type EndpointPurpose,
  type PromptTemplate,
  type AIConnectionTest,
} from '@/lib/ai-settings'

const protocolLabels: Record<AIProtocol, string> = {
  openai_chat: 'OpenAI Compatible',
  openai_image: 'OpenAI Image API',
  gemini_generate_content: 'Gemini generateContent',
}
const promptVariableLabels: Record<string, string> = {
  prompt: '用户输入的画面描述',
  style: '所选创作风格的指令',
  language: '本次选择的画面文字语言',
}
function newEndpoint(purpose: EndpointPurpose): EndpointInput {
  return {
    name: '',
    purpose,
    protocol: purpose === 'prompt' ? 'openai_chat' : 'openai_image',
    baseUrl: '',
    model: '',
    apiKey: '',
    timeoutSeconds: purpose === 'prompt' ? 60 : 300,
    capabilities: {},
    enabled: true,
    isDefault: false,
  }
}
function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : '请求失败，请重试'
}

export default function AISettingsPage() {
  const [view, setView] = useState<'services' | 'prompts' | 'reverse' | 'site'>('services')
  const [siteDirty, setSiteDirty] = useState(false)
  const [reverseSaving, setReverseSaving] = useState(false)
  const [endpoints, setEndpoints] = useState<AIEndpoint[]>([])
  const [templates, setTemplates] = useState<PromptTemplate[]>([])
  const [canManage, setCanManage] = useState(false)
  const [loading, setLoading] = useState(true)
  const [loggedIn, setLoggedIn] = useState(true)
  const [message, setMessage] = useState('')
  const [saved, setSaved] = useState('')
  const [busy, setBusy] = useState('')
  const [editing, setEditing] = useState<{ id?: string; input: EndpointInput } | null>(null)
  const [tests, setTests] = useState<Record<string, AIConnectionTest>>({})
  const [selectedKey, setSelectedKey] = useState('rewrite')
  const [promptDraft, setPromptDraft] = useState('')
  const [promptEnabled, setPromptEnabled] = useState(true)
  const [promptDefault, setPromptDefault] = useState('')
  const dialogRef = useRef<HTMLDialogElement>(null)
  const returnFocus = useRef<HTMLElement | null>(null)
  const keyRef = useRef<HTMLInputElement>(null)

  const load = useCallback(async () => {
    const result = await settingsRequest<{ endpoints: AIEndpoint[]; canManage: boolean }>(
      'ai-endpoints',
    )
    setEndpoints(result.endpoints)
    setCanManage(result.canManage)
    if (result.canManage) {
      const data = await settingsRequest<{ templates: PromptTemplate[] }>('prompt-templates')
      setTemplates(data.templates)
    }
  }, [])
  useEffect(() => {
    const tab = new URLSearchParams(window.location.search).get('tab')
    if (tab === 'reverse' || tab === 'site' || tab === 'prompts') setView(tab)
    if (!getAdminAccessToken()) {
      setLoggedIn(false)
      setLoading(false)
      return
    }
    load()
      .catch((error) => setMessage(errorMessage(error)))
      .finally(() => setLoading(false))
  }, [load])
  useEffect(() => {
    const template = templates.find((item) => item.key === selectedKey)
    if (template) {
      setPromptDraft(template.content)
      setPromptDefault(template.defaultContent)
      setPromptEnabled(template.enabled)
    }
  }, [templates, selectedKey])
  useEffect(() => {
    if (editing) dialogRef.current?.showModal()
    else {
      dialogRef.current?.close()
      returnFocus.current?.focus()
    }
  }, [editing])

  function edit(endpoint?: AIEndpoint, purpose: EndpointPurpose = 'prompt') {
    returnFocus.current = document.activeElement as HTMLElement
    setMessage('')
    setEditing(
      endpoint
        ? { id: endpoint.id, input: { ...endpoint, apiKey: '' } }
        : { input: newEndpoint(purpose) },
    )
  }
  async function action(id: string, run: () => Promise<unknown>) {
    setBusy(id)
    setMessage('')
    setSaved('')
    try {
      await run()
      await load()
      return true
    } catch (error) {
      setMessage(errorMessage(error))
      return false
    } finally {
      setBusy('')
    }
  }
  async function saveEndpoint(event: React.FormEvent) {
    event.preventDefault()
    if (!editing || busy) return
    setBusy('save')
    setMessage('')
    try {
      const { id, input } = editing
      await settingsRequest(`ai-endpoints${id ? `/${id}` : ''}`, id ? 'PUT' : 'POST', input)
      if (keyRef.current) keyRef.current.value = ''
      setEditing(null)
      await load()
    } catch (error) {
      setMessage(errorMessage(error))
    } finally {
      setBusy('')
    }
  }
  async function testEndpoint(endpoint: AIEndpoint) {
    setBusy(endpoint.id)
    setMessage('')
    try {
      const result = await settingsRequest<AIConnectionTest>(
        `ai-endpoints/${endpoint.id}/test`,
        'POST',
      )
      setTests((previous) => ({ ...previous, [endpoint.id]: result }))
    } catch (error) {
      setMessage(errorMessage(error))
    } finally {
      setBusy('')
    }
  }
  function field(patch: Partial<EndpointInput>) {
    setEditing((previous) =>
      previous ? { ...previous, input: { ...previous.input, ...patch } } : null,
    )
  }
  async function savePrompt(restoreDefault = false) {
    const success = await action('prompt', () =>
      settingsRequest('prompt-templates', 'PUT', {
        key: selectedKey,
        content: promptDraft,
        enabled: promptEnabled,
        restoreDefault,
      }),
    )
    if (success) setSaved(restoreDefault ? '已恢复默认提示词' : '提示词已保存')
  }
  const activeTemplate = templates.find((template) => template.key === selectedKey)
  const promptDirty =
    !!activeTemplate &&
    (promptDraft !== activeTemplate.content || promptEnabled !== activeTemplate.enabled)

  function selectTemplate(key: string) {
    if (key === selectedKey || busy) return
    if (promptDirty && !window.confirm('放弃未保存的修改？')) return
    setSelectedKey(key)
    setSaved('')
    setMessage('')
  }

  function switchView(next: typeof view) {
    if (next === view) return true
    if (busy || reverseSaving) return false
    if (
      ((view === 'prompts' && promptDirty) ||
        ((view === 'site' || view === 'reverse') && siteDirty)) &&
      !window.confirm('当前配置尚未保存，仍要切换设置分类？')
    )
      return false
    setSiteDirty(false)
    setSaved('')
    setMessage('')
    setView(next)
    return true
  }

  useEffect(() => {
    if (!promptDirty) return
    const warnOnLeave = (event: BeforeUnloadEvent) => {
      event.preventDefault()
      event.returnValue = ''
    }
    window.addEventListener('beforeunload', warnOnLeave)
    return () => window.removeEventListener('beforeunload', warnOnLeave)
  }, [promptDirty])

  return (
    <>
      <main className="ai-settings">
        <header className="admin-settings-heading">
          <h1>AI 与网站配置</h1>
          <p>统一管理平台使用的模型、系统提示词与网站品牌。</p>
        </header>
        {!loggedIn ? (
          <p>
            请先<Link href="/admin/login?next=%2Fadmin%2Fsettings">登录</Link>后管理网站与 AI 配置。
          </p>
        ) : loading ? (
          <div className="settings-loading" role="status">
            <LoaderCircle className="settings-spinner" size={20} />
            正在读取配置
          </div>
        ) : (
          <>
            <div
              className="settings-tabs"
              role="tablist"
              aria-label="设置分类"
              onKeyDown={(event) => {
                if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return
                const tabs = Array.from(
                  event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="tab"]'),
                )
                const index = tabs.indexOf(document.activeElement as HTMLButtonElement)
                const next =
                  event.key === 'Home'
                    ? 0
                    : event.key === 'End'
                      ? tabs.length - 1
                      : (index + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length
                event.preventDefault()
                tabs[next]?.focus()
              }}
            >
              <button
                id="services-tab"
                role="tab"
                disabled={reverseSaving}
                aria-selected={view === 'services'}
                aria-controls="services-panel"
                onClick={() => switchView('services')}
              >
                <Settings2 size={16} />
                <span>
                  AI 服务<small>连接模型与接口</small>
                </span>
              </button>
              {canManage && (
                <>
                  <button
                    id="prompts-tab"
                    role="tab"
                    disabled={reverseSaving}
                    aria-selected={view === 'prompts'}
                    aria-controls="prompts-panel"
                    onClick={() => switchView('prompts')}
                  >
                    <Pencil size={16} />
                    <span>
                      系统提示词<small>按用途维护创作指令</small>
                    </span>
                  </button>
                  <button
                    id="reverse-tab"
                    role="tab"
                    disabled={reverseSaving}
                    aria-selected={view === 'reverse'}
                    aria-controls="reverse-panel"
                    onClick={() => switchView('reverse')}
                  >
                    <ScanText size={16} aria-hidden="true" />
                    <span>
                      图片反推<small>选择识图服务与偏好</small>
                    </span>
                  </button>
                  <button
                    id="site-tab"
                    role="tab"
                    disabled={reverseSaving}
                    aria-selected={view === 'site'}
                    aria-controls="site-panel"
                    onClick={() => switchView('site')}
                  >
                    <Globe size={16} />
                    <span>
                      网站配置<small>名称与 Logo</small>
                    </span>
                  </button>
                </>
              )}
            </div>
            {message && !editing && (
              <p className="settings-error" role="alert">
                {message}
              </p>
            )}
            {saved && !(view === 'prompts' && promptDirty) && (
              <p className="settings-saved" role="status">
                {saved}
              </p>
            )}
            {view === 'site' ? (
              <SiteSettingsPanel onDirtyChange={setSiteDirty} />
            ) : view === 'reverse' ? (
              <PromptReverseSettingsPanel
                endpoints={endpoints}
                templates={templates}
                onDirtyChange={setSiteDirty}
                onSavingChange={setReverseSaving}
                onOpenServices={() => switchView('services')}
                onOpenTemplates={(key) => {
                  if (switchView('prompts')) selectTemplate(key)
                }}
              />
            ) : view === 'services' ? (
              <div id="services-panel" role="tabpanel" aria-labelledby="services-tab">
                {(['prompt', 'image'] as const).map((purpose) => (
                  <section className="endpoint-section" key={purpose}>
                    <div className="endpoint-section-head">
                      <div className="admin-service-heading">
                        <span className="admin-service-icon" aria-hidden="true">
                          {purpose === 'prompt' ? <ScanText size={20} /> : <Images size={20} />}
                        </span>
                        <div>
                          <h2>{purpose === 'prompt' ? '提示词与识图服务' : '图片生成服务'}</h2>
                          <p>
                            {purpose === 'prompt'
                              ? '用于提示词优化、服装分析和图片反推；反推需支持识图。'
                              : '连接生图接口，前台展示名称与积分消耗在「模型与定价」中设置。'}
                          </p>
                        </div>
                      </div>
                      {canManage && (
                        <button
                          className="settings-command admin-action"
                          data-tone="success"
                          onClick={() => edit(undefined, purpose)}
                        >
                          <Plus size={16} />
                          添加服务
                        </button>
                      )}
                    </div>
                    {!endpoints.some((endpoint) => endpoint.purpose === purpose) ? (
                      <p className="settings-empty">
                        尚未配置{purpose === 'prompt' ? '提示词' : '生图'} AI 服务
                      </p>
                    ) : (
                      <div className="endpoint-list">
                        {endpoints
                          .filter((endpoint) => endpoint.purpose === purpose)
                          .map((endpoint) => (
                            <article className="endpoint-row" key={endpoint.id}>
                              <div className="endpoint-details">
                                <div className="endpoint-name">
                                  <h3>{endpoint.name}</h3>
                                  {endpoint.isDefault && (
                                    <span className="admin-default-badge">
                                      <Check size={12} />
                                      默认
                                    </span>
                                  )}
                                  <label className="settings-switch">
                                    <input
                                      type="checkbox"
                                      checked={endpoint.enabled}
                                      disabled={!canManage || !!busy}
                                      onChange={() =>
                                        action(endpoint.id, () =>
                                          settingsRequest(`ai-endpoints/${endpoint.id}`, 'PUT', {
                                            ...endpoint,
                                            enabled: !endpoint.enabled,
                                            isDefault: false,
                                          }),
                                        )
                                      }
                                    />
                                    <span
                                      className="admin-switch-label"
                                      data-tone={endpoint.enabled ? 'success' : 'danger'}
                                    >
                                      {endpoint.enabled ? '已启用' : '已停用'}
                                    </span>
                                  </label>
                                </div>
                                <div className="endpoint-meta">
                                  <span>{protocolLabels[endpoint.protocol]}</span>
                                  <span aria-hidden="true">·</span>
                                  <span>{endpoint.model}</span>
                                  {purpose === 'prompt' && (
                                    <AdminStatusBadge
                                      tone={endpoint.capabilities.vision ? 'success' : 'neutral'}
                                    >
                                      {endpoint.capabilities.vision ? '已启用识图' : '仅文本'}
                                    </AdminStatusBadge>
                                  )}
                                  <span>{endpoint.timeoutSeconds} 秒超时</span>
                                </div>
                                {canManage && (
                                  <p className="endpoint-url">
                                    {endpoint.baseUrl}
                                    <span>{endpoint.apiKeyMasked}</span>
                                  </p>
                                )}
                                {tests[endpoint.id] && (
                                  <p
                                    className={
                                      tests[endpoint.id]?.success
                                        ? 'connection-result'
                                        : 'settings-error'
                                    }
                                    role="status"
                                  >
                                    {tests[endpoint.id]?.message} · {tests[endpoint.id]?.model} ·{' '}
                                    {tests[endpoint.id]?.responseTimeMs} ms
                                  </p>
                                )}
                              </div>
                              {canManage && (
                                <div className="endpoint-actions">
                                  {endpoint.enabled && !endpoint.isDefault && (
                                    <button
                                      className="endpoint-default-action"
                                      disabled={!!busy}
                                      onClick={() =>
                                        action(endpoint.id, () =>
                                          settingsRequest(
                                            `ai-endpoints/${endpoint.id}/default`,
                                            'POST',
                                          ),
                                        )
                                      }
                                    >
                                      设为默认
                                    </button>
                                  )}
                                  <button
                                    className="endpoint-edit-action"
                                    title="编辑"
                                    aria-label={`编辑 ${endpoint.name}`}
                                    disabled={!!busy}
                                    onClick={() => edit(endpoint)}
                                  >
                                    <Pencil size={17} />
                                    编辑
                                  </button>
                                  <button
                                    className="endpoint-test-action"
                                    title={
                                      purpose === 'image'
                                        ? '会实际生成一张测试图，可能产生 API 费用'
                                        : '发送一次文本请求以验证服务配置'
                                    }
                                    aria-label={`测试 ${endpoint.name} 连接`}
                                    disabled={!!busy}
                                    onClick={() => testEndpoint(endpoint)}
                                  >
                                    {busy === endpoint.id ? (
                                      <LoaderCircle className="settings-spinner" size={15} />
                                    ) : (
                                      <Zap size={15} />
                                    )}
                                    测试连接
                                  </button>
                                  <button
                                    className="settings-icon endpoint-delete-action admin-action"
                                    data-tone="danger"
                                    title="删除"
                                    aria-label={`删除 ${endpoint.name}`}
                                    disabled={!!busy}
                                    onClick={() => {
                                      if (window.confirm(`删除“${endpoint.name}”？`))
                                        action(endpoint.id, () =>
                                          settingsRequest(`ai-endpoints/${endpoint.id}`, 'DELETE'),
                                        )
                                    }}
                                  >
                                    <Trash2 size={17} />
                                  </button>
                                </div>
                              )}
                            </article>
                          ))}
                      </div>
                    )}
                  </section>
                ))}
              </div>
            ) : (
              <section
                id="prompts-panel"
                role="tabpanel"
                aria-labelledby="prompts-tab"
                className="prompt-settings"
              >
                <div className="prompt-settings-intro">
                  <h2>内置提示词</h2>
                  <p>
                    按用途分组管理，所有账号共享此配置。停用一般模板后不再附加指令；停用反推模板后，对应分析模式不可用。
                  </p>
                </div>
                <PromptTemplateBrowser
                  templates={templates}
                  selectedKey={selectedKey}
                  busy={!!busy}
                  onSelect={selectTemplate}
                />
                <div className="prompt-settings-editor">
                  {activeTemplate && (
                    <p className="prompt-editor-breadcrumb">{promptGroupLabel(activeTemplate)}</p>
                  )}
                  <div className="prompt-editor-heading">
                    <div className="prompt-editor-title">
                      <h2>{activeTemplate?.name}</h2>
                      {promptDirty && <span className="prompt-dirty-status">未保存更改</span>}
                    </div>
                    <label className="settings-switch">
                      <input
                        type="checkbox"
                        checked={promptEnabled}
                        disabled={!!busy}
                        onChange={(event) => setPromptEnabled(event.target.checked)}
                      />
                      <span
                        className="admin-switch-label"
                        data-tone={promptEnabled ? 'success' : 'danger'}
                      >
                        {promptEnabled ? '已启用' : '已停用'}
                      </span>
                    </label>
                  </div>
                  {activeTemplate?.description && (
                    <p className="prompt-template-purpose">{activeTemplate.description}</p>
                  )}
                  {!!activeTemplate?.variables?.length && (
                    <p className="prompt-template-variables">
                      可用变量：
                      {activeTemplate.variables.map((variable) => (
                        <span key={variable}>
                          <code>{`{{${variable}}}`}</code>{' '}
                          {promptVariableLabels[variable] ?? variable}
                        </span>
                      ))}
                    </p>
                  )}
                  <textarea
                    className="prompt-content-editor"
                    aria-label="提示词模板内容"
                    value={promptDraft}
                    disabled={!!busy}
                    maxLength={20000}
                    rows={18}
                    onChange={(event) => setPromptDraft(event.target.value)}
                  />
                  <details className="prompt-default">
                    <summary>查看默认 Prompt</summary>
                    <pre>{promptDefault}</pre>
                  </details>
                  <div className="settings-form-actions">
                    <button
                      className="settings-command"
                      disabled={!!busy}
                      onClick={() => {
                        if (window.confirm('恢复默认提示词？当前修改将被替换。')) savePrompt(true)
                      }}
                    >
                      <RotateCcw size={16} />
                      恢复默认
                    </button>
                    <button
                      className="settings-primary"
                      disabled={!!busy || !promptDraft.trim()}
                      onClick={() => savePrompt()}
                    >
                      <Save size={16} />
                      {busy === 'prompt' ? '保存中' : '保存'}
                    </button>
                  </div>
                </div>
              </section>
            )}
          </>
        )}
      </main>
      <dialog
        ref={dialogRef}
        className="endpoint-dialog"
        onCancel={(event) => {
          if (busy) event.preventDefault()
          else setEditing(null)
        }}
        onClose={() => {
          if (!busy) setEditing(null)
        }}
      >
        {editing && (
          <form onSubmit={saveEndpoint}>
            <div className="endpoint-section-head">
              <h2>{editing.id ? '编辑服务' : '添加服务'}</h2>
              <button
                type="button"
                className="settings-icon"
                title="关闭"
                aria-label="关闭编辑"
                disabled={!!busy}
                onClick={() => setEditing(null)}
              >
                <X size={20} />
              </button>
            </div>
            {message && (
              <p className="settings-error" role="alert">
                {message}
              </p>
            )}
            <fieldset className="endpoint-form-group" disabled={!!busy}>
              <legend>服务连接</legend>
              <label className="settings-field">
                <span>名称</span>
                <input
                  autoFocus
                  required
                  maxLength={120}
                  value={editing.input.name}
                  onChange={(e) => field({ name: e.target.value })}
                />
              </label>
              <label className="settings-field">
                <span>协议</span>
                <Select
                  value={editing.input.protocol}
                  disabled={!!busy}
                  onValueChange={(value) => field({ protocol: value as AIProtocol })}
                >
                  <SelectTrigger size="lg" className="settings-select" aria-label="协议">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent
                    portalContainer={dialogRef.current}
                    className="endpoint-dialog-select-content"
                  >
                    {(editing.input.purpose === 'prompt'
                      ? ['openai_chat']
                      : ['openai_image', 'gemini_generate_content']
                    ).map((protocol) => (
                      <SelectItem value={protocol} key={protocol}>
                        {protocolLabels[protocol as AIProtocol]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </label>
              <label className="settings-field">
                <span>Base URL</span>
                <input
                  type="url"
                  required
                  value={editing.input.baseUrl}
                  placeholder="https://api.example.com/v1"
                  onChange={(e) => field({ baseUrl: e.target.value })}
                />
              </label>
              <label className="settings-field">
                <span>API Key</span>
                <input
                  ref={keyRef}
                  type="password"
                  autoComplete="new-password"
                  required={!editing.id}
                  value={editing.input.apiKey ?? ''}
                  placeholder={editing.id ? '留空保留现有密钥' : ''}
                  onChange={(e) => field({ apiKey: e.target.value })}
                />
              </label>
            </fieldset>
            <fieldset className="endpoint-form-group" disabled={!!busy}>
              <legend>模型参数</legend>
              <div className="endpoint-form-grid">
                <label className="settings-field">
                  <span>Model</span>
                  <input
                    required
                    maxLength={200}
                    value={editing.input.model}
                    onChange={(e) => field({ model: e.target.value })}
                  />
                </label>
                <label className="settings-field">
                  <span>Timeout / 秒</span>
                  <input
                    type="number"
                    min={1}
                    max={600}
                    required
                    value={editing.input.timeoutSeconds}
                    onChange={(e) => field({ timeoutSeconds: Number(e.target.value) })}
                  />
                </label>
              </div>
            </fieldset>
            <div className="settings-checks">
              {editing.input.purpose === 'prompt' && (
                <label>
                  <input
                    type="checkbox"
                    checked={!!editing.input.capabilities.vision}
                    disabled={!!busy}
                    onChange={(e) =>
                      field({
                        capabilities: { ...editing.input.capabilities, vision: e.target.checked },
                      })
                    }
                  />
                  支持图片识别
                </label>
              )}
              <label>
                <input
                  type="checkbox"
                  checked={editing.input.enabled}
                  disabled={!!busy}
                  onChange={(e) =>
                    field({
                      enabled: e.target.checked,
                      isDefault: e.target.checked && editing.input.isDefault,
                    })
                  }
                />
                启用
              </label>
              <label>
                <input
                  type="checkbox"
                  disabled={!!busy || !editing.input.enabled}
                  checked={editing.input.isDefault}
                  onChange={(e) => field({ isDefault: e.target.checked })}
                />
                默认服务
              </label>
            </div>
            {editing.input.purpose === 'prompt' && (
              <p className="admin-field-hint">
                请先确认模型支持图片输入，再勾选「支持图片识别」。图片反推可单独指定此服务，无需设为默认。
              </p>
            )}
            <div className="settings-form-actions">
              <button
                type="button"
                className="settings-command"
                disabled={!!busy}
                onClick={() => setEditing(null)}
              >
                取消
              </button>
              <button type="submit" className="settings-primary" disabled={!!busy}>
                <Save size={16} />
                {busy === 'save' ? '保存中' : '保存'}
              </button>
            </div>
          </form>
        )}
      </dialog>
    </>
  )
}
