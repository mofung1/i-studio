'use client'

import {
  Archive,
  Clock3,
  Folder,
  Image as ImageIcon,
  ListChecks,
  Pencil,
  Plus,
  RefreshCw,
  Search,
} from 'lucide-react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { useCallback, useEffect, useRef, useState } from 'react'

import { downloadProtectedAsset } from '@/components/authenticated-image'
import { AccountBoundary } from '@/components/account-access'
import { AssetGrid } from '@/components/assets/asset-grid'
import { AssetSelectionToolbar } from '@/components/assets/asset-selection-toolbar'
import { AssetAdvancedFilters } from '@/components/assets/asset-advanced-filters'
import { AssetProjectDialog } from '@/components/assets/asset-project-dialog'
import { FavoriteStar } from '@/components/favorite-star'
import { TaskGrid } from '@/components/assets/task-grid'
import { AssetPreview } from '@/components/assets/asset-preview'
import { ConfirmDialog } from '@/components/confirm-dialog'
import { InfoDialog } from '@/components/info-dialog'
import { StudioShell } from '@/components/studio-shell'
import { LibraryDialog, LibrarySelect } from '@/components/library-controls'
import { usePromptReverse } from '@/components/prompt-reverse-provider'
import { FailureNotice } from '@/components/workbench/failure-notice'
import { ImageLightbox } from '@/components/workbench/image-lightbox'
import { LazyImageComparison } from '@/components/image-comparison-button'
import {
  comparisonCandidates,
  comparisonReferences,
  type ComparisonImage,
} from '@/lib/image-comparison'
import { historyWorkbenchUrl } from '@/components/workbench/use-workbench-handoff'
import {
  taskModeLabel,
  taskTitle,
  activeTaskStatuses,
  type HistoryTask,
} from '@/components/workbench/use-task-history'
import { deleteGeneratedAsset, deleteGenerationTask, getAccessToken } from '@/lib/api'
import {
  assetFilename,
  assetTitle,
  formatLibraryDate,
  downloadLibraryAssets,
  libraryRequest,
  mergeLibraryPage,
  type LibraryAsset,
  type LibraryProject,
} from '@/lib/library'

const toolOptions: Array<[string, string]> = [
  ['all', '全部工具'],
  ['general', 'AI 生图'],
  ['product-main', '商品主图'],
  ['detail-page', '商品详情'],
  ['viral-recreate', '爆款复刻'],
  ['product-retouch', '产品精修'],
  ['clothing-set', '服装组图'],
]

export function AssetLibrary({ view }: { view: 'images' | 'tasks' | 'uploads' }) {
  return (
    <AccountBoundary
      section="assets"
      title="我的资产"
      description="登录后查看生成作品、上传素材和创作记录，继续管理你的图片。"
      returnTo={`/assets?view=${view}`}
    >
      <AssetLibraryContent view={view} />
    </AccountBoundary>
  )
}

function AssetLibraryContent({ view }: { view: 'images' | 'tasks' | 'uploads' }) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { openReverse } = usePromptReverse()
  const [projects, setProjects] = useState<LibraryProject[]>([])
  const [project, setProject] = useState(searchParams.get('project') || 'all')
  const [favorite, setFavorite] = useState(false)
  const [search, setSearch] = useState('')
  const [query, setQuery] = useState('')
  const [tool, setTool] = useState('all')
  const [tag, setTag] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [sort, setSort] = useState('newest')
  const [density, setDensity] = useState<'comfortable' | 'compact'>('compact')
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
  const [batchMode, setBatchMode] = useState(false)
  const [preview, setPreview] = useState<LibraryAsset | null>(null)
  const [lightbox, setLightbox] = useState<LibraryAsset | null>(null)
  const [comparison, setComparison] = useState<{
    candidates: ComparisonImage[]
    initialLeft: string
    initialRight?: string
    projectId?: string
  } | null>(null)
  const [detailTask, setDetailTask] = useState<HistoryTask | null>(null)
  const [editing, setEditing] = useState<LibraryAsset | null>(null)
  const [titleDraft, setTitleDraft] = useState('')
  const [tagsDraft, setTagsDraft] = useState('')
  const [projectDraft, setProjectDraft] = useState('')
  const [projectForm, setProjectForm] = useState<LibraryProject | 'new' | null>(null)
  const [projectName, setProjectName] = useState('')
  const [moveAssets, setMoveAssets] = useState<LibraryAsset[] | null>(null)
  const [confirm, setConfirm] = useState<{
    asset?: LibraryAsset
    task?: HistoryTask
    project?: LibraryProject
  } | null>(null)
  const epoch = useRef(0)
  const recordsRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const timer = window.setTimeout(() => setQuery(search.trim()), 250)
    return () => window.clearTimeout(timer)
  }, [search])
  const filters = new URLSearchParams({ limit: '40', sort })
  if (project !== 'all') filters.set('projectId', project)
  if (query) filters.set('q', query)
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
  const load = useCallback(
    async (next = '', append = false, signal?: AbortSignal) => {
      const requestEpoch = epoch.current
      const requestFilter = `${view}:${queryString}`
      const params = new URLSearchParams(queryString)
      if (view === 'tasks' && params.get('taskType') === 'general') {
        params.delete('taskType')
        params.set('mode', 'general')
      }
      if (next) params.set('cursor', next)
      try {
        const data = await libraryRequest<{
          assets?: LibraryAsset[]
          tasks?: HistoryTask[]
          total: number
          nextCursor: string
        }>(`${view === 'tasks' ? 'generation/tasks' : 'library/assets'}?${params}`, { signal })
        if (
          signal?.aborted ||
          requestEpoch !== epoch.current ||
          requestFilter !== currentFilter.current
        )
          return
        setAssets((previous) =>
          append ? mergeLibraryPage(previous, data.assets ?? []) : (data.assets ?? []),
        )
        if (!append)
          setSelected((previous) =>
            previous.filter((id) => data.assets?.some((item) => item.id === id)),
          )
        setTasks((previous) =>
          append ? mergeLibraryPage(previous, data.tasks ?? []) : (data.tasks ?? []),
        )
        setTotal(data.total)
        setCursor(data.nextCursor)
        setError('')
      } catch (reason) {
        if (
          !signal?.aborted &&
          requestEpoch === epoch.current &&
          requestFilter === currentFilter.current
        )
          setError(reason instanceof Error ? reason.message : '加载失败')
      } finally {
        if (
          !signal?.aborted &&
          requestEpoch === epoch.current &&
          requestFilter === currentFilter.current
        ) {
          setLoading(false)
          setMoreBusy(false)
        }
      }
    },
    [queryString, view],
  )
  const latestLoad = useRef(load)
  latestLoad.current = load
  useEffect(() => {
    if (!getAccessToken()) {
      router.replace(`/login?next=${encodeURIComponent(`/assets?view=${view}`)}`)
      return
    }
    epoch.current += 1
    const controller = new AbortController()
    setLoading(true)
    setAssets([])
    setTasks([])
    setSelected([])
    setBatchMode(false)
    setCursor('')
    setTotal(0)
    setMoreBusy(false)
    if (recordsRef.current) recordsRef.current.scrollTop = 0
    void load('', false, controller.signal)
    return () => controller.abort()
  }, [filterKey, load, router, view])
  useEffect(() => {
    if (getAccessToken()) void loadProjects().catch((reason) => setError(reason.message))
  }, [loadProjects])
  useEffect(() => {
    const active = tasks.filter((item) => activeTaskStatuses.has(item.status))
    if (!active.length) return
    const controller = new AbortController()
    const timer = window.setInterval(() => {
      void Promise.all(
        active.map((item) =>
          libraryRequest<{ task: HistoryTask }>(`generation/tasks/${item.id}`, {
            signal: controller.signal,
          }),
        ),
      )
        .then((results) => {
          if (!controller.signal.aborted)
            setTasks((current) =>
              current.map(
                (item) => results.find((result) => result.task.id === item.id)?.task ?? item,
              ),
            )
        })
        .catch(() => {})
    }, 5000)
    return () => {
      controller.abort()
      window.clearInterval(timer)
    }
  }, [tasks])

  useEffect(() => {
    if (!batchMode || busy) return
    function clearOnEscape(event: KeyboardEvent) {
      if (
        event.key !== 'Escape' ||
        event.defaultPrevented ||
        document.querySelector(
          '[role="dialog"], [role="alertdialog"], [role="menu"], [role="listbox"]',
        )
      )
        return
      setSelected([])
      setBatchMode(false)
      setNotice('')
      setError('')
    }
    document.addEventListener('keydown', clearOnEscape)
    return () => document.removeEventListener('keydown', clearOnEscape)
  }, [batchMode, busy])

  useEffect(() => {
    if (!notice) return
    const timer = window.setTimeout(() => setNotice(''), 3500)
    return () => window.clearTimeout(timer)
  }, [notice])

  async function act(key: string, action: () => Promise<void>, success = '') {
    if (busy) return
    setBusy(key)
    setError('')
    setNotice('')
    try {
      await action()
      if (success) setNotice(success)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '操作失败')
    } finally {
      setBusy('')
    }
  }
  async function editAssets(ids: string[], change: Record<string, unknown>) {
    await libraryRequest('library/assets', {
      method: 'PATCH',
      body: JSON.stringify({ ids, ...change }),
    })
    await latestLoad.current()
    await loadProjects()
    setSelected([])
  }
  function toggleSelect(id: string) {
    if (busy || !batchMode) return
    setNotice('')
    setError('')
    setSelected((previous) =>
      previous.includes(id)
        ? previous.filter((value) => value !== id)
        : previous.length < 100
          ? [...previous, id]
          : previous,
    )
  }
  const selectedAssets = assets.filter((item) => selected.includes(item.id))
  const allSelectedFavorite =
    selectedAssets.length > 0 && selectedAssets.every((item) => item.favorite)
  async function updateFavorites(ids: string[], nextFavorite: boolean) {
    const requestFilter = filterKey
    await libraryRequest('library/assets', {
      method: 'PATCH',
      body: JSON.stringify({ ids, favorite: nextFavorite }),
    })
    if (currentFilter.current !== requestFilter) return
    // Preserve the loaded pages and selection so another batch action can follow.
    setAssets((current) =>
      current.flatMap((item) => {
        if (!ids.includes(item.id)) return [item]
        return favorite && !nextFavorite ? [] : [{ ...item, favorite: nextFavorite }]
      }),
    )
    if (favorite && !nextFavorite) {
      setSelected((current) => current.filter((id) => !ids.includes(id)))
      setTotal((current) => Math.max(0, current - ids.length))
      if (assets.length === ids.length && total > ids.length) {
        setLoading(true)
        await latestLoad.current()
      }
    }
  }
  async function downloadSelected() {
    if (selectedAssets.length !== selected.length)
      throw new Error('部分图片已不在当前列表，请重新选择')
    const asset = selectedAssets[0]
    if (selectedAssets.length === 1 && asset) {
      await downloadProtectedAsset(asset.contentPath, assetFilename(asset))
    } else await downloadLibraryAssets(selected)
  }
  function compareAsset(asset: LibraryAsset, original = false) {
    const current = {
      path: asset.contentPath,
      label: assetTitle(asset),
      width: asset.width,
      height: asset.height,
    }
    const references = comparisonReferences(asset.task?.input).filter(
      (item) => item.path !== asset.contentPath,
    )
    const candidates = comparisonCandidates([
      current,
      ...references,
      ...(asset.task?.resultImages ?? []).map((path, index) => ({
        path,
        label: `同次生成 · ${index + 1}`,
      })),
      ...assets
        .filter(
          (item) =>
            item.id !== asset.id &&
            ((asset.task?.id && item.task?.id === asset.task.id) ||
              (asset.projectId && item.projectId === asset.projectId)),
        )
        .map((item) => ({
          path: item.contentPath,
          label: assetTitle(item),
          width: item.width,
          height: item.height,
        })),
    ])
    setPreview(null)
    if (!candidates.some((item) => item.path === current.path)) {
      setError('这张图片暂不支持对比，请选择其他图片')
      return
    }
    setError('')
    setNotice('')
    setComparison({
      candidates,
      initialLeft: original && references[0] ? references[0].path : current.path,
      ...(original && references.length ? { initialRight: current.path } : {}),
      projectId: asset.projectId || undefined,
    })
  }
  async function moveToProject(projectId: string) {
    if (!moveAssets?.length) return
    const requestFilter = filterKey
    const ids = moveAssets.map((asset) => asset.id)
    await libraryRequest('library/assets', {
      method: 'PATCH',
      body: JSON.stringify({ ids, projectId }),
    })
    setMoveAssets(null)
    if (currentFilter.current === requestFilter) {
      const leaving = project !== 'all' && project !== (projectId || 'unfiled')
      setAssets((current) =>
        current.flatMap((item) =>
          !ids.includes(item.id)
            ? [item]
            : leaving
              ? []
              : [
                  {
                    ...item,
                    projectId,
                    projectName: projects.find((item) => item.id === projectId)?.name || '',
                  },
                ],
        ),
      )
      if (leaving) {
        setSelected((current) => current.filter((id) => !ids.includes(id)))
        setTotal((current) => Math.max(0, current - ids.length))
        if (assets.length === ids.length && total > ids.length) {
          setLoading(true)
          await latestLoad.current()
        }
      }
    }
    await loadProjects()
  }
  function openEdit(asset: LibraryAsset) {
    setError('')
    setPreview(null)
    setEditing(asset)
    setTitleDraft(asset.title)
    setTagsDraft(asset.tags.join('、'))
    setProjectDraft(asset.projectId || 'unfiled')
  }
  async function saveMetadata() {
    await editAssets([editing!.id], {
      title: titleDraft,
      tags: tagsDraft.split(/[,，、\n]/),
      ...(projectDraft === (editing!.projectId || 'unfiled')
        ? {}
        : { projectId: projectDraft === 'unfiled' ? '' : projectDraft }),
    })
    setEditing(null)
  }
  async function saveProject() {
    await libraryRequest(
      projectForm === 'new' ? 'projects' : `projects/${(projectForm as LibraryProject).id}`,
      {
        method: projectForm === 'new' ? 'POST' : 'PATCH',
        body: JSON.stringify({ name: projectName }),
      },
    )
    await loadProjects()
    setProjectForm(null)
  }
  async function removeConfirmed() {
    if (confirm?.asset) await deleteGeneratedAsset(confirm.asset.contentPath)
    if (confirm?.task) await deleteGenerationTask(confirm.task.id)
    if (confirm?.project) {
      await libraryRequest(`projects/${confirm.project.id}`, { method: 'DELETE' })
      if (project === confirm.project.id) setProject('all')
    }
    setConfirm(null)
    await load()
    await loadProjects()
  }
  const currentProject = projects.find((item) => item.id === project)
  const projectOptions: Array<[string, string]> = [
    ['unfiled', '未分类'],
    ...projects
      .filter((item) => !item.archived || item.id === editing?.projectId)
      .map((item) => [item.id, item.name] as [string, string]),
  ]
  const assetCount = view === 'tasks' ? tasks.length : assets.length
  return (
    <StudioShell
      section={view === 'tasks' ? 'history' : 'assets'}
      title="我的资产"
      actions={
        <Link
          className="studio-primary"
          href={`/studio?mode=general${currentProject && !currentProject.archived ? `&projectId=${encodeURIComponent(currentProject.id)}` : ''}`}
        >
          <Plus size={16} />
          {currentProject && !currentProject.archived ? '在项目中创作' : '开始创作'}
        </Link>
      }
    >
      <main className="asset-manager">
        <div className="asset-manager-heading">
          <nav className="library-views" aria-label="资产库视图">
            <Link href="/assets" aria-current={view === 'images' ? 'page' : undefined}>
              <ImageIcon size={16} />
              生成作品
            </Link>
            <Link
              href="/assets?view=uploads"
              aria-current={view === 'uploads' ? 'page' : undefined}
            >
              <Folder size={16} />
              我的素材
            </Link>
            <Link href="/assets?view=tasks" aria-current={view === 'tasks' ? 'page' : undefined}>
              <Clock3 size={16} />
              创作记录
            </Link>
          </nav>
          <span className="library-count">
            {loading ? '正在读取…' : `${total} ${view === 'tasks' ? '条记录' : '张图片'}`}
          </span>
        </div>
        <div className="asset-manager-layout">
          <aside className="asset-projects" aria-label="作品分类">
            <button
              className={project === 'all' && !favorite ? 'active' : ''}
              onClick={() => {
                setProject('all')
                setFavorite(false)
              }}
            >
              <ImageIcon size={16} />
              全部作品
            </button>
            {view !== 'tasks' && (
              <button
                className={favorite ? 'active' : ''}
                aria-pressed={favorite}
                onClick={() => {
                  setFavorite(!favorite)
                  setProject('all')
                }}
              >
                <FavoriteStar active={favorite} />
                我的收藏
              </button>
            )}
            <button
              className={project === 'unfiled' ? 'active' : ''}
              onClick={() => {
                setProject('unfiled')
                setFavorite(false)
              }}
            >
              <Folder size={16} />
              未分类
            </button>
            <div className="asset-projects-title">
              <span>项目</span>
              <button
                aria-label="新建项目"
                onClick={() => {
                  setProjectForm('new')
                  setProjectName('')
                }}
              >
                <Plus size={16} />
              </button>
            </div>
            {projects
              .filter((item) => !item.archived)
              .map((item) => (
                <button
                  key={item.id}
                  className={project === item.id ? 'active' : ''}
                  onClick={() => {
                    setProject(item.id)
                    setFavorite(false)
                  }}
                >
                  <Folder size={15} />
                  <span>{item.name}</span>
                  <small>{item.assetCount ?? 0}</small>
                </button>
              ))}
            {projects.some((item) => item.archived) && (
              <details>
                <summary>
                  <Archive size={14} />
                  已归档项目
                </summary>
                {projects
                  .filter((item) => item.archived)
                  .map((item) => (
                    <button
                      key={item.id}
                      className={project === item.id ? 'active' : ''}
                      onClick={() => setProject(item.id)}
                    >
                      <Folder size={14} />
                      <span>{item.name}</span>
                    </button>
                  ))}
              </details>
            )}
          </aside>
          <section className="asset-manager-results" aria-label="作品列表">
            <div className="library-toolbar">
              <label className="library-search">
                <Search size={17} aria-hidden="true" />
                <input
                  type="search"
                  aria-label="搜索作品"
                  placeholder="搜索名称、提示词或标签"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                />
              </label>
              {view !== 'uploads' && (
                <LibrarySelect
                  label="筛选工具"
                  value={tool}
                  options={toolOptions}
                  onChange={setTool}
                />
              )}
              <LibrarySelect
                label="作品排序"
                value={sort}
                options={[
                  ['newest', '最新优先'],
                  ['oldest', '最早优先'],
                ]}
                onChange={setSort}
              />
              <button
                className="library-command"
                aria-label="刷新作品"
                title="刷新"
                disabled={loading || !!busy}
                onClick={() => {
                  setLoading(true)
                  void load()
                }}
              >
                <RefreshCw size={16} />
              </button>
            </div>
            <div className="asset-context-row">
              {batchMode ? (
                <AssetSelectionToolbar
                  count={selected.length}
                  loadedCount={assets.length}
                  allFavorite={allSelectedFavorite}
                  busy={busy}
                  error={error}
                  notice={notice}
                  onSelectLoaded={() => setSelected(assets.slice(0, 100).map((item) => item.id))}
                  onClear={() => {
                    setSelected([])
                    setNotice('')
                    setError('')
                  }}
                  onDownload={() => void act('download', downloadSelected)}
                  onMove={() => {
                    setError('')
                    setMoveAssets(selectedAssets)
                  }}
                  onFavorite={() =>
                    void act(
                      'favorite',
                      () => updateFavorites(selected, !allSelectedFavorite),
                      allSelectedFavorite ? '已取消收藏' : '已加入收藏',
                    )
                  }
                  onExit={() => {
                    setBatchMode(false)
                    setSelected([])
                    setNotice('')
                    setError('')
                  }}
                />
              ) : (
                <div className="library-filter-row">
                  <AssetAdvancedFilters
                    showTag={view !== 'tasks'}
                    tag={tag}
                    from={from}
                    to={to}
                    onTag={setTag}
                    onFrom={setFrom}
                    onTo={setTo}
                    onReset={() => {
                      setTag('')
                      setFrom('')
                      setTo('')
                    }}
                  />
                  {view !== 'tasks' && (
                    <div className="asset-list-options">
                      <button
                        type="button"
                        className="library-command asset-batch-enter"
                        disabled={loading || !!busy || !assets.length}
                        onClick={() => {
                          setBatchMode(true)
                          setError('')
                          setNotice('')
                        }}
                      >
                        <ListChecks size={15} aria-hidden="true" />
                        批量管理
                      </button>
                      <button
                        className="library-density"
                        onClick={() =>
                          setDensity(density === 'comfortable' ? 'compact' : 'comfortable')
                        }
                      >
                        {density === 'comfortable' ? '紧凑视图' : '舒适视图'}
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
            {currentProject && (
              <div className="library-project-heading">
                <strong>
                  {currentProject.name}
                  {currentProject.archived && <small>已归档</small>}
                </strong>
                <div>
                  <button
                    className="library-command"
                    onClick={() => {
                      setProjectForm(currentProject)
                      setProjectName(currentProject.name)
                    }}
                  >
                    <Pencil size={14} />
                    改名
                  </button>
                  <button
                    className="library-command"
                    disabled={!!busy}
                    onClick={() =>
                      void act(
                        'archive',
                        async () => {
                          await libraryRequest(`projects/${currentProject.id}`, {
                            method: 'PATCH',
                            body: JSON.stringify({ archived: !currentProject.archived }),
                          })
                          await loadProjects()
                        },
                        currentProject.archived ? '项目已恢复' : '项目已归档',
                      )
                    }
                  >
                    <Archive size={14} />
                    {currentProject.archived ? '恢复' : '归档'}
                  </button>
                  <button
                    className="library-command"
                    onClick={() => setConfirm({ project: currentProject })}
                  >
                    移除项目
                  </button>
                </div>
              </div>
            )}
            {error && !batchMode && (
              <div className="library-feedback is-error" role="alert">
                {error}
                <button onClick={() => void load()}>重试</button>
              </div>
            )}
            {notice && !batchMode && (
              <p className="library-feedback" role="status">
                {notice}
              </p>
            )}
            <div
              ref={recordsRef}
              className="asset-records"
              role="region"
              aria-label={view === 'tasks' ? '创作记录内容' : '资产内容'}
              tabIndex={0}
            >
              {loading ? (
                <div className={`asset-grid is-${density}`} aria-label="正在加载资产">
                  {Array.from({ length: 8 }, (_, i) => (
                    <div key={i} className="asset-card is-skeleton" aria-hidden="true">
                      <div className="asset-cover auth-image-loading" />
                      <div className="asset-card-copy">
                        <span className="skeleton-line" />
                      </div>
                    </div>
                  ))}
                </div>
              ) : view !== 'tasks' ? (
                <AssetGrid
                  assets={assets}
                  selected={selected}
                  selectionMode={batchMode}
                  density={density}
                  busy={!!busy}
                  onPreview={setPreview}
                  onSelect={toggleSelect}
                  onTag={setTag}
                  onEdit={openEdit}
                  onFavorite={(asset) =>
                    void act(asset.id, () => updateFavorites([asset.id], !asset.favorite))
                  }
                  onDownload={(asset) =>
                    void act('download', () =>
                      downloadProtectedAsset(asset.contentPath, assetFilename(asset)),
                    )
                  }
                  onDelete={(asset) => setConfirm({ asset })}
                  onMove={(asset) => {
                    setError('')
                    setMoveAssets([asset])
                  }}
                />
              ) : (
                <TaskGrid
                  tasks={tasks}
                  density={density}
                  onDetails={setDetailTask}
                  onDelete={(task) => setConfirm({ task })}
                />
              )}
              {!loading && assetCount === 0 && !error && (
                <div className="library-empty-state">
                  <Folder size={32} />
                  <strong>
                    {query || tool !== 'all' || tag || favorite || project !== 'all'
                      ? '没有匹配的作品'
                      : view === 'uploads'
                        ? '上传的参考素材会保存在这里'
                        : '从第一张图片开始'}
                  </strong>
                  <p>可以调整筛选条件，或开始一次新的创作。</p>
                  <Link className="studio-primary" href="/studio?mode=general">
                    开始创作
                  </Link>
                </div>
              )}
              {!loading && cursor && (
                <button
                  className="library-load-more"
                  disabled={moreBusy}
                  onClick={() => {
                    setMoreBusy(true)
                    void load(cursor, true)
                  }}
                >
                  {moreBusy ? '正在加载…' : '加载更多'}
                </button>
              )}
              {!loading && assetCount > 0 && (
                <p className="library-end-note">
                  已加载 {assetCount} / {total} {view === 'tasks' ? '条记录' : '张图片'}
                </p>
              )}
            </div>
          </section>
        </div>
      </main>
      {preview && (
        <AssetPreview
          asset={preview}
          onCompare={() => compareAsset(preview)}
          onCompareOriginal={
            comparisonReferences(preview.task?.input).some(
              (item) => item.path !== preview.contentPath,
            )
              ? () => compareAsset(preview, true)
              : undefined
          }
          onClose={() => setPreview(null)}
          onEdit={() => openEdit(preview)}
          onZoom={() => {
            setLightbox(preview)
            setPreview(null)
          }}
          onReverse={() => {
            const asset = preview
            setPreview(null)
            openReverse({ assetId: asset.id, imageName: assetTitle(asset) })
          }}
        />
      )}
      {lightbox && (
        <ImageLightbox
          path={lightbox.contentPath}
          alt={assetTitle(lightbox)}
          filename={assetFilename(lightbox)}
          onClose={() => setLightbox(null)}
        />
      )}
      {editing && (
        <LibraryDialog
          title="整理图片"
          onClose={() => {
            if (!busy) setEditing(null)
          }}
        >
          <form
            onSubmit={(event) => {
              event.preventDefault()
              void act('metadata', saveMetadata, '图片信息已保存')
            }}
          >
            <label>
              作品名称
              <input
                aria-label="作品名称"
                value={titleDraft}
                maxLength={160}
                placeholder={assetTitle(editing)}
                onChange={(event) => setTitleDraft(event.target.value)}
                disabled={!!busy}
              />
            </label>
            <label>
              标签
              <input
                aria-label="作品标签"
                value={tagsDraft}
                maxLength={400}
                placeholder="用逗号分隔，例如：产品、夏季"
                onChange={(event) => setTagsDraft(event.target.value)}
                disabled={!!busy}
              />
              <small>最多 12 个标签，每个 32 字</small>
            </label>
            <label>
              所属项目
              <LibrarySelect
                label="所属项目"
                value={projectDraft}
                onChange={setProjectDraft}
                disabled={!!busy}
                options={projectOptions}
              />
            </label>
            {error && (
              <p role="alert" className="settings-error">
                {error}
              </p>
            )}
            <div className="library-form-actions">
              <button
                className="studio-secondary"
                type="button"
                disabled={!!busy}
                onClick={() => setEditing(null)}
              >
                取消
              </button>
              <button className="studio-primary" disabled={!!busy}>
                {busy === 'metadata' ? '保存中…' : '保存'}
              </button>
            </div>
          </form>
        </LibraryDialog>
      )}
      {projectForm && (
        <LibraryDialog
          title={projectForm === 'new' ? '新建项目' : '项目改名'}
          onClose={() => {
            if (!busy) setProjectForm(null)
          }}
        >
          <form
            onSubmit={(event) => {
              event.preventDefault()
              void act('project', saveProject, '项目已保存')
            }}
          >
            <label>
              项目名称
              <input
                autoFocus
                aria-label="项目名称"
                required
                maxLength={80}
                value={projectName}
                onChange={(event) => setProjectName(event.target.value)}
                disabled={!!busy}
              />
            </label>
            {error && (
              <p role="alert" className="settings-error">
                {error}
              </p>
            )}
            <div className="library-form-actions">
              <button
                className="studio-secondary"
                type="button"
                disabled={!!busy}
                onClick={() => setProjectForm(null)}
              >
                取消
              </button>
              <button className="studio-primary" disabled={!!busy || !projectName.trim()}>
                保存项目
              </button>
            </div>
          </form>
        </LibraryDialog>
      )}
      {moveAssets && (
        <AssetProjectDialog
          assets={moveAssets}
          projects={projects}
          busy={!!busy}
          error={error}
          onClose={() => setMoveAssets(null)}
          onMove={(projectId) => void act('move', () => moveToProject(projectId), '图片已移动')}
        />
      )}
      {confirm && (
        <ConfirmDialog
          title={
            confirm.project
              ? '移除这个项目？'
              : confirm.task
                ? '删除这条创作记录？'
                : '删除这张图片？'
          }
          description={
            confirm.project?.name ||
            (confirm.task ? taskTitle(confirm.task.input) : assetTitle(confirm.asset!))
          }
          detail={
            confirm.project
              ? '项目中的图片和记录会保留，并回到未分类。'
              : '图片将从资产列表和生成结果中移除。历史创作使用过的原图会保留，以便恢复配置；生成中的素材暂不能删除。'
          }
          confirmLabel={confirm.project ? '移除项目' : '删除'}
          busy={!!busy}
          error={error}
          onCancel={() => setConfirm(null)}
          onConfirm={() => void act('delete', removeConfirmed, '已完成')}
        />
      )}
      {detailTask && (
        <InfoDialog
          title="创作记录"
          subtitle={`${taskModeLabel(detailTask.input)} · ${formatLibraryDate(detailTask.createdAt)}`}
          onClose={() => setDetailTask(null)}
          hideActions
        >
          {detailTask.errorMessage && <FailureNotice message={detailTask.errorMessage} compact />}
          <p className="library-task-prompt">
            {detailTask.input.prompt || detailTask.input.requirements || '未填写补充描述'}
          </p>
          <dl className="library-parameters">
            <div>
              <dt>模型</dt>
              <dd>{detailTask.input.model}</dd>
            </div>
            <div>
              <dt>比例 / 清晰度</dt>
              <dd>
                {detailTask.input.aspectRatio} · {detailTask.input.resolution}
              </dd>
            </div>
          </dl>
          <div className="library-form-actions">
            <Link className="studio-primary" href={historyWorkbenchUrl(detailTask)}>
              载入配置继续创作
            </Link>
          </div>
        </InfoDialog>
      )}
      {comparison && (
        <LazyImageComparison
          candidates={comparison.candidates}
          initialLeft={comparison.initialLeft}
          initialRight={comparison.initialRight}
          browseLibrary={{ projectId: comparison.projectId }}
          onClose={() => setComparison(null)}
        />
      )}
    </StudioShell>
  )
}
