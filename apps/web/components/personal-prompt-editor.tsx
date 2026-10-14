'use client'

import { useEffect, useState } from 'react'
import { LibraryDialog } from './library-controls'
import { libraryRequest } from '@/lib/library'
import { presetDescription, type CreationPreset, type PersonalPrompt, type PromptVersion } from '@/lib/personal-prompts'
import { styleOptions } from './workbench/shared'
import { clothingStyles } from '@/lib/clothing'

export interface PersonalPromptSeed { title?: string; prompt: string; source?: string; config?: CreationPreset; favorite?: boolean }
export function PersonalPromptEditor({ item, seed, categories = [], onClose, onSaved, portalContainer }: {
  portalContainer?: HTMLElement | null; item?: PersonalPrompt; seed?: PersonalPromptSeed; categories?: string[]; onClose: () => void; onSaved: (item: PersonalPrompt) => void
}) {
  const kind = item?.kind ?? (seed?.config ? 'preset' : 'prompt')
  const [title, setTitle] = useState((item?.title ?? seed?.title ?? '').slice(0, 160))
  const [category, setCategory] = useState(item?.category ?? '')
  const [prompt, setPrompt] = useState(item?.prompt ?? seed?.prompt ?? '')
  const [tags, setTags] = useState(item?.tags.join('、') ?? '')
  const [favorite, setFavorite] = useState(item?.favorite ?? seed?.favorite ?? false)
  const [config, setConfig] = useState(item?.config ?? seed?.config ?? {})
  const [newCategory, setNewCategory] = useState(false)
  const [versions, setVersions] = useState<PromptVersion[] | null>(null)
  const [nextBefore, setNextBefore] = useState(0)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [discard, setDiscard] = useState(false)
  const [endpoints, setEndpoints] = useState<Array<{ id: string; name: string; model: string }>>([])
  const [storedCategories, setStoredCategories] = useState<string[]>([])
  useEffect(() => {
    const controller = new AbortController()
    void libraryRequest<{ categories: string[] }>(`personal/prompts?kind=${kind}&limit=1`, { signal: controller.signal })
      .then(data => { if (!controller.signal.aborted) setStoredCategories(data.categories) })
      .catch(() => { /* New categories can still be entered when this lookup fails. */ })
    return () => controller.abort()
  }, [kind])
  useEffect(() => {
    if (kind !== 'preset') return
    const controller = new AbortController()
    void libraryRequest<{ imageEndpoints?: Array<{ id: string; name: string; model: string }> }>('generation/capabilities', { signal: controller.signal })
      .then(data => { if (!controller.signal.aborted) setEndpoints(data.imageEndpoints ?? []) })
      .catch(() => { /* The saved model stays visible if capabilities cannot be read. */ })
    return () => controller.abort()
  }, [kind])
  const original = JSON.stringify([(item?.title ?? seed?.title ?? '').slice(0, 160), item?.category ?? '', item?.prompt ?? seed?.prompt ?? '', item?.tags.join('、') ?? '', item?.config ?? seed?.config ?? {}, item?.favorite ?? seed?.favorite ?? false])
  const dirty = JSON.stringify([title, category, prompt, tags, config, favorite]) !== original
  function close() { if (busy) return; if (dirty) setDiscard(true); else onClose() }
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => { if (dirty || busy) event.preventDefault() }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [dirty, busy])
  async function save() {
    if (busy) return
    setBusy(true); setError('')
    try {
      const data = await libraryRequest<{ item: PersonalPrompt }>(`personal/prompts${item ? `/${item.id}` : ''}`, { method: item ? 'PUT' : 'POST', body: JSON.stringify({ kind, title, category, prompt, tags: tags.split(/[,，、\n]/), ...(!item || favorite !== item.favorite ? { favorite } : {}), config, source: item?.source ?? seed?.source ?? '', ...(item ? { version: item.version } : {}) }) })
      onSaved(data.item)
    } catch (reason) { setError(reason instanceof Error ? reason.message : '保存失败') }
    finally { setBusy(false) }
  }
  async function loadVersions(before = 0) {
    if (!item || busy) return
    setBusy(true); setError('')
    try { const data = await libraryRequest<{ versions: PromptVersion[]; nextBefore: number }>(`personal/prompts/${item.id}/versions${before ? `?before=${before}` : ''}`); setVersions(previous => before ? [...previous ?? [], ...data.versions] : data.versions); setNextBefore(data.nextBefore) }
    catch (reason) { setError(reason instanceof Error ? reason.message : '版本读取失败') }
    finally { setBusy(false) }
  }
  const knownCategories = [...new Set([...categories, ...storedCategories, item?.category ?? ''].filter(Boolean))]
  const selectedEndpoint = endpoints.find(endpoint => endpoint.id === config.endpointId && endpoint.model === config.model) ?? endpoints.find(endpoint => endpoint.model === config.model)
  return <LibraryDialog title={item ? `编辑${kind === 'preset' ? '创作预设' : '私有提示词'}` : `保存${kind === 'preset' ? '创作预设' : '私有提示词'}`} onClose={close} portalContainer={portalContainer}>
    <form onSubmit={event => { event.preventDefault(); void save() }}>
      <label>名称<input aria-label="提示词名称" autoFocus required maxLength={160} value={title} disabled={busy} onChange={event => setTitle(event.target.value)} placeholder="给这次创作起个名字" /></label>
      <label>分类<select aria-label="私有提示词分类" disabled={busy} value={newCategory ? 'new' : category ? `c:${category}` : 'none'} onChange={event => { if (event.target.value === 'new') { setNewCategory(true); setCategory('') } else { setNewCategory(false); setCategory(event.target.value === 'none' ? '' : event.target.value.slice(2)) } }}><option value="none">未分类</option>{knownCategories.map(value => <option key={value} value={`c:${value}`}>{value}</option>)}<option value="new">新增分类…</option></select>{newCategory && <input aria-label="新分类名称" maxLength={80} value={category} disabled={busy} onChange={event => setCategory(event.target.value)} placeholder="输入新分类名称" />}</label>
      <label>提示词<textarea aria-label="私有提示词内容" required={kind === 'prompt'} rows={6} maxLength={10000} value={prompt} disabled={busy} onChange={event => setPrompt(event.target.value)} /><small>可以使用 {'{{产品名称}}'} 等变量，应用时填写。</small></label>
      {kind === 'preset' && <>
        <p className="personal-preset-summary">{presetDescription(config)}<small>保存创作参数，原图与参考素材在使用时另行选择。</small></p>
        <details className="personal-preset-fields"><summary>编辑创作参数</summary><div>
          <label>模型<select aria-label="预设模型" disabled={busy} value={selectedEndpoint?.id ?? 'saved'} onChange={event => { const endpoint = endpoints.find(item => item.id === event.target.value); if (endpoint) setConfig(previous => ({ ...previous, endpointId: endpoint.id, model: endpoint.model })) }}>{!selectedEndpoint && <option value="saved">{config.model || '已保存模型'}</option>}{endpoints.map(endpoint => <option key={endpoint.id} value={endpoint.id}>{endpoint.name}</option>)}</select></label>
          <label>画面比例<select aria-label="预设画面比例" disabled={busy} value={config.aspectRatio} onChange={event => setConfig(previous => ({ ...previous, aspectRatio: event.target.value as CreationPreset['aspectRatio'] }))}>{['1:1', '3:4', '4:3', '9:16', '16:9'].map(value => <option key={value} value={value}>{value}</option>)}</select></label>
          <label>清晰度<select aria-label="预设清晰度" disabled={busy} value={config.resolution} onChange={event => setConfig(previous => ({ ...previous, resolution: event.target.value as CreationPreset['resolution'] }))}>{['1K', '2K', '4K'].map(value => <option key={value} value={value}>{value}</option>)}</select></label>
          {config.mode === 'general' && <><label>生成张数<input aria-label="预设生成张数" type="number" required min={1} max={4} step={1} disabled={busy} value={config.count} onChange={event => setConfig(previous => ({ ...previous, count: event.target.valueAsNumber }))} /></label><label>风格<select aria-label="预设风格" disabled={busy} value={config.style ?? 'unspecified'} onChange={event => setConfig(previous => ({ ...previous, style: event.target.value as CreationPreset['style'] }))}>{styleOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label></>}
          {config.taskType === 'clothing-set' && <label>拍摄风格<select aria-label="预设拍摄风格" disabled={busy} value={config.clothingStyle ?? 'studio'} onChange={event => setConfig(previous => ({ ...previous, clothingStyle: event.target.value as CreationPreset['clothingStyle'] }))}>{clothingStyles.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>}
        </div><small>电商图种和素材可在工作台中继续调整。</small></details>
      </>}
      <label>标签<input aria-label="提示词标签" maxLength={400} value={tags} disabled={busy} onChange={event => setTags(event.target.value)} placeholder="用逗号分隔标签" /></label>
      <label className="personal-checkbox"><input type="checkbox" checked={favorite} disabled={busy} onChange={event => setFavorite(event.target.checked)} />加入收藏</label>
      {item && <button className="library-command" type="button" disabled={busy} onClick={() => void loadVersions()}>版本记录 · 当前 v{item.version}</button>}
      {versions && <div className="personal-versions">{versions.map(version => <div key={version.version}><span>v{version.version} · {new Date(version.createdAt).toLocaleString('zh-CN')}</span><p>{version.snapshot.prompt || presetDescription(version.snapshot.config)}</p><button type="button" className="library-command" disabled={busy} onClick={() => { const previous = version.snapshot; setTitle(previous.title); setCategory(previous.category); setNewCategory(!knownCategories.includes(previous.category)); setPrompt(previous.prompt); setTags(previous.tags.join('、')); setConfig(previous.config); setVersions(null) }}>载入此版本</button></div>)}{nextBefore > 0 && <button className="library-command" type="button" disabled={busy} onClick={() => void loadVersions(nextBefore)}>更早版本</button>}<small>载入后点击保存，会创建新版本。</small></div>}
      {error && <p role="alert" className="settings-error">{error}</p>}
      {discard && <div className="personal-discard" role="alert"><p>有尚未保存的修改。</p><button type="button" className="library-command" onClick={() => setDiscard(false)}>继续编辑</button><button type="button" className="library-command" onClick={onClose}>放弃修改</button></div>}
      <div className="library-form-actions"><button type="button" className="studio-secondary" disabled={busy} onClick={close}>取消</button><button className="studio-primary" disabled={busy || !title.trim() || (kind === 'prompt' && !prompt.trim())}>{busy ? '保存中…' : '保存到我的提示词'}</button></div>
    </form>
  </LibraryDialog>
}
