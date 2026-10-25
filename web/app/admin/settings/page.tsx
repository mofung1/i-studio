'use client'
import { DialogActions } from '@/components/dialog-actions'
import { AdminPageHeader } from '@/components/admin/page-header'
import { Alert, AlertDescription } from '@/components/admin/ui/alert'
import { Field, FieldLabel, FieldLegend, FieldSet } from '@/components/admin/ui/field'
import { Input } from '@/components/admin/ui/input'
import { Button } from '@/components/admin/ui/button'

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/admin/ui/dialog'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/admin/ui/tabs'
import {
  Check,
  Images,
  LoaderCircle,
  Pencil,
  Plus,
  Save,
  ScanText,
  Settings2,
  Trash2,
  X,
  Zap,
} from 'lucide-react'
import { PromptReverseSettingsPanel } from '@/components/prompt-reverse-settings-panel'
import { AdminStatusBadge } from '@/components/admin/status-badge'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/select'
import { useActionConfirmation } from '@/components/use-action-confirmation'
import { getAdminAccessToken } from '@/lib/api'
import { adminRequest } from '@/lib/admin'
import {
  imageProtocolLabels,
  imageProtocolHelp,
  imageEndpointPresets,
  type AIEndpoint,
  type AIProtocol,
  type EndpointInput,
  type EndpointPurpose,
  type PromptTemplate,
  type AIConnectionTest,
} from '@/lib/ai-settings'

const protocolLabels: Record<AIProtocol, string> = {
  ...imageProtocolLabels,
  openai_chat: 'OpenAI 兼容对话接口',
}
function newEndpoint(purpose: EndpointPurpose): EndpointInput {
  return {
    name: '',
    purpose,
    protocol: purpose === 'prompt' ? 'openai_chat' : 'openai_images',
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
  const router = useRouter()
  const [view, setView] = useState<'services' | 'reverse'>('services')
  const [reverseVisited, setReverseVisited] = useState(false)
  const { ask, confirmation } = useActionConfirmation(getAdminAccessToken)
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
  const [tests, setTests] = useState<
    Record<string, AIConnectionTest & { mode: 'connection' | 'generate' }>
  >({})
  const dialogRef = useRef<HTMLDivElement>(null)
  const returnFocus = useRef<HTMLElement | null>(null)
  const keyRef = useRef<HTMLInputElement>(null)

  const load = useCallback(async () => {
    const result = await adminRequest<{ endpoints: AIEndpoint[]; canManage: boolean }>(
      'ai-endpoints',
    )
    setEndpoints(result.endpoints)
    setCanManage(result.canManage)
    if (result.canManage) {
      const data = await adminRequest<{ templates: PromptTemplate[] }>('prompt-templates')
      setTemplates(data.templates)
    }
  }, [])
  useEffect(() => {
    const tab = new URLSearchParams(window.location.search).get('tab')
    if (tab === 'site' || tab === 'prompts') {
      window.location.replace(tab === 'site' ? '/admin/site' : '/admin/prompts')
      return
    }
    if (tab === 'reverse') {
      setView(tab)
      setReverseVisited(true)
    }
    if (!getAdminAccessToken()) {
      setLoggedIn(false)
      setLoading(false)
      return
    }
    load()
      .catch((error) => setMessage(errorMessage(error)))
      .finally(() => setLoading(false))
  }, [load])
  function edit(endpoint?: AIEndpoint, purpose: EndpointPurpose = 'prompt') {
    returnFocus.current = document.activeElement as HTMLElement
    setMessage('')
    setSaved('')
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
      await adminRequest(`ai-endpoints${id ? `/${id}` : ''}`, id ? 'PUT' : 'POST', input)
      if (keyRef.current) keyRef.current.value = ''
      setEditing(null)
      setTests((previous) => {
        const next = { ...previous }
        if (id) delete next[id]
        return next
      })
      await load()
      setSaved(
        input.purpose === 'image'
          ? '生图渠道已保存。请在「模型与定价」中绑定渠道并选择主渠道。'
          : '提示词服务已保存',
      )
    } catch (error) {
      setMessage(errorMessage(error))
    } finally {
      setBusy('')
    }
  }
  async function testEndpoint(
    endpoint: AIEndpoint,
    mode: 'connection' | 'generate' = 'connection',
  ) {
    if (
      mode === 'generate' &&
      !(await ask({
        title: '确认真实生图测试',
        description: `将通过「${endpoint.name}」生成 1 张测试图。`,
        detail: '这会调用真实上游接口，可能产生 API 费用。取消不会发起请求。',
        confirmLabel: '生成 1 张测试图',
        intent: 'warning',
      }))
    )
      return
    setBusy(endpoint.id)
    setMessage('')
    try {
      const result = await adminRequest<AIConnectionTest>(
        `ai-endpoints/${endpoint.id}/test`,
        'POST',
        { mode, confirmCost: mode === 'generate' },
      )
      setTests((previous) => ({ ...previous, [endpoint.id]: { ...result, mode } }))
    } catch (error) {
      setTests((previous) => ({
        ...previous,
        [endpoint.id]: {
          success: false,
          model: endpoint.model,
          responseTimeMs: 0,
          message: errorMessage(error),
          mode,
        },
      }))
    } finally {
      setBusy('')
    }
  }
  function field(patch: Partial<EndpointInput>) {
    setEditing((previous) =>
      previous ? { ...previous, input: { ...previous.input, ...patch } } : null,
    )
  }
  function switchView(next: typeof view) {
    if (next === view) return true
    if (busy || reverseSaving) return false
    if (next === 'reverse') setReverseVisited(true)
    setSaved('')
    setMessage('')
    setView(next)
    return true
  }

  return (
    <>
      <main className="ai-settings">
        <AdminPageHeader title="AI 服务" />
        {!loggedIn ? (
          <p>
            请先<Link href="/admin/login?next=%2Fadmin%2Fsettings">登录</Link>后管理 AI 服务。
          </p>
        ) : loading ? (
          <div className="settings-loading" role="status">
            <LoaderCircle className="settings-spinner" size={20} />
            正在读取配置
          </div>
        ) : (
          <>
            <Tabs value={view} onValueChange={(value) => switchView(value as typeof view)}>
              <TabsList aria-label="设置分类">
                <TabsTrigger value="services" disabled={reverseSaving}>
                  <Settings2 />
                  AI 服务
                </TabsTrigger>
                {canManage && (
                  <>
                    <TabsTrigger value="reverse" disabled={reverseSaving}>
                      <ScanText />
                      图片反推
                    </TabsTrigger>
                  </>
                )}
              </TabsList>
              {message && !editing && (
                <Alert variant="destructive" className="settings-error" role="alert">
                  <AlertDescription>{message}</AlertDescription>
                </Alert>
              )}
              {saved && (
                <Alert className="settings-saved" role="status">
                  <AlertDescription>{saved}</AlertDescription>
                </Alert>
              )}
              <TabsContent value="reverse" forceMount hidden={view !== 'reverse'}>
                {reverseVisited && (
                  <PromptReverseSettingsPanel
                    endpoints={endpoints}
                    templates={templates}
                    onSavingChange={setReverseSaving}
                    onOpenServices={() => switchView('services')}
                    onOpenTemplates={(key) => {
                      router.push(`/admin/prompts?template=${encodeURIComponent(key)}`)
                    }}
                  />
                )}
              </TabsContent>
              <TabsContent value="services">
                <div id="services-panel">
                  {(['image', 'prompt'] as const).map((purpose) => (
                    <section className="endpoint-section" key={purpose}>
                      <div className="endpoint-section-head">
                        <div className="admin-service-heading">
                          <span className="admin-service-icon" aria-hidden="true">
                            {purpose === 'prompt' ? <ScanText size={20} /> : <Images size={20} />}
                          </span>
                          <div>
                            <h2>{purpose === 'prompt' ? '提示词与识图服务' : '生图渠道'}</h2>
                            <p>
                              {purpose === 'prompt'
                                ? '用于提示词优化、服装分析和图片反推；反推需支持识图。'
                                : '连接生图接口，前台展示名称与积分消耗在「模型与定价」中设置。'}
                            </p>
                          </div>
                        </div>
                        {canManage && (
                          <Button variant="outline" onClick={() => edit(undefined, purpose)}>
                            <Plus data-icon="inline-start" />
                            {purpose === 'image' ? '添加生图渠道' : '添加提示词服务'}
                          </Button>
                        )}
                      </div>
                      {!endpoints.some((endpoint) => endpoint.purpose === purpose) ? (
                        <p className="settings-empty">
                          {purpose === 'image'
                            ? '还没有生图渠道。添加官方服务或中转站，保存后前往「模型与定价」完成绑定。'
                            : '还没有提示词服务。添加后可用于 AI 帮写和图片识别。'}
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
                                    {purpose === 'prompt' && endpoint.isDefault && (
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
                                            adminRequest(`ai-endpoints/${endpoint.id}`, 'PUT', {
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
                                    <span>
                                      {purpose === 'image'
                                        ? imageProtocolLabels[endpoint.protocol]
                                        : protocolLabels[endpoint.protocol]}
                                    </span>
                                    <span aria-hidden="true">·</span>
                                    {endpoint.model && (
                                      <span>
                                        {purpose === 'image' ? '测试模型：' : '模型：'}
                                        {endpoint.model}
                                      </span>
                                    )}
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
                                      <strong>
                                        {tests[endpoint.id]?.mode === 'generate'
                                          ? '生图测试'
                                          : '连接测试'}
                                        {tests[endpoint.id]?.success ? '通过' : '失败'}
                                      </strong>
                                      <span>
                                        {' '}
                                        · {tests[endpoint.id]?.message} ·{' '}
                                        {tests[endpoint.id]?.responseTimeMs} ms
                                      </span>
                                    </p>
                                  )}
                                </div>
                                {canManage && (
                                  <div className="endpoint-actions">
                                    {purpose === 'prompt' &&
                                      endpoint.enabled &&
                                      !endpoint.isDefault && (
                                        <Button
                                          variant="outline"
                                          className="endpoint-default-action"
                                          disabled={!!busy}
                                          onClick={() =>
                                            action(endpoint.id, () =>
                                              adminRequest(
                                                `ai-endpoints/${endpoint.id}/default`,
                                                'POST',
                                              ),
                                            )
                                          }
                                        >
                                          设为默认
                                        </Button>
                                      )}
                                    <Button
                                      variant="outline"
                                      className="endpoint-edit-action"
                                      title="编辑"
                                      aria-label={`编辑 ${endpoint.name}`}
                                      disabled={!!busy}
                                      onClick={() => edit(endpoint)}
                                    >
                                      <Pencil data-icon="inline-start" />
                                      编辑
                                    </Button>
                                    <Button
                                      variant="outline"
                                      className="endpoint-test-action"
                                      title="只查询模型列表，验证地址和密钥；不生成图片"
                                      aria-label={`测试 ${endpoint.name} 连接`}
                                      disabled={!!busy}
                                      onClick={() => testEndpoint(endpoint)}
                                    >
                                      {busy === endpoint.id ? (
                                        <LoaderCircle className="settings-spinner" size={15} />
                                      ) : (
                                        <Zap data-icon="inline-start" />
                                      )}
                                      测试连接
                                    </Button>
                                    {purpose === 'image' && (
                                      <Button
                                        variant="outline"
                                        disabled={
                                          !!busy || !endpoint.enabled || !endpoint.model.trim()
                                        }
                                        onClick={() => testEndpoint(endpoint, 'generate')}
                                      >
                                        测试生图（可能收费）
                                      </Button>
                                    )}
                                    <Button
                                      variant="outline"
                                      className="settings-icon endpoint-delete-action admin-action"
                                      data-tone="danger"
                                      title="删除"
                                      aria-label={`删除 ${endpoint.name}`}
                                      disabled={!!busy}
                                      onClick={async () => {
                                        if (
                                          await ask({
                                            title: '删除 AI 服务',
                                            description: `确定删除「${endpoint.name}」及其配置？`,
                                            detail:
                                              '删除后不可恢复。仍被模型引用的渠道需先解除绑定。',
                                            confirmLabel: '删除服务',
                                          })
                                        )
                                          action(endpoint.id, () =>
                                            adminRequest(`ai-endpoints/${endpoint.id}`, 'DELETE'),
                                          )
                                      }}
                                    >
                                      <Trash2 data-icon="inline-start" />
                                    </Button>
                                  </div>
                                )}
                              </article>
                            ))}
                        </div>
                      )}
                    </section>
                  ))}
                </div>
              </TabsContent>
            </Tabs>
          </>
        )}
      </main>
      <Dialog
        open={!!editing}
        onOpenChange={(open) => {
          if (!open && !busy) setEditing(null)
        }}
      >
        <DialogContent
          ref={dialogRef}
          className="admin-editor-dialog"
          showCloseButton={false}
          onCloseAutoFocus={(event) => {
            event.preventDefault()
            returnFocus.current?.focus()
          }}
        >
          {editing && (
            <form onSubmit={saveEndpoint}>
              <div className="endpoint-section-head">
                <DialogHeader>
                  <DialogTitle id="endpoint-editor-title">
                    {editing.input.purpose === 'image'
                      ? editing.id
                        ? '编辑生图渠道'
                        : '添加生图渠道'
                      : editing.id
                        ? '编辑提示词服务'
                        : '添加提示词服务'}
                  </DialogTitle>
                  <DialogDescription className="endpoint-editor-description">
                    {editing.input.purpose === 'image'
                      ? '连接信息仅供后台使用，保存后再到模型中绑定。'
                      : '用于提示词优化和图片识别。'}
                  </DialogDescription>
                </DialogHeader>
                <Button
                  variant="outline"
                  type="button"
                  className="settings-icon"
                  title="关闭"
                  aria-label="关闭编辑"
                  disabled={!!busy}
                  onClick={() => setEditing(null)}
                >
                  <X data-icon="inline-start" />
                </Button>
              </div>
              {message && (
                <Alert variant="destructive" className="settings-error" role="alert">
                  <AlertDescription>{message}</AlertDescription>
                </Alert>
              )}
              {!editing.id && editing.input.purpose === 'image' && (
                <FieldSet className="endpoint-presets" disabled={!!busy}>
                  <FieldLegend>快捷填写</FieldLegend>
                  <div>
                    {imageEndpointPresets.map((preset) => (
                      <Button
                        variant="outline"
                        key={preset.id}
                        type="button"
                        onClick={() =>
                          field({
                            name: preset.name,
                            protocol: preset.protocol,
                            baseUrl: preset.baseUrl,
                            apiKey: '',
                            model: '',
                          })
                        }
                      >
                        {preset.label}
                      </Button>
                    ))}
                  </div>
                  <small>切换预设会清空未保存的密钥和测试模型，请按所选服务重新填写。</small>
                </FieldSet>
              )}
              <FieldSet className="endpoint-form-group" disabled={!!busy}>
                <FieldLegend>服务连接</FieldLegend>
                <Field>
                  <FieldLabel className="settings-field">
                    <span>名称</span>
                    <Input
                      autoFocus
                      required
                      maxLength={120}
                      value={editing.input.name}
                      onChange={(e) => field({ name: e.target.value })}
                    />
                  </FieldLabel>
                </Field>
                <Field>
                  <FieldLabel className="settings-field">
                    <span>接口协议</span>
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
                        <SelectGroup>
                          {(editing.input.purpose === 'prompt'
                            ? ['openai_chat']
                            : ['openai_images', 'openai_chat', 'gemini_native']
                          ).map((protocol) => (
                            <SelectItem value={protocol} key={protocol}>
                              {editing.input.purpose === 'image'
                                ? imageProtocolLabels[protocol as AIProtocol]
                                : protocolLabels[protocol as AIProtocol]}
                            </SelectItem>
                          ))}
                        </SelectGroup>
                      </SelectContent>
                    </Select>
                    {editing.input.purpose === 'image' && (
                      <small>{imageProtocolHelp[editing.input.protocol].description}</small>
                    )}
                  </FieldLabel>
                </Field>
                <Field>
                  <FieldLabel className="settings-field">
                    <span>API 地址（Base URL）</span>
                    <Input
                      type="url"
                      required
                      value={editing.input.baseUrl}
                      placeholder={
                        editing.input.purpose === 'image'
                          ? imageProtocolHelp[editing.input.protocol].baseUrl
                          : 'https://api.example.com/v1'
                      }
                      onChange={(e) => field({ baseUrl: e.target.value })}
                    />
                    <small>填写接口根地址，保留 /v1 或 /v1beta；无需填写具体生图路径。</small>
                  </FieldLabel>
                </Field>
                <Field>
                  <FieldLabel className="settings-field">
                    <span>API Key</span>
                    <Input
                      ref={keyRef}
                      type="password"
                      autoComplete="new-password"
                      required={!editing.id}
                      value={editing.input.apiKey ?? ''}
                      placeholder={editing.id ? '留空保留现有密钥' : ''}
                      onChange={(e) => field({ apiKey: e.target.value })}
                    />
                    <small>
                      {editing.id
                        ? '留空保留已保存的密钥；填写新值会替换密钥。'
                        : '密钥加密保存，不会展示给前台用户。'}
                    </small>
                  </FieldLabel>
                </Field>
              </FieldSet>
              <FieldSet className="endpoint-form-group" disabled={!!busy}>
                <FieldLegend>
                  {editing.input.purpose === 'image' ? '测试与请求设置' : '模型与请求设置'}
                </FieldLegend>
                <div className="endpoint-form-grid">
                  <Field>
                    <FieldLabel className="settings-field">
                      <span>
                        {editing.input.purpose === 'image' ? '测试模型 ID（可选）' : 'Model'}
                      </span>
                      <Input
                        required={editing.input.purpose === 'prompt'}
                        maxLength={200}
                        value={editing.input.model}
                        onChange={(e) => field({ model: e.target.value })}
                      />
                      {editing.input.purpose === 'image' && (
                        <small>仅用于此页的生图测试。正式生成使用模型绑定中的上游 ID。</small>
                      )}
                    </FieldLabel>
                  </Field>
                  <Field>
                    <FieldLabel className="settings-field">
                      <span>请求超时（秒）</span>
                      <Input
                        type="number"
                        min={1}
                        max={600}
                        required
                        value={editing.input.timeoutSeconds}
                        onChange={(e) => field({ timeoutSeconds: Number(e.target.value) })}
                      />
                    </FieldLabel>
                  </Field>
                </div>
              </FieldSet>
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
                {editing.input.purpose === 'prompt' && (
                  <label>
                    <input
                      type="checkbox"
                      disabled={!!busy || !editing.input.enabled}
                      checked={editing.input.isDefault}
                      onChange={(e) => field({ isDefault: e.target.checked })}
                    />
                    默认服务
                  </label>
                )}
              </div>
              {editing.input.purpose === 'prompt' && (
                <p className="admin-field-hint">
                  请先确认模型支持图片输入，再勾选「支持图片识别」。图片反推可单独指定此服务，无需设为默认。
                </p>
              )}
              <DialogActions className="settings-form-actions">
                <Button
                  variant="outline"
                  type="button"
                  disabled={!!busy}
                  onClick={() => setEditing(null)}
                >
                  取消
                </Button>
                <Button type="submit" disabled={!!busy}>
                  <Save data-icon="inline-start" />
                  {busy === 'save'
                    ? '保存中…'
                    : editing.input.purpose === 'image'
                      ? '保存渠道'
                      : '保存服务'}
                </Button>
              </DialogActions>
            </form>
          )}
        </DialogContent>
      </Dialog>
      {confirmation}
    </>
  )
}
