'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowUpRight, Images, LoaderCircle, ScanText, WandSparkles } from 'lucide-react'
import { AdminPageHeader } from '@/components/admin/page-header'
import { AiEndpointEditor, type EndpointEditing } from '@/components/admin/ai-endpoint-editor'
import { AiServiceList } from '@/components/admin/ai-service-list'
import { Alert, AlertDescription } from '@/components/admin/ui/alert'
import { Button } from '@/components/admin/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/admin/ui/tabs'
import { PromptReverseSettingsPanel } from '@/components/prompt-reverse-settings-panel'
import { useActionConfirmation } from '@/components/use-action-confirmation'
import { useTransientMessage } from '@/hooks/use-transient-message'
import { getAdminAccessToken } from '@/lib/api'
import { adminRequest } from '@/lib/admin'
import type {
  AIEndpoint,
  EndpointInput,
  EndpointPurpose,
  PromptTemplate,
  AIConnectionTest,
} from '@/lib/ai-settings'
import styles from '@/components/admin/ai-services.module.css'

type View = 'image' | 'prompt' | 'reverse'
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
const errorMessage = (error: unknown) =>
  error instanceof Error ? error.message : '请求失败，请重试'

export default function AISettingsPage() {
  const router = useRouter()
  const [view, setView] = useState<View>('image')
  const [reverseVisited, setReverseVisited] = useState(false)
  const { ask, confirmation } = useActionConfirmation(getAdminAccessToken)
  const [reverseSaving, setReverseSaving] = useState(false)
  const [endpoints, setEndpoints] = useState<AIEndpoint[]>([])
  const [templates, setTemplates] = useState<PromptTemplate[]>([])
  const [templatesLoading, setTemplatesLoading] = useState(true)
  const [templatesError, setTemplatesError] = useState('')
  const [templateAttempt, setTemplateAttempt] = useState(0)
  const [canManage, setCanManage] = useState(false)
  const [loading, setLoading] = useState(true)
  const [loaded, setLoaded] = useState(false)
  const [loggedIn, setLoggedIn] = useState(true)
  const [message, setMessage] = useState('')
  const [saved, setSaved] = useTransientMessage()
  const [busy, setBusy] = useState('')
  const [editing, setEditing] = useState<EndpointEditing | null>(null)
  const [tests, setTests] = useState<
    Record<string, AIConnectionTest & { mode: 'connection' | 'generate' }>
  >({})
  const returnFocus = useRef<HTMLElement | null>(null)

  const load = useCallback(async (signal?: AbortSignal) => {
    const result = await adminRequest<{ endpoints: AIEndpoint[]; canManage: boolean }>(
      'ai-endpoints',
      'GET',
      undefined,
      signal,
    )
    if (signal?.aborted) return
    setEndpoints(result.endpoints)
    setCanManage(result.canManage)
    setLoaded(true)
  }, [])
  useEffect(() => {
    const tab = new URLSearchParams(window.location.search).get('tab')
    if (tab === 'site' || tab === 'prompts') {
      window.location.replace(tab === 'site' ? '/admin/site' : '/admin/prompts')
      return
    }
    if (tab === 'reverse' || tab === 'prompt' || tab === 'image') {
      setView(tab)
      if (tab === 'reverse') setReverseVisited(true)
    }
    if (!getAdminAccessToken()) {
      setLoggedIn(false)
      setLoading(false)
      return
    }
    const controller = new AbortController()
    load(controller.signal)
      .catch((error) => {
        if (!controller.signal.aborted) setMessage(errorMessage(error))
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false)
      })
    return () => controller.abort()
  }, [load])
  useEffect(() => {
    if (!reverseVisited || !canManage) return
    const controller = new AbortController()
    setTemplatesLoading(true)
    setTemplatesError('')
    adminRequest<{ templates: PromptTemplate[] }>(
      'prompt-templates',
      'GET',
      undefined,
      controller.signal,
    )
      .then((data) => {
        if (!controller.signal.aborted) setTemplates(data.templates)
      })
      .catch((error) => {
        if (!controller.signal.aborted) setTemplatesError(errorMessage(error))
      })
      .finally(() => {
        if (!controller.signal.aborted) setTemplatesLoading(false)
      })
    return () => controller.abort()
  }, [reverseVisited, canManage, templateAttempt])

  function edit(endpoint?: AIEndpoint, purpose: EndpointPurpose = 'image') {
    returnFocus.current = document.activeElement as HTMLElement
    setMessage('')
    setSaved('')
    setEditing(
      endpoint
        ? { id: endpoint.id, input: { ...endpoint, apiKey: endpoint.apiKey ?? '' } }
        : { input: newEndpoint(purpose) },
    )
  }
  async function action(id: string, run: () => Promise<unknown>, success: string) {
    if (busy) return
    setBusy(id)
    setMessage('')
    setSaved('')
    try {
      await run()
      await load()
      setSaved(success)
      setTests((previous) => {
        const next = { ...previous }
        delete next[id]
        return next
      })
    } catch (error) {
      setMessage(errorMessage(error))
    } finally {
      setBusy('')
    }
  }
  async function retry() {
    setLoading(true)
    setMessage('')
    try {
      await load()
    } catch (error) {
      setMessage(errorMessage(error))
    } finally {
      setLoading(false)
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
      setEditing(null)
      setTests((previous) => {
        const next = { ...previous }
        if (id) delete next[id]
        return next
      })
      await load()
      setSaved(
        input.purpose === 'image'
          ? '生图渠道已保存。下一步：在「模型与定价」中绑定渠道、填写上游模型 ID 并上架。'
          : '提示词服务已保存。默认服务用于 AI 帮写与服装规划，图片反推可单独选择识图服务。',
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
    if (busy || !endpoint.enabled) return
    if (
      mode === 'generate' &&
      !(await ask({
        title: '确认真实生图测试',
        description: `将通过「${endpoint.name}」使用 ${endpoint.model} 生成 1 张测试图。`,
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
  function switchView(next: View) {
    if (next === view || reverseSaving) return
    if (next === 'reverse') setReverseVisited(true)
    setSaved('')
    setMessage('')
    setView(next)
    const url = new URL(window.location.href)
    url.searchParams.set('tab', next)
    window.history.replaceState(window.history.state, '', url)
  }
  const defaultPrompt = endpoints.find(
    (item) => item.purpose === 'prompt' && item.enabled && item.isDefault,
  )

  return (
    <>
      <main className={`ai-settings ${styles.page}`}>
        <AdminPageHeader
          title="AI 服务"
          actions={
            <Button asChild variant="outline">
              <Link href="/admin/models">
                模型与定价
                <ArrowUpRight size={15} />
              </Link>
            </Button>
          }
        />
        {!loggedIn ? (
          <p>
            请先<Link href="/admin/login?next=%2Fadmin%2Fsettings">登录</Link>后管理 AI 服务。
          </p>
        ) : loading ? (
          <div className="settings-loading" role="status">
            <LoaderCircle className="settings-spinner" size={20} />
            正在读取配置
          </div>
        ) : !loaded ? (
          <Alert variant="destructive" role="alert">
            <AlertDescription>{message || '配置读取失败'}</AlertDescription>
            <Button variant="outline" onClick={retry}>
              重新读取
            </Button>
          </Alert>
        ) : (
          <Tabs
            value={view === 'reverse' && !canManage ? 'image' : view}
            onValueChange={(value) => switchView(value as View)}
            className={styles.tabs}
          >
            <TabsList aria-label="AI 服务用途" className={styles.tabList}>
              <TabsTrigger
                value="image"
                disabled={reverseSaving}
                onClick={() => switchView('image')}
              >
                <Images />
                生图渠道
              </TabsTrigger>
              <TabsTrigger
                value="prompt"
                disabled={reverseSaving}
                onClick={() => switchView('prompt')}
              >
                <WandSparkles />
                提示词与识图
              </TabsTrigger>
              {canManage && (
                <TabsTrigger
                  value="reverse"
                  disabled={reverseSaving}
                  onClick={() => switchView('reverse')}
                >
                  <ScanText />
                  图片反推
                </TabsTrigger>
              )}
            </TabsList>
            {message && !editing && (
              <Alert variant="destructive" role="alert">
                <AlertDescription>{message}</AlertDescription>
              </Alert>
            )}
            {saved && (
              <Alert role="status">
                <AlertDescription>{saved}</AlertDescription>
              </Alert>
            )}
            {(['image', 'prompt'] as const).map((purpose) => (
              <TabsContent value={purpose} key={purpose}>
                {purpose === 'image' ? (
                  <ol className={styles.setupSteps} aria-label="生图配置顺序">
                    <li>
                      <span>1</span>
                      <div>
                        <strong>连接生图渠道</strong>
                        <p>在此填写供应商地址与密钥。</p>
                      </div>
                    </li>
                    <li>
                      <span>2</span>
                      <div>
                        <Link href="/admin/models">
                          发布前台模型
                          <ArrowUpRight size={14} />
                        </Link>
                        <p>绑定渠道，填写上游 ID、积分价格并上架。</p>
                      </div>
                    </li>
                    <li>
                      <span>3</span>
                      <div>
                        <strong>验证生成效果</strong>
                        <p>在模型编辑页测试实际使用的绑定与参数。</p>
                      </div>
                    </li>
                  </ol>
                ) : (
                  <div className={styles.promptSummary}>
                    <div>
                      <span>当前默认服务</span>
                      <strong>{defaultPrompt?.name ?? '尚未配置'}</strong>
                      <p>
                        {defaultPrompt
                          ? `${defaultPrompt.model} · 用于 AI 帮写与服装规划`
                          : '添加并启用服务后，首个可用服务会自动成为默认。'}
                      </p>
                    </div>
                    <p>识图需要模型本身支持图片输入。图片反推可单独指定服务，也可跟随默认服务。</p>
                  </div>
                )}
                <AiServiceList
                  purpose={purpose}
                  endpoints={endpoints.filter((item) => item.purpose === purpose)}
                  canManage={canManage}
                  busy={busy}
                  tests={tests}
                  onAdd={() => edit(undefined, purpose)}
                  onEdit={edit}
                  onTest={testEndpoint}
                  onToggle={(endpoint) =>
                    action(
                      endpoint.id,
                      () =>
                        adminRequest(`ai-endpoints/${endpoint.id}`, 'PUT', {
                          ...endpoint,
                          enabled: !endpoint.enabled,
                          isDefault: false,
                        }),
                      endpoint.enabled
                        ? '服务已停用。依赖此服务的功能可能暂不可用。'
                        : '服务已启用。',
                    )
                  }
                  onDefault={(endpoint) =>
                    action(
                      endpoint.id,
                      () => adminRequest(`ai-endpoints/${endpoint.id}/default`, 'POST'),
                      `已将「${endpoint.name}」设为默认提示词服务。`,
                    )
                  }
                  onDelete={async (endpoint) => {
                    if (
                      await ask({
                        title: '删除 AI 服务',
                        description: `确定删除「${endpoint.name}」及其配置？`,
                        detail: '删除后不可恢复。仍被模型引用的渠道需先解除绑定。',
                        confirmLabel: '删除服务',
                      })
                    )
                      await action(
                        endpoint.id,
                        () => adminRequest(`ai-endpoints/${endpoint.id}`, 'DELETE'),
                        '服务已删除。',
                      )
                  }}
                />
                <div className={styles.related}>
                  <strong>
                    {purpose === 'image'
                      ? '渠道已保存，前台却没有模型？'
                      : '想调整 AI 的回答方式？'}
                  </strong>
                  <p>
                    {purpose === 'image'
                      ? '还需要在「模型与定价」创建模型、选择已启用的主渠道并上架。渠道中的测试模型 ID 不用于正式任务。'
                      : '在「系统提示词」调整各功能使用的指令。服务地址与密钥仍在此处管理。'}
                  </p>
                  <Link href={purpose === 'image' ? '/admin/models' : '/admin/prompts'}>
                    {purpose === 'image' ? '前往模型与定价' : '前往系统提示词'}
                    <ArrowUpRight size={14} />
                  </Link>
                </div>
              </TabsContent>
            ))}
            {canManage && (
              <TabsContent value="reverse" forceMount hidden={view !== 'reverse'}>
                {reverseVisited &&
                  (templatesLoading ? (
                    <p role="status" className="settings-loading">
                      正在读取反推配置…
                    </p>
                  ) : templatesError ? (
                    <Alert variant="destructive" role="alert">
                      <AlertDescription>反推模板读取失败：{templatesError}</AlertDescription>
                      <Button
                        variant="outline"
                        onClick={() => setTemplateAttempt((value) => value + 1)}
                      >
                        重新读取反推配置
                      </Button>
                    </Alert>
                  ) : (
                    <PromptReverseSettingsPanel
                      endpoints={endpoints}
                      templates={templates}
                      onSavingChange={setReverseSaving}
                      onOpenServices={() => switchView('prompt')}
                      onOpenTemplates={(key) =>
                        router.push(`/admin/prompts?template=${encodeURIComponent(key)}`)
                      }
                    />
                  ))}
              </TabsContent>
            )}
          </Tabs>
        )}
      </main>
      <AiEndpointEditor
        editing={editing}
        busy={!!busy}
        error={message}
        onChange={(patch) =>
          setEditing((previous) =>
            previous ? { ...previous, input: { ...previous.input, ...patch } } : null,
          )
        }
        onClose={() => setEditing(null)}
        onSubmit={saveEndpoint}
        returnFocus={returnFocus}
      />
      {confirmation}
    </>
  )
}
