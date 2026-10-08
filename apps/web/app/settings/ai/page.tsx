'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { Check, ChevronRight, LoaderCircle, Pencil, Plus, RotateCcw, Save, Settings2, Trash2, X, Zap } from 'lucide-react'
import { TopNavigation } from '@/components/top-navigation'
import { getAccessToken } from '@/lib/api'
import { settingsRequest, type AIEndpoint, type AIProtocol, type EndpointInput, type EndpointPurpose, type PromptTemplate, type AIConnectionTest } from '@/lib/ai-settings'

const protocolLabels: Record<AIProtocol, string> = {
  openai_chat: 'OpenAI Compatible',
  openai_image: 'OpenAI Image API',
  gemini_generate_content: 'Gemini generateContent',
}
function newEndpoint(purpose: EndpointPurpose): EndpointInput {
  return { name: '', purpose, protocol: purpose === 'prompt' ? 'openai_chat' : 'openai_image', baseUrl: '', model: '', apiKey: '', timeoutSeconds: purpose === 'prompt' ? 60 : 300, capabilities: {}, enabled: true, isDefault: false }
}
function errorMessage(error: unknown) { return error instanceof Error ? error.message : '请求失败，请重试' }

export default function AISettingsPage() {
  const [view, setView] = useState<'services' | 'prompts'>('services')
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
    const result = await settingsRequest<{ endpoints: AIEndpoint[]; canManage: boolean }>('ai-endpoints')
    setEndpoints(result.endpoints); setCanManage(result.canManage)
    if (result.canManage) {
      const data = await settingsRequest<{ templates: PromptTemplate[] }>('prompt-templates')
      setTemplates(data.templates)
    }
  }, [])
  useEffect(() => {
    if (!getAccessToken()) { setLoggedIn(false); setLoading(false); return }
    load().catch(error => setMessage(errorMessage(error))).finally(() => setLoading(false))
  }, [load])
  useEffect(() => {
    const template = templates.find(item => item.key === selectedKey)
    if (template) { setPromptDraft(template.content); setPromptDefault(template.defaultContent); setPromptEnabled(template.enabled) }
  }, [templates, selectedKey])
  useEffect(() => {
    if (editing) dialogRef.current?.showModal()
    else { dialogRef.current?.close(); returnFocus.current?.focus() }
  }, [editing])

  function edit(endpoint?: AIEndpoint, purpose: EndpointPurpose = 'prompt') {
    returnFocus.current = document.activeElement as HTMLElement
    setMessage('')
    setEditing(endpoint ? { id: endpoint.id, input: { ...endpoint, apiKey: '' } } : { input: newEndpoint(purpose) })
  }
  async function action(id: string, run: () => Promise<unknown>) {
    setBusy(id); setMessage(''); setSaved('')
    try { await run(); await load(); return true } catch (error) { setMessage(errorMessage(error)); return false } finally { setBusy('') }
  }
  async function saveEndpoint(event: React.FormEvent) {
    event.preventDefault()
    if (!editing) return
    setBusy('save'); setMessage('')
    try {
      const { id, input } = editing
      await settingsRequest(`ai-endpoints${id ? `/${id}` : ''}`, id ? 'PUT' : 'POST', input)
      if (keyRef.current) keyRef.current.value = ''
      setEditing(null); await load()
    } catch (error) { setMessage(errorMessage(error)) } finally { setBusy('') }
  }
  async function testEndpoint(endpoint: AIEndpoint) {
    setBusy(endpoint.id); setMessage('')
    try {
      const result = await settingsRequest<AIConnectionTest>(`ai-endpoints/${endpoint.id}/test`, 'POST')
      setTests(previous => ({ ...previous, [endpoint.id]: result }))
    } catch (error) { setMessage(errorMessage(error)) } finally { setBusy('') }
  }
  function field(patch: Partial<EndpointInput>) {
    setEditing(previous => previous ? { ...previous, input: { ...previous.input, ...patch } } : null)
  }
  async function savePrompt(restoreDefault = false) {
    const success = await action('prompt', () => settingsRequest('prompt-templates', 'PUT', { key: selectedKey, content: promptDraft, enabled: promptEnabled, restoreDefault }))
    if (success) setSaved(restoreDefault ? '已恢复默认提示词' : '提示词已保存')
  }

  return <div className="site-shell">
    <TopNavigation />
    <main className="ai-settings">
      <div className="settings-heading"><div><p>工作空间 / 设置</p><h1>设置</h1></div><Link href="/workbench?mode=general">返回工作台 <ChevronRight size={16} /></Link></div>
      {!loggedIn ? <p>请先<Link href="/login">登录</Link>后管理 AI 配置。</p> : loading ? <div className="settings-loading" role="status"><LoaderCircle className="settings-spinner" size={20} />正在读取配置</div> : <>
        <div className="settings-tabs" role="tablist" aria-label="设置分类">
          <button id="services-tab" role="tab" aria-selected={view === 'services'} aria-controls="services-panel" onClick={() => setView('services')}><Settings2 size={16} />AI 服务</button>
          {canManage && <button id="prompts-tab" role="tab" aria-selected={view === 'prompts'} aria-controls="prompts-panel" onClick={() => setView('prompts')}><Pencil size={16} />Prompt 配置</button>}
        </div>
        {!canManage && <p className="settings-notice">仅首个注册账号可管理全局 AI 配置。</p>}
        {message && !editing && <p className="settings-error" role="alert">{message}</p>}
        {saved && <p role="status">{saved}</p>}
        {view === 'services' ? <div id="services-panel" role="tabpanel" aria-labelledby="services-tab">
          {(['prompt', 'image'] as const).map(purpose => <section className="endpoint-section" key={purpose}>
            <div className="endpoint-section-head"><h2>{purpose === 'prompt' ? 'Prompt AI' : 'Image AI'}</h2>{canManage && <button className="settings-command" onClick={() => edit(undefined, purpose)}><Plus size={16} />添加服务</button>}</div>
            {!endpoints.some(endpoint => endpoint.purpose === purpose) ? <p className="settings-empty">尚未配置{purpose === 'prompt' ? '提示词' : '生图'} AI 服务</p> : <div className="endpoint-list">
              {endpoints.filter(endpoint => endpoint.purpose === purpose).map(endpoint => <article className="endpoint-row" key={endpoint.id}>
                <div className="endpoint-details"><div className="endpoint-name"><h3>{endpoint.name}</h3>{endpoint.isDefault && <span><Check size={12} />默认</span>}<label className="settings-switch"><input type="checkbox" checked={endpoint.enabled} disabled={!canManage || !!busy} onChange={() => action(endpoint.id, () => settingsRequest(`ai-endpoints/${endpoint.id}`, 'PUT', { ...endpoint, enabled: !endpoint.enabled, isDefault: false }))} />启用</label></div>
                  <p>{protocolLabels[endpoint.protocol]}<span>·</span>{endpoint.model}{purpose === 'prompt' && <span>Vision: {endpoint.capabilities.vision ? '支持' : '不支持'}</span>}</p>
                  {canManage && <p className="endpoint-url">{endpoint.baseUrl}<span>{endpoint.apiKeyMasked}</span></p>}
                  {tests[endpoint.id] && <p className={tests[endpoint.id]?.success ? 'connection-result' : 'settings-error'} role="status">{tests[endpoint.id]?.message} · {tests[endpoint.id]?.model} · {tests[endpoint.id]?.responseTimeMs} ms</p>}
                </div>
                {canManage && <div className="endpoint-actions">
                  {endpoint.enabled && !endpoint.isDefault && <button disabled={!!busy} onClick={() => action(endpoint.id, () => settingsRequest(`ai-endpoints/${endpoint.id}/default`, 'POST'))}>设为默认</button>}
                  <button className="settings-icon" title="编辑" aria-label={`编辑 ${endpoint.name}`} disabled={!!busy} onClick={() => edit(endpoint)}><Pencil size={17} /></button>
                  <button className="settings-icon" title="测试连接" aria-label={`测试 ${endpoint.name} 连接`} disabled={!!busy} onClick={() => testEndpoint(endpoint)}>{busy === endpoint.id ? <LoaderCircle className="settings-spinner" size={17} /> : <Zap size={17} />}</button>
                  <button className="settings-icon" title="删除" aria-label={`删除 ${endpoint.name}`} disabled={!!busy} onClick={() => { if (window.confirm(`删除“${endpoint.name}”？`)) action(endpoint.id, () => settingsRequest(`ai-endpoints/${endpoint.id}`, 'DELETE')) }}><Trash2 size={17} /></button>
                </div>}
              </article>)}
            </div>}
          </section>)}
        </div> : <section id="prompts-panel" role="tabpanel" aria-labelledby="prompts-tab" className="prompt-settings">
          <nav aria-label="提示词模板">{templates.map(template => <button key={template.key} aria-current={template.key === selectedKey ? 'true' : undefined} onClick={() => { if (promptDraft !== templates.find(t => t.key === selectedKey)?.content && !window.confirm('放弃未保存的修改？')) return; setSelectedKey(template.key) }}>{template.name}</button>)}</nav>
          <div className="prompt-settings-editor"><div className="endpoint-section-head"><h2>{templates.find(t => t.key === selectedKey)?.name}</h2><label className="settings-switch"><input type="checkbox" checked={promptEnabled} onChange={event => setPromptEnabled(event.target.checked)} />启用</label></div>
            <label className="settings-field"><span>Prompt 内容</span><textarea value={promptDraft} maxLength={20000} rows={18} onChange={event => setPromptDraft(event.target.value)} /></label>
            <details className="prompt-default"><summary>查看默认 Prompt</summary><pre>{promptDefault}</pre></details>
            <div className="settings-form-actions"><button className="settings-command" disabled={!!busy} onClick={() => { if (window.confirm('恢复默认提示词？当前修改将被替换。')) savePrompt(true) }}><RotateCcw size={16} />恢复默认</button><button className="settings-primary" disabled={!!busy || !promptDraft.trim()} onClick={() => savePrompt()}><Save size={16} />{busy === 'prompt' ? '保存中' : '保存'}</button></div>
          </div>
        </section>}
      </>}
    </main>
    <dialog ref={dialogRef} className="endpoint-dialog" onCancel={event => { if (busy) event.preventDefault(); else setEditing(null) }} onClose={() => { if (!busy) setEditing(null) }}>
      {editing && <form onSubmit={saveEndpoint}>
        <div className="endpoint-section-head"><h2>{editing.id ? '编辑服务' : '添加服务'}</h2><button type="button" className="settings-icon" title="关闭" aria-label="关闭编辑" disabled={!!busy} onClick={() => setEditing(null)}><X size={20} /></button></div>
        {message && <p className="settings-error" role="alert">{message}</p>}
        <label className="settings-field"><span>名称</span><input autoFocus required maxLength={120} value={editing.input.name} onChange={e => field({ name: e.target.value })} /></label>
        <label className="settings-field"><span>协议</span><select value={editing.input.protocol} onChange={e => field({ protocol: e.target.value as AIProtocol })}>{(editing.input.purpose === 'prompt' ? ['openai_chat'] : ['openai_image', 'gemini_generate_content']).map(protocol => <option value={protocol} key={protocol}>{protocolLabels[protocol as AIProtocol]}</option>)}</select></label>
        <label className="settings-field"><span>Base URL</span><input type="url" required value={editing.input.baseUrl} placeholder="https://api.example.com/v1" onChange={e => field({ baseUrl: e.target.value })} /></label>
        <label className="settings-field"><span>API Key</span><input ref={keyRef} type="password" autoComplete="new-password" required={!editing.id} value={editing.input.apiKey ?? ''} placeholder={editing.id ? '留空保留现有密钥' : ''} onChange={e => field({ apiKey: e.target.value })} /></label>
        <div className="endpoint-form-grid"><label className="settings-field"><span>Model</span><input required maxLength={200} value={editing.input.model} onChange={e => field({ model: e.target.value })} /></label><label className="settings-field"><span>Timeout / 秒</span><input type="number" min={1} max={600} required value={editing.input.timeoutSeconds} onChange={e => field({ timeoutSeconds: Number(e.target.value) })} /></label></div>
        <div className="settings-checks">{editing.input.purpose === 'prompt' && <label><input type="checkbox" checked={!!editing.input.capabilities.vision} onChange={e => field({ capabilities: { ...editing.input.capabilities, vision: e.target.checked } })} />支持图片识别</label>}<label><input type="checkbox" checked={editing.input.enabled} onChange={e => field({ enabled: e.target.checked, isDefault: e.target.checked && editing.input.isDefault })} />启用</label><label><input type="checkbox" disabled={!editing.input.enabled} checked={editing.input.isDefault} onChange={e => field({ isDefault: e.target.checked })} />默认服务</label></div>
        <div className="settings-form-actions"><button type="button" className="settings-command" disabled={!!busy} onClick={() => setEditing(null)}>取消</button><button type="submit" className="settings-primary" disabled={!!busy}><Save size={16} />{busy === 'save' ? '保存中' : '保存'}</button></div>
      </form>}
    </dialog>
  </div>
}
