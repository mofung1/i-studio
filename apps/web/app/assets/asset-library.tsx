'use client'

import { AlertTriangle, Archive, Check, Clock3, Columns2, Download, Folder, Image as ImageIcon, Loader2, Maximize2, Pencil, Plus, RefreshCw, Search, ScanText, SlidersHorizontal, Star, Trash2, X } from 'lucide-react'
import Link from 'next/link'
import Image from 'next/image'
import { useRouter, useSearchParams } from 'next/navigation'
import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

import { AuthenticatedImage, downloadProtectedAsset } from '@/components/authenticated-image'
import { AssetImageCover } from '@/components/asset-image-cover'
import { ConfirmDialog } from '@/components/confirm-dialog'
import { InfoDialog } from '@/components/info-dialog'
import { StudioShell } from '@/components/studio-shell'
import { SavePersonalPrompt } from '@/components/save-personal-prompt'
import { LibraryDialog, LibrarySelect } from '@/components/library-controls'
import { usePromptReverse } from '@/components/prompt-reverse-provider'
import { useDialogFocus } from '@/components/use-dialog-focus'
import { FailureNotice } from '@/components/workbench/failure-notice'
import { ImageLightbox } from '@/components/workbench/image-lightbox'
import { LazyImageComparison } from '@/components/image-comparison-button'
import { comparisonCandidates, comparisonReferences, type ComparisonImage } from '@/lib/image-comparison'
import { historyWorkbenchUrl, referenceWorkbenchUrl } from '@/components/workbench/use-workbench-handoff'
import { taskModeLabel, taskTitle, activeTaskStatuses, type HistoryTask } from '@/components/workbench/use-task-history'
import { deleteGeneratedAsset, deleteGenerationTask, getAccessToken } from '@/lib/api'
import { assetFilename, assetTitle, downloadLibraryAssets, libraryRequest, mergeLibraryPage, type LibraryAsset, type LibraryProject } from '@/lib/library'

const toolOptions: Array<[string, string]> = [['all', '全部工具'], ['general', 'AI 生图'], ['product-main', '商品主图'], ['detail-page', '商品详情'], ['viral-recreate', '爆款复刻'], ['product-retouch', '产品精修'], ['clothing-set', '服装组图']]
const statuses: Record<string, string> = { queued: '排队中', processing: '正在生成', waiting_provider: '等待 AI 服务', succeeded: '生成完成', failed: '生成失败', cancelled: '已取消', expired: '已过期' }
const when = (value: string) => new Date(value).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })

export function AssetLibrary({ view }: { view: 'images' | 'tasks' | 'uploads' }) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { openReverse } = usePromptReverse()
  const [projects, setProjects] = useState<LibraryProject[]>([])
  const [project, setProject] = useState(searchParams.get('project') || 'all')
  const [favorite, setFavorite] = useState(false)
  const [search, setSearch] = useState('')
  const [query, setQuery] = useState('')
  const [tool, setTool] = useState('all')
  const [model, setModel] = useState('')
  const [tag, setTag] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [sort, setSort] = useState('newest')
  const [density, setDensity] = useState<'comfortable' | 'compact'>('comfortable')
  const [assets, setAssets] = useState<LibraryAsset[]>([])
  const [tasks, setTasks] = useState<HistoryTask[]>([])
  const [total, setTotal] = useState(0)
  const [cursor, setCursor] = useState('')
  const [loading, setLoading] = useState(true)
  const [moreBusy, setMoreBusy] = useState(false)
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [selected, setSelected] = useState<string[]>([])
  const [preview, setPreview] = useState<LibraryAsset | null>(null)
  const [lightbox, setLightbox] = useState<LibraryAsset | null>(null)
  const [comparison, setComparison] = useState<ComparisonImage[] | null>(null)
  const [detailTask, setDetailTask] = useState<HistoryTask | null>(null)
  const [editing, setEditing] = useState<LibraryAsset | null>(null)
  const [titleDraft, setTitleDraft] = useState('')
  const [tagsDraft, setTagsDraft] = useState('')
  const [projectDraft, setProjectDraft] = useState('')
  const [projectForm, setProjectForm] = useState<LibraryProject | 'new' | null>(null)
  const [projectName, setProjectName] = useState('')
  const [moveOpen, setMoveOpen] = useState(false)
  const [moveProject, setMoveProject] = useState('unfiled')
  const [confirm, setConfirm] = useState<{ asset?: LibraryAsset; task?: HistoryTask; project?: LibraryProject } | null>(null)
  const epoch = useRef(0)

  useEffect(() => { const timer = window.setTimeout(() => setQuery(search.trim()), 250); return () => window.clearTimeout(timer) }, [search])
  const filters = new URLSearchParams({ limit: '40', sort })
  if (project !== 'all') filters.set('projectId', project)
  if (query) filters.set('q', query)
  if (model.trim()) filters.set('model', model.trim())
  if (from) filters.set('from', from)
  if (to) filters.set('to', to)
  if (tool !== 'all') filters.set('taskType', tool)
  if (view === 'uploads') filters.set('kind', 'uploads')
  if (favorite && view !== 'tasks') filters.set('favorite', 'true')
  if (tag.trim() && view !== 'tasks') filters.set('tag', tag.trim())
  const filterKey = `${view}:${filters}`
  const queryString = filters.toString()
  const currentFilter = useRef(filterKey)
  currentFilter.current = filterKey

  const loadProjects = useCallback(async () => {
    const data = await libraryRequest<{ projects: LibraryProject[] }>('projects')
    setProjects(data.projects)
  }, [])
  const load = useCallback(async (next = '', append = false, signal?: AbortSignal) => {
    const requestEpoch = epoch.current
    const requestFilter = `${view}:${queryString}`
    const params = new URLSearchParams(queryString)
    if (view === 'tasks' && params.get('taskType') === 'general') { params.delete('taskType'); params.set('mode', 'general') }
    if (next) params.set('cursor', next)
    try {
      const data = await libraryRequest<{ assets?: LibraryAsset[]; tasks?: HistoryTask[]; total: number; nextCursor: string }>(`${view === 'tasks' ? 'generation/tasks' : 'library/assets'}?${params}`, { signal })
      if (signal?.aborted || requestEpoch !== epoch.current || requestFilter !== currentFilter.current) return
      setAssets(previous => append ? mergeLibraryPage(previous, data.assets ?? []) : data.assets ?? [])
      setTasks(previous => append ? mergeLibraryPage(previous, data.tasks ?? []) : data.tasks ?? [])
      setTotal(data.total); setCursor(data.nextCursor); setError('')
    } catch (reason) {
      if (!signal?.aborted && requestEpoch === epoch.current && requestFilter === currentFilter.current) setError(reason instanceof Error ? reason.message : '加载失败')
    } finally { if (!signal?.aborted && requestEpoch === epoch.current && requestFilter === currentFilter.current) { setLoading(false); setMoreBusy(false) } }
  }, [queryString, view])
  const latestLoad = useRef(load)
  latestLoad.current = load
  useEffect(() => {
    if (!getAccessToken()) { router.replace(`/login?next=${encodeURIComponent(`/assets?view=${view}`)}`); return }
    epoch.current += 1
    const controller = new AbortController()
    setLoading(true); setAssets([]); setTasks([]); setSelected([]); setCursor(''); setTotal(0); setMoreBusy(false)
    void load('', false, controller.signal)
    return () => controller.abort()
  }, [filterKey, load, router, view])
  useEffect(() => { if (getAccessToken()) void loadProjects().catch(reason => setError(reason.message)) }, [loadProjects])
  useEffect(() => {
    const active = tasks.filter(item => activeTaskStatuses.has(item.status))
    if (!active.length) return
    const controller = new AbortController()
    const timer = window.setInterval(() => {
      void Promise.all(active.map(item => libraryRequest<{ task: HistoryTask }>(`generation/tasks/${item.id}`, { signal: controller.signal })))
        .then(results => { if (!controller.signal.aborted) setTasks(current => current.map(item => results.find(result => result.task.id === item.id)?.task ?? item)) })
        .catch(() => {})
    }, 5000)
    return () => { controller.abort(); window.clearInterval(timer) }
  }, [tasks])

  async function act(key: string, action: () => Promise<void>, success = '') {
    if (busy) return
    setBusy(key); setError(''); setNotice('')
    try { await action(); if (success) setNotice(success) }
    catch (reason) { setError(reason instanceof Error ? reason.message : '操作失败') }
    finally { setBusy('') }
  }
  async function editAssets(ids: string[], change: Record<string, unknown>) {
    await libraryRequest('library/assets', { method: 'PATCH', body: JSON.stringify({ ids, ...change }) })
    await latestLoad.current(); await loadProjects(); setSelected([])
  }
  function toggleSelect(id: string) { setSelected(previous => previous.includes(id) ? previous.filter(value => value !== id) : previous.length < 100 ? [...previous, id] : previous) }
  function compareSelected() {
    const chosen = selected.map(id => assets.find(item => item.id === id)).filter((item): item is LibraryAsset => !!item)
    if (chosen.length !== 2) return
    setComparison(comparisonCandidates([
      ...chosen.map(item => ({ path: item.contentPath, label: `${when(item.createdAt)} · ${assetTitle(item)}`, width: item.width, height: item.height })),
      ...chosen.flatMap(item => comparisonReferences(item.task?.input)),
      ...assets.map(item => ({ path: item.contentPath, label: `${when(item.createdAt)} · ${assetTitle(item)}`, width: item.width, height: item.height })),
    ]))
  }
  function openEdit(asset: LibraryAsset) { setError(''); setPreview(null); setEditing(asset); setTitleDraft(asset.title); setTagsDraft(asset.tags.join('、')); setProjectDraft(asset.projectId || 'unfiled') }
  async function saveMetadata() {
    await editAssets([editing!.id], { title: titleDraft, tags: tagsDraft.split(/[,，、\n]/), ...(projectDraft === (editing!.projectId || 'unfiled') ? {} : { projectId: projectDraft === 'unfiled' ? '' : projectDraft }) })
    setEditing(null)
  }
  async function saveProject() {
    await libraryRequest(projectForm === 'new' ? 'projects' : `projects/${(projectForm as LibraryProject).id}`, { method: projectForm === 'new' ? 'POST' : 'PATCH', body: JSON.stringify({ name: projectName }) })
    await loadProjects(); setProjectForm(null)
  }
  async function removeConfirmed() {
    if (confirm?.asset) await deleteGeneratedAsset(confirm.asset.contentPath)
    if (confirm?.task) await deleteGenerationTask(confirm.task.id)
    if (confirm?.project) { await libraryRequest(`projects/${confirm.project.id}`, { method: 'DELETE' }); if (project === confirm.project.id) setProject('all') }
    setConfirm(null); await load(); await loadProjects()
  }
  const currentProject = projects.find(item => item.id === project)
  const projectOptions: Array<[string, string]> = [['unfiled', '未分类'], ...projects.filter(item => !item.archived || item.id === editing?.projectId).map(item => [item.id, item.name] as [string, string])]
  const assetCount = view === 'tasks' ? tasks.length : assets.length
  return <StudioShell section={view === 'tasks' ? 'history' : 'assets'} title="我的资产" actions={<Link className="studio-primary" href={`/workbench?mode=general${currentProject && !currentProject.archived ? `&projectId=${encodeURIComponent(currentProject.id)}` : ''}`}><Plus size={16} />{currentProject && !currentProject.archived ? '在项目中创作' : '开始创作'}</Link>}>
    <main className="asset-manager">
      <div className="asset-manager-heading">
        <nav className="library-views" aria-label="资产库视图">
          <Link href="/assets" aria-current={view === 'images' ? 'page' : undefined}><ImageIcon size={16} />生成作品</Link>
          <Link href="/assets?view=uploads" aria-current={view === 'uploads' ? 'page' : undefined}><Folder size={16} />我的素材</Link>
          <Link href="/assets?view=tasks" aria-current={view === 'tasks' ? 'page' : undefined}><Clock3 size={16} />创作记录</Link>
        </nav>
        <span className="library-count">{loading ? '正在读取…' : `${total} ${view === 'tasks' ? '条记录' : '张图片'}`}</span>
      </div>
      <div className="asset-manager-layout">
        <aside className="asset-projects" aria-label="作品分类">
          <button className={project === 'all' && !favorite ? 'active' : ''} onClick={() => { setProject('all'); setFavorite(false) }}><ImageIcon size={16} />全部作品</button>
          {view !== 'tasks' && <button className={favorite ? 'active' : ''} onClick={() => { setFavorite(!favorite); setProject('all') }}><Star size={16} />我的收藏</button>}
          <button className={project === 'unfiled' ? 'active' : ''} onClick={() => { setProject('unfiled'); setFavorite(false) }}><Folder size={16} />未分类</button>
          <div className="asset-projects-title"><span>项目</span><button aria-label="新建项目" onClick={() => { setProjectForm('new'); setProjectName('') }}><Plus size={16} /></button></div>
          {projects.filter(item => !item.archived).map(item => <button key={item.id} className={project === item.id ? 'active' : ''} onClick={() => { setProject(item.id); setFavorite(false) }}><Folder size={15} /><span>{item.name}</span><small>{item.assetCount ?? 0}</small></button>)}
          {projects.some(item => item.archived) && <details><summary><Archive size={14} />已归档项目</summary>{projects.filter(item => item.archived).map(item => <button key={item.id} className={project === item.id ? 'active' : ''} onClick={() => setProject(item.id)}><Folder size={14} /><span>{item.name}</span></button>)}</details>}
        </aside>
        <section className="asset-manager-results" aria-label="作品列表">
          <div className="library-toolbar">
            <label className="library-search"><Search size={17} aria-hidden="true" /><input type="search" aria-label="搜索作品" placeholder="搜索名称、提示词或标签" value={search} onChange={event => setSearch(event.target.value)} /></label>
            {view !== 'uploads' && <LibrarySelect label="筛选工具" value={tool} options={toolOptions} onChange={setTool} />}
            <LibrarySelect label="作品排序" value={sort} options={[["newest", "最新优先"], ["oldest", "最早优先"]]} onChange={setSort} />
            <button className="library-command" aria-label="刷新作品" title="刷新" disabled={loading || !!busy} onClick={() => { setLoading(true); void load() }}><RefreshCw size={16} /></button>
          </div>
          <div className="library-filter-row">
            <details className="library-advanced"><summary><SlidersHorizontal size={14} />更多筛选{(model || tag || from || to) && <span>已设置</span>}</summary><div>
              {view !== 'uploads' && <label>模型<input aria-label="筛选模型" placeholder="输入模型名称" value={model} onChange={event => setModel(event.target.value)} /></label>}
              {view !== 'tasks' && <label>标签<input aria-label="筛选标签" placeholder="输入完整标签" value={tag} onChange={event => setTag(event.target.value)} /></label>}
              <label>开始日期<input type="date" aria-label="开始日期" value={from} max={to || undefined} onChange={event => setFrom(event.target.value)} /></label>
              <label>结束日期<input type="date" aria-label="结束日期" value={to} min={from || undefined} onChange={event => setTo(event.target.value)} /></label>
              <button className="library-command" onClick={() => { setModel(''); setTag(''); setFrom(''); setTo('') }}>清除筛选</button>
            </div></details>
            {view !== 'tasks' && <button className="library-density" onClick={() => setDensity(density === 'comfortable' ? 'compact' : 'comfortable')}>{density === 'comfortable' ? '紧凑视图' : '舒适视图'}</button>}
          </div>
          {currentProject && <div className="library-project-heading"><strong>{currentProject.name}{currentProject.archived && <small>已归档</small>}</strong><div>
            <button className="library-command" onClick={() => { setProjectForm(currentProject); setProjectName(currentProject.name) }}><Pencil size={14} />改名</button>
            <button className="library-command" disabled={!!busy} onClick={() => void act('archive', async () => { await libraryRequest(`projects/${currentProject.id}`, { method: 'PATCH', body: JSON.stringify({ archived: !currentProject.archived }) }); await loadProjects() }, currentProject.archived ? '项目已恢复' : '项目已归档')}><Archive size={14} />{currentProject.archived ? '恢复' : '归档'}</button>
            <button className="library-command" onClick={() => setConfirm({ project: currentProject })}>移除项目</button>
          </div></div>}
          {error && <div className="library-feedback is-error" role="alert">{error}<button onClick={() => void load()}>重试</button></div>}
          {notice && <p className="library-feedback" role="status">{notice}</p>}
          {selected.length > 0 && <div className="library-selection" role="toolbar" aria-label="批量操作">
            <strong>已选 {selected.length} 张</strong>
            <button disabled={selected.length !== 2} title="选择两张图片进行对比" onClick={compareSelected}><Columns2 size={15} />图片对比</button>
            <button disabled={!!busy} onClick={() => void act('download', () => downloadLibraryAssets(selected))}><Download size={15} />打包下载</button>
            <button disabled={!!busy} onClick={() => { setMoveOpen(true); setMoveProject('unfiled') }}><Folder size={15} />移动到项目</button>
            <button disabled={!!busy} onClick={() => void act('favorite', () => editAssets(selected, { favorite: true }), '已加入收藏')}><Star size={15} />收藏</button>
            <button onClick={() => setSelected(assets.slice(0, 100).map(item => item.id))}>选择已加载</button>
            <button aria-label="取消选择" onClick={() => setSelected([])}><X size={16} /></button>
          </div>}
          {loading ? <div className={`asset-grid is-${density}`} aria-label="正在加载资产">{Array.from({ length: 8 }, (_, i) => <div key={i} className="asset-card is-skeleton" aria-hidden="true"><div className="asset-cover auth-image-loading" /><div className="asset-card-copy"><span className="skeleton-line" /></div></div>)}</div> : view !== 'tasks' ? <div className={`asset-grid is-${density}`}>
            {assets.map(asset => <article className={`asset-card${selected.includes(asset.id) ? ' is-selected' : ''}`} key={asset.id}>
              <AssetImageCover path={asset.thumbnailPath} alt={assetTitle(asset)} onOpen={() => setPreview(asset)} />
              <label className="asset-checkbox"><input type="checkbox" aria-label={`选择 ${assetTitle(asset)}`} checked={selected.includes(asset.id)} onChange={() => toggleSelect(asset.id)} /><Check size={13} aria-hidden="true" /></label>
              <button className={`asset-star${asset.favorite ? ' is-favorite' : ''}`} aria-label={asset.favorite ? `取消收藏 ${assetTitle(asset)}` : `收藏 ${assetTitle(asset)}`} aria-pressed={asset.favorite} disabled={!!busy} onClick={() => void act(asset.id, () => editAssets([asset.id], { favorite: !asset.favorite }))}><Star size={16} fill={asset.favorite ? 'currentColor' : 'none'} /></button>
              <div className="asset-card-copy"><strong title={assetTitle(asset)}>{assetTitle(asset)}</strong><span>{asset.projectName || (asset.task ? taskModeLabel(asset.task.input) : '我的素材')} · {when(asset.createdAt)}</span>{asset.tags.length > 0 && <div className="asset-tags">{asset.tags.map(value => <button key={value} onClick={() => setTag(value)}>{value}</button>)}</div>}</div>
              <div className="asset-card-actions"><button onClick={() => openEdit(asset)}><Pencil size={14} />整理</button><button aria-label={`下载 ${assetTitle(asset)}`} onClick={() => void act('download', () => downloadProtectedAsset(asset.contentPath, assetFilename(asset)))}><Download size={15} /></button><button aria-label={`删除 ${assetTitle(asset)}`} onClick={() => setConfirm({ asset })}><Trash2 size={15} /></button></div>
            </article>)}
          </div> : <div className={`asset-grid is-${density}`}>{tasks.map(task => <article className="asset-card" key={task.id}>
            {task.resultImages?.length ? <AssetImageCover path={(task.resultImages[0] ?? '').replace(/\/content$/, '/thumbnail')} alt={taskTitle(task.input)} onOpen={() => setDetailTask(task)}><span className="asset-task-badge">{task.resultImages.length} 张 · {statuses[task.status] ?? task.status}</span></AssetImageCover> : task.status === 'failed' ? <button className="asset-cover is-failed" onClick={() => setDetailTask(task)}><Image src="/images/generation-failed.png" alt="生成失败，查看原因" fill sizes="(max-width: 700px) 45vw, (max-width: 1100px) 30vw, 320px" /><span className="asset-task-badge"><AlertTriangle size={14} />生成失败 · 查看原因</span></button> : <div className="asset-cover is-empty"><Loader2 size={20} className={activeTaskStatuses.has(task.status) ? 'animate-spin' : ''} /><span>{statuses[task.status]}</span></div>}
            <div className="asset-card-copy"><strong>{taskTitle(task.input)}</strong><span>{taskModeLabel(task.input)} · {when(task.createdAt)}</span></div>
            <div className="asset-card-actions"><Link href={historyWorkbenchUrl(task)}>继续创作</Link><button onClick={() => setDetailTask(task)} aria-label="查看任务参数"><SlidersHorizontal size={15} /></button><button disabled={activeTaskStatuses.has(task.status)} onClick={() => setConfirm({ task })} aria-label="删除任务记录"><Trash2 size={15} /></button></div>
          </article>)}</div>}
          {!loading && assetCount === 0 && !error && <div className="library-empty-state"><Folder size={32} /><strong>{query || tool !== 'all' || tag || favorite || project !== 'all' ? '没有匹配的作品' : view === 'uploads' ? '上传的参考素材会保存在这里' : '从第一张图片开始'}</strong><p>可以调整筛选条件，或开始一次新的创作。</p><Link className="studio-primary" href="/workbench?mode=general">开始创作</Link></div>}
          {!loading && cursor && <button className="library-load-more" disabled={moreBusy} onClick={() => { setMoreBusy(true); void load(cursor, true) }}>{moreBusy ? '正在加载…' : '加载更多'}</button>}
          {!loading && assetCount > 0 && <p className="library-end-note">已加载 {assetCount} / {total} {view === 'tasks' ? '条记录' : '张图片'}</p>}
        </section>
      </div>
    </main>
    {preview && <AssetPreview asset={preview} onClose={() => setPreview(null)} onEdit={() => openEdit(preview)} onZoom={() => { setLightbox(preview); setPreview(null) }} onReverse={() => { const asset = preview; setPreview(null); openReverse({ assetId: asset.id, imageName: assetTitle(asset) }) }} />}
    {lightbox && <ImageLightbox path={lightbox.contentPath} alt={assetTitle(lightbox)} filename={assetFilename(lightbox)} onClose={() => setLightbox(null)} />}
    {editing && <LibraryDialog title="整理图片" onClose={() => { if (!busy) setEditing(null) }}><form onSubmit={event => { event.preventDefault(); void act('metadata', saveMetadata, '图片信息已保存') }}>
      <label>作品名称<input aria-label="作品名称" value={titleDraft} maxLength={160} placeholder={assetTitle(editing)} onChange={event => setTitleDraft(event.target.value)} disabled={!!busy} /></label>
      <label>标签<input aria-label="作品标签" value={tagsDraft} maxLength={400} placeholder="用逗号分隔，例如：产品、夏季" onChange={event => setTagsDraft(event.target.value)} disabled={!!busy} /><small>最多 12 个标签，每个 32 字</small></label>
      <label>所属项目<LibrarySelect label="所属项目" value={projectDraft} onChange={setProjectDraft} disabled={!!busy} options={projectOptions} /></label>
      {error && <p role="alert" className="settings-error">{error}</p>}<div className="library-form-actions"><button className="studio-secondary" type="button" disabled={!!busy} onClick={() => setEditing(null)}>取消</button><button className="studio-primary" disabled={!!busy}>{busy === 'metadata' ? '保存中…' : '保存'}</button></div>
    </form></LibraryDialog>}
    {projectForm && <LibraryDialog title={projectForm === 'new' ? '新建项目' : '项目改名'} onClose={() => { if (!busy) setProjectForm(null) }}><form onSubmit={event => { event.preventDefault(); void act('project', saveProject, '项目已保存') }}><label>项目名称<input autoFocus aria-label="项目名称" required maxLength={80} value={projectName} onChange={event => setProjectName(event.target.value)} disabled={!!busy} /></label>{error && <p role="alert" className="settings-error">{error}</p>}<div className="library-form-actions"><button className="studio-secondary" type="button" disabled={!!busy} onClick={() => setProjectForm(null)}>取消</button><button className="studio-primary" disabled={!!busy || !projectName.trim()}>保存项目</button></div></form></LibraryDialog>}
    {moveOpen && <LibraryDialog title={`移动 ${selected.length} 张图片`} onClose={() => { if (!busy) setMoveOpen(false) }}><form onSubmit={event => { event.preventDefault(); void act('move', async () => { await editAssets(selected, { projectId: moveProject === 'unfiled' ? '' : moveProject }); setMoveOpen(false) }, '图片已移动') }}><label>目标项目<LibrarySelect label="目标项目" value={moveProject} onChange={setMoveProject} disabled={!!busy} options={projectOptions.filter(([id]) => !projects.find(item => item.id === id)?.archived)} /></label>{error && <p role="alert" className="settings-error">{error}</p>}<div className="library-form-actions"><button className="studio-secondary" type="button" disabled={!!busy} onClick={() => setMoveOpen(false)}>取消</button><button className="studio-primary" disabled={!!busy}>确认移动</button></div></form></LibraryDialog>}
    {confirm && <ConfirmDialog title={confirm.project ? '移除这个项目？' : confirm.task ? '删除这条创作记录？' : '删除这张图片？'} description={confirm.project?.name || (confirm.task ? taskTitle(confirm.task.input) : assetTitle(confirm.asset!))} detail={confirm.project ? '项目中的图片和记录会保留，并回到未分类。' : '图片将从资产列表和生成结果中移除。历史创作使用过的原图会保留，以便恢复配置；生成中的素材暂不能删除。'} confirmLabel={confirm.project ? '移除项目' : '删除'} busy={!!busy} error={error} onCancel={() => setConfirm(null)} onConfirm={() => void act('delete', removeConfirmed, '已完成')} />}
    {detailTask && <InfoDialog title="创作记录" subtitle={`${taskModeLabel(detailTask.input)} · ${when(detailTask.createdAt)}`} onClose={() => setDetailTask(null)} hideActions>{detailTask.errorMessage && <FailureNotice message={detailTask.errorMessage} compact />}<p className="library-task-prompt">{detailTask.input.prompt || detailTask.input.requirements || '未填写补充描述'}</p><dl className="library-parameters"><div><dt>模型</dt><dd>{detailTask.input.model}</dd></div><div><dt>比例 / 清晰度</dt><dd>{detailTask.input.aspectRatio} · {detailTask.input.resolution}</dd></div></dl><div className="library-form-actions"><Link className="studio-primary" href={historyWorkbenchUrl(detailTask)}>载入配置继续创作</Link></div></InfoDialog>}
    {comparison && <LazyImageComparison candidates={comparison} initialLeft={comparison[0]?.path} initialRight={comparison[1]?.path} onClose={() => setComparison(null)} />}
  </StudioShell>
}

function AssetPreview({ asset, onClose, onEdit, onZoom, onReverse }: { asset: LibraryAsset; onClose: () => void; onEdit: () => void; onZoom: () => void; onReverse: () => void }) {
  const panel = useRef<HTMLDivElement>(null)
  useDialogFocus(panel, onClose)
  const reference = referenceWorkbenchUrl(asset.contentPath, 'general', 'product-main')
  return createPortal(<div className="dialog-backdrop asset-preview-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) onClose() }}><div className="asset-preview" ref={panel} role="dialog" aria-modal="true" aria-label="作品预览"><header><strong>{assetTitle(asset)}</strong><button aria-label="关闭作品预览" onClick={onClose}><X size={20} /></button></header><div className="asset-preview-body"><div className="asset-preview-image"><AuthenticatedImage path={asset.contentPath} alt={assetTitle(asset)} /><button className="asset-preview-zoom" onClick={onZoom}><Maximize2 size={16} />放大 / 裁剪</button></div><aside><p className="library-count">{asset.projectName || '未分类'} · {when(asset.createdAt)}</p><dl className="library-parameters"><div><dt>尺寸</dt><dd>{asset.width} × {asset.height}</dd></div><div><dt>文件</dt><dd>{(asset.sizeBytes / 1024 / 1024).toFixed(2)} MB</dd></div>{asset.task && <div><dt>模型</dt><dd>{asset.task.input.model}</dd></div>}</dl>{asset.task && <p className="asset-preview-prompt">{asset.task.input.prompt || asset.task.input.requirements || '未填写补充描述'}</p>}<div className="asset-tags">{asset.tags.map(tag => <span key={tag}>{tag}</span>)}</div><div className="asset-preview-actions">{asset.task && <SavePersonalPrompt seed={{ title: assetTitle(asset), prompt: asset.task.input.prompt || asset.task.input.requirements || '', source: '生成作品' }} />}<button className="studio-secondary" onClick={onEdit}><Pencil size={15} />编辑名称与标签</button><button className="studio-secondary" onClick={onReverse}><ScanText size={15} />图片反推</button>{reference && <Link className="studio-secondary" href={reference}>用作参考图</Link>}{asset.task && <Link className="studio-primary" href={historyWorkbenchUrl(asset.task)}>继续创作</Link>}</div></aside></div></div></div>, document.body)
}
