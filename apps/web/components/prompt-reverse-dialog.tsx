'use client'

import { useAccount } from './account-provider'

import { SavePersonalPrompt } from './save-personal-prompt'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Check, Copy, History, ImagePlus, LoaderCircle, Plus, RotateCcw, ScanText, Trash2, X, ArrowUpRight } from 'lucide-react'
import { useEffect, useRef, useState, type FormEvent } from 'react'
import { getAccessToken } from '@/lib/api'
import { copyText } from '@/lib/clipboard'
import { analysisLabels, createReverseRequestId, isReverseActive, prepareReverseFile, reverseRequest, ReverseRequestError, reverseStatusLabels, reverseStorageKey, validateReverseFile, type ReverseConfiguration, type ReverseLanguage, type ReverseOpenOptions, type ReverseTask } from '@/lib/prompt-reverse'
import type { ManagedInspirationCategory } from '@/lib/inspiration-settings'
import { AuthenticatedImage, forgetProtectedImage, loadProtectedImage } from './authenticated-image'
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from './select'

const errorText = (error: unknown) => error instanceof Error ? error.message : '请求失败，请稍后重试'
interface ReverseDraft { taskId?: string; mode: 'scene' | 'style'; requirements: string; language: ReverseLanguage; drafts: { zh: string; en: string }; includeReference: boolean }

export function PromptReverseDialog({ open, request, onClose }: { open: boolean; request: ReverseOpenOptions & { revision: number }; onClose: () => void }) {
  const router = useRouter()
  const { account } = useAccount()
  const dialogRef = useRef<HTMLDialogElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const previousFocus = useRef<HTMLElement | null>(null)
  const requestNonce = useRef<{ signature: string; id: string } | null>(null)
  const submitting = useRef(false)
  const initialized = useRef(false)
  const sessionOwner = useRef('')
  const draftTask = useRef('')
  const revision = useRef(0)
  const [file, setFile] = useState<File | null>(null)
  const [assetId, setAssetId] = useState('')
  const [localURL, setLocalURL] = useState('')
  const [task, setTask] = useState<ReverseTask | null>(null)
  const [history, setHistory] = useState<ReverseTask[]>([])
  const [config, setConfig] = useState<ReverseConfiguration | null>(null)
  const [mode, setMode] = useState<'scene' | 'style'>('scene')
  const [requirements, setRequirements] = useState('')
  const [language, setLanguage] = useState<ReverseLanguage>('zh')
  const [drafts, setDrafts] = useState({ zh: '', en: '' })
  const [includeReference, setIncludeReference] = useState(true)
  const [applyAction, setApplyAction] = useState<'replace' | 'append'>('replace')
  const [busy, setBusy] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [copied, setCopied] = useState(false)
  const [confirmRerun, setConfirmRerun] = useState(false)
  const [pendingHistoryId, setPendingHistoryId] = useState('')
  const [confirmClear, setConfirmClear] = useState(false)
  const [configurationAttempt, setConfigurationAttempt] = useState(0)
  const [saving, setSaving] = useState(false)
  const [categories, setCategories] = useState<ManagedInspirationCategory[]>([])
  const [title, setTitle] = useState('')
  const [categoryId, setCategoryId] = useState('')
  const [useCover, setUseCover] = useState(false)
  const [newCategory, setNewCategory] = useState<string | null>(null)
  const [savedPromptId, setSavedPromptId] = useState('')
  const loggedIn = typeof window !== 'undefined' && !!getAccessToken()
  const active = isReverseActive(task)
  const changed = !!task && (task.mode !== mode || task.requirements !== requirements.trim())
  const ready = !!task?.result && !active && !changed && !!drafts[language].trim()
  const dirty = !!task?.result && (drafts.zh !== task.result.promptZh || drafts.en !== task.result.promptEn)

  useEffect(() => {
    if (!file) { setLocalURL(''); return }
    const url = URL.createObjectURL(file); setLocalURL(url)
    return () => URL.revokeObjectURL(url)
  }, [file])

  useEffect(() => {
    if (!open) { dialogRef.current?.close(); previousFocus.current?.isConnected && previousFocus.current.focus({ preventScroll: true }); return }
    previousFocus.current = document.activeElement as HTMLElement
    dialogRef.current?.showModal()
    const oldOverflow = document.body.style.overflow; document.body.style.overflow = 'hidden'
    setError(''); setNotice(''); setSaving(false); setConfirmRerun(false); setSavedPromptId('')
    setPendingHistoryId('')
    setConfirmClear(false)
    const owner = reverseStorageKey('owner')
    if (sessionOwner.current !== owner) {
      sessionOwner.current = owner; initialized.current = false; draftTask.current = ''; requestNonce.current = null
      setFile(null); setAssetId(''); setTask(null); setHistory([]); setDrafts({ zh: '', en: '' }); setMode('scene'); setRequirements(''); setLanguage('zh'); setIncludeReference(true); setConfig(null)
    }
    const current = ++revision.current
    if (request.files?.length || request.assetId) {
      setFile(request.files?.[0] ?? null); setAssetId(request.assetId ?? ''); setTask(null); setDrafts({ zh: '', en: '' }); draftTask.current = ''
      setMode('scene'); setRequirements(''); setIncludeReference(true); requestNonce.current = null
    }
    const controller = new AbortController()
    if (getAccessToken()) {
      setLoading(true)
      Promise.all([
        reverseRequest<ReverseConfiguration>('prompt-reverse-settings', { signal: controller.signal }),
        reverseRequest<{ tasks: ReverseTask[] }>('prompts/reverse', { signal: controller.signal }),
      ]).then(([configuration, recent]) => {
        if (controller.signal.aborted) return
        setConfig(configuration); setHistory(recent.tasks)
        if (!initialized.current && revision.current === current && !request.files?.length && !request.assetId) {
          let saved: ReverseDraft | null = null
          try { saved = JSON.parse(localStorage.getItem(reverseStorageKey('draft')) ?? 'null') } catch { /* An invalid draft is ignored. */ }
          const restored = saved?.taskId ? recent.tasks.find(item => item.id === saved?.taskId) : recent.tasks[0]
          if (restored) {
            setTask(restored); setMode(restored.mode); setRequirements(restored.requirements)
            if (saved?.taskId === restored.id && saved.drafts && typeof saved.drafts.zh === 'string' && typeof saved.drafts.en === 'string') {
              draftTask.current = restored.id; setDrafts(saved.drafts); setLanguage(saved.language === 'en' ? 'en' : 'zh'); setIncludeReference(saved.includeReference)
            } else setIncludeReference(restored.mode === 'scene')
          }
        }
        initialized.current = true
      }).catch(reason => { if (!controller.signal.aborted) setError(errorText(reason)) })
        .finally(() => { if (!controller.signal.aborted) setLoading(false) })
    }
    return () => { controller.abort(); document.body.style.overflow = oldOverflow }
  }, [open, request.revision, configurationAttempt])

  useEffect(() => {
    if (!task?.result || draftTask.current === task.id) return
    draftTask.current = task.id; setDrafts({ zh: task.result.promptZh, en: task.result.promptEn }); setCopied(false)
  }, [task?.id, task?.result])

  useEffect(() => {
    if (!open || !task?.result || !window.matchMedia('(max-width: 780px)').matches) return
    const frame = requestAnimationFrame(() => {
      const body = dialogRef.current?.querySelector<HTMLElement>('.reverse-body')
      const result = body?.querySelector<HTMLElement>('.reverse-result')
      if (body && result) body.scrollTop += result.getBoundingClientRect().top - body.getBoundingClientRect().top
    })
    return () => cancelAnimationFrame(frame)
  }, [open, task?.id, !!task?.result])

  useEffect(() => {
    if (!initialized.current || !getAccessToken()) return
    const draft: ReverseDraft = { taskId: task?.id, mode, requirements, language, drafts, includeReference }
    try { localStorage.setItem(reverseStorageKey('draft'), JSON.stringify(draft)) } catch { /* Editing remains available when storage is full. */ }
  }, [task?.id, mode, requirements, language, drafts, includeReference])

  useEffect(() => {
    if (!open || !active || !task) return
    const id = task.id; const controller = new AbortController(); let timer = 0
    const poll = async () => {
      try {
        const response = await reverseRequest<{ task: ReverseTask }>(`prompts/reverse/${encodeURIComponent(id)}`, { signal: controller.signal })
        if (controller.signal.aborted) return
        setTask(previous => previous?.id === id ? response.task : previous)
        setHistory(previous => [response.task, ...previous.filter(item => item.id !== id)].slice(0, 12))
        if (!isReverseActive(response.task)) return
      } catch (reason) { if (controller.signal.aborted) return; setError(errorText(reason)); if (reason instanceof ReverseRequestError && [401,404,410].includes(reason.status)) { setTask(previous => previous?.id === id ? { ...previous, status: 'failed', errorMessage: errorText(reason) } : previous); return } }
      timer = window.setTimeout(poll, document.visibilityState === 'visible' ? 2000 : 6000)
    }
    timer = window.setTimeout(poll, 600)
    return () => { controller.abort(); window.clearTimeout(timer) }
  }, [open, active, task?.id])

  useEffect(() => {
    if (!open) return
    const paste = (event: ClipboardEvent) => {
      if (active || busy || saving) return
      const image = Array.from(event.clipboardData?.items ?? []).find(item => item.kind === 'file' && item.type.startsWith('image/'))?.getAsFile()
      if (image) { event.preventDefault(); chooseFile(image) }
    }
    dialogRef.current?.addEventListener('paste', paste)
    return () => dialogRef.current?.removeEventListener('paste', paste)
  }, [open, active, busy, saving])

  function chooseFile(next: File) {
    try { validateReverseFile(next) } catch (reason) { setError(errorText(reason)); return }
    revision.current++; setFile(next); setAssetId(''); setTask(null); setDrafts({ zh: '', en: '' }); draftTask.current = ''; requestNonce.current = null
    setError(''); setNotice(''); setCopied(false); setConfirmRerun(false); setSavedPromptId('')
  }

  async function analyze() {
    if (submitting.current || active || !config?.available || (!file && !assetId && !task)) return
    submitting.current = true; setBusy('analyze'); setError(''); setNotice(''); setConfirmRerun(false); setCopied(false)
    const current = revision.current
    try {
      const body = new FormData(); body.append('mode', mode); body.append('requirements', requirements.trim())
      const signature = `${file?.name ?? (assetId || task?.id)}:${file?.size ?? 0}:${file?.lastModified ?? 0}:${mode}:${requirements.trim()}`
      if (requestNonce.current?.signature !== signature) requestNonce.current = { signature, id: createReverseRequestId() }
      body.append('requestId', requestNonce.current.id)
      if (file) { body.append('image', file); body.append('analysisImage', await prepareReverseFile(file, config.settings.imageDetail)) }
      else if (assetId) body.append('assetId', assetId)
      else if (task) { const cached = await loadProtectedImage(task.imageUrl); body.append('image', new File([cached.blob], task.imageName, { type: cached.blob.type })) }
      const response = await reverseRequest<{ task: ReverseTask }>('prompts/reverse', { method: 'POST', body })
      requestNonce.current = null
      if (revision.current !== current) return
      setTask(response.task); setHistory(previous => [response.task, ...previous.filter(item => item.id !== response.task.id)].slice(0, 12)); setSavedPromptId('')
    } catch (reason) { if (revision.current === current) setError(errorText(reason)) }
    finally { submitting.current = false; setBusy('') }
  }

  async function cancelAnalysis() {
    if (!task || busy) return
    setBusy('cancel'); setError('')
    try { const response = await reverseRequest<{ task: ReverseTask }>(`prompts/reverse/${task.id}/cancel`, { method: 'POST' }); setTask(response.task) }
    catch (reason) { setError(errorText(reason)) } finally { setBusy('') }
  }

  async function clearAnalysis() {
    if (!task || active || busy) return
    setBusy('clear'); setError('')
    try {
      try { await reverseRequest(`prompts/reverse/${task.id}`, { method: 'DELETE' }) }
      catch (reason) { if (!(reason instanceof ReverseRequestError && [404,410].includes(reason.status))) throw reason }
      forgetProtectedImage(task.imageUrl); setHistory(previous => previous.filter(item => item.id !== task.id)); setTask(null); setFile(null); setAssetId(''); setDrafts({ zh: '', en: '' }); draftTask.current = ''; requestNonce.current = null; setConfirmClear(false); setNotice('本次分析与临时原图已清除，已保存的灵感会保留')
    } catch (reason) { setError(errorText(reason)) } finally { setBusy('') }
  }

  function restoreHistory(id: string, discard = false) {
    if (busy || id === task?.id) return
    if (dirty && !discard) { setPendingHistoryId(id); return }
    const selected = history.find(item => item.id === id); if (!selected) return
    revision.current++; requestNonce.current = null; setFile(null); setAssetId(''); setTask(selected); setMode(selected.mode); setRequirements(selected.requirements)
    draftTask.current = ''; setDrafts({ zh: '', en: '' }); setIncludeReference(selected.mode === 'scene'); setError(''); setNotice(''); setSavedPromptId('')
    setPendingHistoryId('')
  }

  async function copy() {
    try { await copyText(drafts[language]); setCopied(true); setNotice('提示词已复制') }
    catch { setError('复制失败，可选中提示词后复制') }
  }

  async function apply() {
    if (!ready || !task || busy) return
    setBusy('apply'); setError('')
    try {
      let referenceFile: File | undefined
      if (includeReference) {
        if (file) referenceFile = file
        else { const cached = await loadProtectedImage(assetId ? `/v1/assets/${encodeURIComponent(assetId)}/content` : task.imageUrl); referenceFile = new File([cached.blob], task.imageName, { type: cached.blob.type }) }
      }
      if (request.onApply) await request.onApply({ text: drafts[language], referenceFile, action: applyAction })
      else {
        localStorage.setItem(reverseStorageKey('handoff'), JSON.stringify({ id: task.id, text: drafts[language], includeReference, createdAt: Date.now() }))
        router.push(`/workbench?mode=general&reversePrompt=${encodeURIComponent(task.id)}`)
      }
      onClose()
    } catch (reason) { setError(errorText(reason)) } finally { setBusy('') }
  }

  async function openSave() {
    if (!ready || busy) return
    setBusy('categories'); setError('')
    try {
      const data = await reverseRequest<{ categories: ManagedInspirationCategory[] }>('inspiration/categories?includeDisabled=true')
      setCategories(data.categories); setTitle(task?.imageName.replace(/\.[^.]+$/, '') ?? '图片灵感'); setCategoryId(data.categories[0]?.id ?? ''); setUseCover(false); setNewCategory(null); setSaving(true)
    } catch (reason) { setError(errorText(reason)) } finally { setBusy('') }
  }

  async function createCategory() {
    if (!newCategory?.trim() || busy) return
    setBusy('category'); setError('')
    try {
      const data = await reverseRequest<{ category: ManagedInspirationCategory }>('inspiration/categories', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: newCategory.trim() }) })
      setCategories(previous => [...previous, data.category]); setCategoryId(data.category.id); setNewCategory(null)
    } catch (reason) { setError(errorText(reason)) } finally { setBusy('') }
  }

  async function save(event: FormEvent) {
    event.preventDefault(); if (!ready || !task || busy || !title.trim() || !categoryId) return
    setBusy('save'); setError('')
    try {
      const category = categories.find(item => item.id === categoryId)
      const data = await reverseRequest<{ prompt: { id: string } }>('inspiration/prompts', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title: title.trim(), categoryId, category: category?.category, prompt: drafts[language], enabled: false, source: `图片反推 · ${task.result?.model ?? ''}`, sortOrder: 0, ...(useCover ? { reverseTaskId: task.id } : {}) }) })
      setSaving(false); setSavedPromptId(data.prompt.id); setNotice('已保存为未启用的灵感草稿，可确认内容后启用')
    } catch (reason) { setError(errorText(reason)) } finally { setBusy('') }
  }

  const sourcePath = assetId ? `/v1/assets/${encodeURIComponent(assetId)}/content` : task?.imageUrl
  const previewName = file?.name ?? request.imageName ?? task?.imageName ?? ''
  return <dialog ref={dialogRef} className="prompt-reverse-dialog" aria-labelledby="reverse-title" onCancel={event => { event.preventDefault(); saving ? setSaving(false) : onClose() }} onClick={event => { if (event.target === event.currentTarget) { const rect = event.currentTarget.getBoundingClientRect(); if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) onClose() } }}>
    <div className="reverse-sheet">
      <header className="reverse-head"><div><h2 id="reverse-title">{saving ? '保存到灵感库' : '图片反推提示词'}</h2><p>{saving ? '先保存为草稿，确认内容后再启用' : '把参考画面变成可编辑的创作描述'}</p></div><button type="button" className="settings-icon" aria-label="关闭图片反推" onClick={onClose}><X size={20} aria-hidden="true" /></button></header>
      {!loggedIn ? <div className="reverse-login"><ScanText size={32} aria-hidden="true" /><p>登录后即可上传图片，提炼提示词并保存分析结果。</p><Link className="studio-primary" href="/login?next=%2Fworkbench%3Fmode%3Dgeneral" onClick={onClose}>登录并开始</Link></div> : <>
        {error && <div className="settings-error reverse-feedback" role="alert">{error}{!config && <button type="button" className="settings-command" onClick={() => setConfigurationAttempt(previous => previous + 1)}>重新读取配置</button>}</div>}
        {notice && <p className="reverse-feedback reverse-notice" role="status">{notice}{savedPromptId && <Link href="/admin/inspiration" onClick={onClose}>查看草稿<ArrowUpRight size={14} aria-hidden="true" /></Link>}</p>}
        {saving ? <form id="reverse-save-form" className="reverse-save-body" onSubmit={event => void save(event)}>
          <label className="settings-field"><span>标题</span><input autoFocus maxLength={160} required value={title} disabled={!!busy} onChange={event => setTitle(event.target.value)} /></label>
          <label className="settings-field"><span>分类</span><Select key={categories.map(item => item.id).join(',')} value={categoryId} onValueChange={setCategoryId} disabled={!!busy || !categories.length}><SelectTrigger aria-label="灵感草稿分类"><SelectValue placeholder="选择分类" /></SelectTrigger><SelectContent portalContainer={dialogRef.current}><SelectGroup>{categories.map(item => <SelectItem value={item.id} key={item.id}>{item.category}</SelectItem>)}</SelectGroup></SelectContent></Select></label>
          {newCategory !== null ? <div className="inspiration-inline-category"><input aria-label="新增灵感分类名称" placeholder="输入分类名称" autoFocus maxLength={80} disabled={!!busy} value={newCategory} onChange={event => setNewCategory(event.target.value)} onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); void createCategory() } }} /><div><button type="button" className="settings-command" disabled={!!busy || !newCategory.trim()} onClick={() => void createCategory()}>新增并选择</button><button type="button" className="settings-command" disabled={!!busy} onClick={() => setNewCategory(null)}>取消</button></div></div> : <button type="button" className="inspiration-category-add" onClick={() => setNewCategory('')}><Plus size={14} aria-hidden="true" />新增分类</button>}
          <label className="settings-field"><span>提示词</span><textarea aria-label="保存的灵感提示词" value={drafts[language]} maxLength={10000} rows={7} disabled={!!busy} onChange={event => setDrafts(previous => ({ ...previous, [language]: event.target.value }))} /></label>
          <label className="reverse-checkbox"><input type="checkbox" checked={useCover} disabled={!!busy} onChange={event => setUseCover(event.target.checked)} />使用原图作为灵感封面</label>{useCover && <p className="reverse-help">启用此灵感后，封面会显示在发现灵感页。</p>}
        </form> : <div className="reverse-body">
          <section className="reverse-source" aria-label="图片与分析设置">
            <div className="reverse-section-head"><h3>参考图片</h3><span>单张图片</span></div>
            <div className={`reverse-image${!localURL && !sourcePath ? ' is-empty' : ''}`} onDragOver={event => { if (!active && !busy) event.preventDefault() }} onDrop={event => { event.preventDefault(); if (!active && !busy && event.dataTransfer.files[0]) chooseFile(event.dataTransfer.files[0]) }}>
              {localURL ? <img src={localURL} alt="上传的参考图片" /> : sourcePath ? <AuthenticatedImage key={sourcePath} path={sourcePath} alt="分析的参考图片" /> : <button type="button" className="reverse-upload" disabled={!!busy || loading} onClick={() => inputRef.current?.click()}><ImagePlus size={32} aria-hidden="true" /><strong>添加参考图片</strong><span>点击上传、拖入或粘贴图片</span><small>JPG / PNG / WebP · 最多 10 MB</small></button>}
            </div>
            <input ref={inputRef} type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" tabIndex={-1} aria-label="上传反推参考图片" onChange={event => { const selected = event.target.files?.[0]; if (selected) chooseFile(selected); event.target.value = '' }} />
            {(localURL || sourcePath) && <div className="reverse-image-meta"><span title={previewName}>{previewName}</span><button type="button" className="settings-command" disabled={active || !!busy} onClick={() => inputRef.current?.click()}>替换图片</button>{task && !active && <button type="button" className="settings-icon" aria-label="清除这次分析" title="清除分析与临时原图" disabled={!!busy} onClick={() => setConfirmClear(true)}><Trash2 size={14} aria-hidden="true" /></button>}</div>}
            {confirmClear && <div className="reverse-rerun-confirm" role="alert"><p>清除此分析和临时原图？已保存的灵感会保留。</p><button type="button" className="settings-command" disabled={!!busy} onClick={() => setConfirmClear(false)}>保留记录</button><button type="button" className="settings-primary" disabled={!!busy} onClick={() => void clearAnalysis()}>确认清除</button></div>}
            {!!request.files && request.files.length > 1 && <div className="reverse-reference-picker" aria-label="选择已有参考图片">{request.files.map((item, index) => <button type="button" key={`${item.name}-${index}`} disabled={active || !!busy} aria-pressed={item === file} onClick={() => chooseFile(item)}>参考 {index + 1}</button>)}</div>}
            <fieldset className="reverse-mode"><legend>分析模式</legend><div role="group" aria-label="图片反推模式"><button type="button" disabled={active || !!busy} aria-pressed={mode === 'scene'} onClick={() => { setMode('scene'); setIncludeReference(true); setCopied(false) }}>还原画面</button><button type="button" disabled={active || !!busy} aria-pressed={mode === 'style'} onClick={() => { setMode('style'); setIncludeReference(false); setCopied(false) }}>只提取风格</button></div><p>{mode === 'scene' ? '描述主体、场景、构图和光影。' : '提取视觉语言，跳过原图具体人物、商品和文字。'}</p></fieldset>
            <details className="reverse-extra"><summary>补充要求<span>选填</span></summary><label className="sr-only" htmlFor="reverse-requirements">补充分析要求</label><textarea id="reverse-requirements" rows={3} maxLength={2000} value={requirements} disabled={active || !!busy} placeholder="例如：重点描述光影，不要画面文字" onChange={event => setRequirements(event.target.value)} /></details>
            {confirmRerun && <div className="reverse-rerun-confirm" role="alert"><p>重新分析会替换当前编辑的提示词。</p><button type="button" className="settings-command" onClick={() => setConfirmRerun(false)}>保留编辑</button><button type="button" className="settings-primary" onClick={() => void analyze()}>重新分析</button></div>}
            {active ? <div className="reverse-progress" role="status"><LoaderCircle className="settings-spinner" size={17} aria-hidden="true" /><span>{reverseStatusLabels[task!.status]}</span><button type="button" className="settings-command" disabled={!!busy} onClick={() => void cancelAnalysis()}>{busy === 'cancel' ? '取消中…' : '取消分析'}</button></div> : <button type="button" className={`${task ? 'settings-command' : 'settings-primary'} reverse-analyze`} disabled={!!busy || loading || !config?.available || (!file && !assetId && !task)} onClick={() => dirty ? setConfirmRerun(true) : void analyze()}>{busy === 'analyze' || loading ? <LoaderCircle className="settings-spinner" size={16} aria-hidden="true" /> : <ScanText size={16} aria-hidden="true" />}{busy === 'analyze' ? '正在提交图片…' : task ? '重新分析' : '开始反推'}</button>}
            {config && !config.available && <p className="reverse-provider">{config.reason}{account.user?.role === 'admin' && <Link href="/admin/settings?tab=reverse" onClick={onClose}>配置识图服务</Link>}</p>}
          </section>
          <section className="reverse-result" aria-label="反推结果">
            <div className="reverse-result-head"><h3>生成的提示词</h3><Select value={language} onValueChange={value => { setLanguage(value as ReverseLanguage); setCopied(false) }} disabled={!!busy}><SelectTrigger aria-label="提示词语言"><SelectValue /></SelectTrigger><SelectContent portalContainer={dialogRef.current}><SelectItem value="zh">中文</SelectItem><SelectItem value="en">English</SelectItem></SelectContent></Select></div>
            {history.length > 0 && <label className="reverse-history"><History size={14} aria-hidden="true" /><Select key={history.map(item => item.id).join(',')} value={task?.id ?? ''} onValueChange={restoreHistory} disabled={!!busy}><SelectTrigger aria-label="最近的图片分析"><SelectValue placeholder="恢复最近分析" /></SelectTrigger><SelectContent portalContainer={dialogRef.current}>{history.map(item => <SelectItem key={item.id} value={item.id}>{item.imageName} · {item.mode === 'style' ? '风格' : '画面'} · {reverseStatusLabels[item.status]} · {new Date(item.createdAt).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</SelectItem>)}</SelectContent></Select></label>}
            {pendingHistoryId && <div className="reverse-rerun-confirm" role="alert"><p>切换分析记录会替换当前编辑的提示词。</p><button type="button" className="settings-command" onClick={() => setPendingHistoryId('')}>保留编辑</button><button type="button" className="settings-primary" onClick={() => restoreHistory(pendingHistoryId, true)}>切换记录</button></div>}
            {drafts[language] || task?.result ? <><textarea className="reverse-prompt" aria-label="编辑反推提示词" maxLength={10000} value={drafts[language]} disabled={active || !!busy} onChange={event => { setDrafts(previous => ({ ...previous, [language]: event.target.value })); setCopied(false); setSavedPromptId('') }} /><div className="reverse-result-meta"><span>{dirty ? '已编辑 · 当前语言的修改会保留' : task?.result ? '可直接编辑，应用前再核对一次' : '上次编辑已保留'} · {drafts[language].length} 字</span>{task?.result && <button type="button" disabled={active || !!busy} className="reverse-text-action" onClick={() => { setDrafts(previous => ({ ...previous, [language]: language === 'zh' ? task.result!.promptZh : task.result!.promptEn })); setCopied(false) }}><RotateCcw size={13} aria-hidden="true" />恢复分析结果</button>}</div></> : <div className="reverse-result-empty"><ScanText size={32} aria-hidden="true" /><strong>{active ? '正在读懂你的图片' : '让参考图变成创作起点'}</strong><p>{active ? '分析完成后，提示词和画面细节会显示在这里。关闭弹窗后任务仍会继续。' : '上传一张图片，提炼主体、光影与风格，得到可编辑的生图描述。'}</p></div>}
            {changed && <p className="reverse-changed" role="status">分析设置已更改，重新分析后再应用结果。</p>}
            {task?.errorMessage && <p className="settings-error" role="alert">{task.errorMessage}</p>}
            {task?.result && <details className="reverse-analysis"><summary>画面分析</summary><dl>{Object.entries(task.result.analysis).filter(([, value]) => value).map(([key, value]) => <div key={key}><dt>{analysisLabels[key as keyof typeof analysisLabels]}</dt><dd>{value}</dd></div>)}</dl>{task.result.uncertainties.length > 0 && <div className="reverse-uncertainties"><strong>需要核对</strong><ul>{task.result.uncertainties.map((value, index) => <li key={index}>{value}</li>)}</ul></div>}</details>}
            <p className="reverse-help">从可见画面提炼描述；原始提示词与生成参数无法仅凭图片准确恢复。</p>
          </section>
        </div>}
        <footer className="reverse-footer">{saving ? <><button type="button" className="settings-command" disabled={!!busy} onClick={() => setSaving(false)}>返回分析结果</button><button type="submit" form="reverse-save-form" className="settings-primary" disabled={!!busy || !title.trim() || !categoryId || !drafts[language].trim()}>{busy === 'save' && <LoaderCircle className="settings-spinner" size={16} aria-hidden="true" />}保存灵感草稿</button></> : <>
          <div className="reverse-apply-options"><label className="reverse-checkbox"><input type="checkbox" checked={includeReference} disabled={!ready || !!busy} onChange={event => setIncludeReference(event.target.checked)} />同时将原图作为生图参考</label>{request.currentPrompt?.trim() && <Select value={applyAction} onValueChange={value => setApplyAction(value as 'replace' | 'append')} disabled={!ready || !!busy}><SelectTrigger size="sm" aria-label="应用提示词的方式"><SelectValue /></SelectTrigger><SelectContent portalContainer={dialogRef.current}><SelectItem value="replace">替换现有描述</SelectItem><SelectItem value="append">追加到现有描述</SelectItem></SelectContent></Select>}</div>
          <div className="reverse-commands"><button type="button" className="settings-command" disabled={!ready || !!busy} onClick={() => void copy()}>{copied ? <Check size={15} aria-hidden="true" /> : <Copy size={15} aria-hidden="true" />}{copied ? '已复制' : '复制'}</button><SavePersonalPrompt portalContainer={dialogRef.current} disabled={!ready || !!busy} className="settings-command" seed={{ title: previewName ? `反推 · ${previewName}` : '图片反推', prompt: ready ? drafts[language] : '', source: `图片反推 · ${mode === 'style' ? '风格' : '画面'}` }} />{account.user?.role === 'admin' && <button type="button" className="settings-command" disabled={!ready || !!busy} onClick={() => void openSave()}>{busy === 'categories' && <LoaderCircle className="settings-spinner" size={15} aria-hidden="true" />}保存到灵感库</button>}<button type="button" className="settings-primary" disabled={!ready || !!busy} onClick={() => void apply()}>{busy === 'apply' && <LoaderCircle className="settings-spinner" size={15} aria-hidden="true" />}应用到生图<ArrowUpRight size={15} aria-hidden="true" /></button></div>
        </>}</footer>
      </>}
    </div>
  </dialog>
}
