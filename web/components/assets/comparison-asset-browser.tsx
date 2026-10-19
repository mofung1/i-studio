'use client'

import { ArrowLeft, ImagePlus, RefreshCw, Search } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { AuthenticatedImage } from '@/components/authenticated-image'
import { AssetImageCover } from '@/components/asset-image-cover'
import { LibrarySelect } from '@/components/library-controls'
import { comparisonCandidates, type ComparisonImage } from '@/lib/image-comparison'
import {
  assetTitle,
  libraryRequest,
  mergeLibraryPage,
  type LibraryAsset,
  type LibraryProject,
} from '@/lib/library'

function thumbnail(path: string) {
  return /^\/v1\/assets\/[A-Za-z0-9_-]+\/content$/.test(path)
    ? path.replace(/\/content$/, '/thumbnail')
    : path
}

export function ComparisonAssetBrowser({
  anchor,
  side,
  projectId,
  suggestions,
  onSelect,
  onBack,
}: {
  anchor?: ComparisonImage
  side: 'a' | 'b'
  projectId?: string
  suggestions: ComparisonImage[]
  onSelect: (image: ComparisonImage) => void
  onBack?: () => void
}) {
  const [search, setSearch] = useState('')
  const [query, setQuery] = useState('')
  const [project, setProject] = useState(projectId || 'all')
  const [kind, setKind] = useState('generated')
  const [projects, setProjects] = useState<LibraryProject[]>([])
  const [assets, setAssets] = useState<LibraryAsset[]>([])
  const [cursor, setCursor] = useState('')
  const [loading, setLoading] = useState(true)
  const [moreBusy, setMoreBusy] = useState(false)
  const [error, setError] = useState('')
  const controller = useRef<AbortController | null>(null)
  useEffect(() => {
    const timer = window.setTimeout(() => setQuery(search.trim()), 250)
    return () => window.clearTimeout(timer)
  }, [search])
  useEffect(() => {
    const pending = new AbortController()
    void libraryRequest<{ projects: LibraryProject[] }>('projects', { signal: pending.signal })
      .then((data) => {
        if (!pending.signal.aborted) setProjects(data.projects)
      })
      .catch(() => {})
    return () => pending.abort()
  }, [])
  const params = new URLSearchParams({ kind, limit: '24' })
  if (query) params.set('q', query)
  if (project !== 'all') params.set('projectId', project)
  const filterKey = params.toString()
  const currentFilter = useRef(filterKey)
  currentFilter.current = filterKey
  const load = useCallback(
    async (next: string, append: boolean, signal?: AbortSignal) => {
      const params = new URLSearchParams(filterKey)
      if (next) params.set('cursor', next)
      setError('')
      if (append) setMoreBusy(true)
      else setLoading(true)
      try {
        const data = await libraryRequest<{ assets: LibraryAsset[]; nextCursor: string }>(
          `library/assets?${params}`,
          { signal },
        )
        if (signal?.aborted || currentFilter.current !== filterKey) return
        setAssets((current) => (append ? mergeLibraryPage(current, data.assets) : data.assets))
        setCursor(data.nextCursor)
      } catch (reason) {
        if (!signal?.aborted && currentFilter.current === filterKey)
          setError(reason instanceof Error ? reason.message : '图片加载失败')
      } finally {
        if (!signal?.aborted && currentFilter.current === filterKey) {
          setLoading(false)
          setMoreBusy(false)
        }
      }
    },
    [filterKey],
  )
  useEffect(() => {
    const pending = new AbortController()
    controller.current = pending
    setAssets([])
    setCursor('')
    void load('', false, pending.signal)
    return () => pending.abort()
  }, [load])
  const related =
    !query && kind === 'generated' && (project === 'all' || project === (projectId || 'all'))
      ? comparisonCandidates(suggestions)
          .filter((image) => image.path !== anchor?.path)
          .slice(0, 8)
      : []
  const available = assets.filter(
    (asset) =>
      asset.contentPath !== anchor?.path &&
      !related.some((item) => item.path === asset.contentPath),
  )
  function cards(images: ComparisonImage[]) {
    return images.map((image) => (
      <article className="comparison-browser-card" key={image.path}>
        <AssetImageCover
          path={thumbnail(image.path)}
          alt={image.label}
          openLabel={`选择对比图片 ${image.label}`}
          onOpen={() => onSelect(image)}
        />
        <strong title={image.label}>{image.label}</strong>
      </article>
    ))
  }
  return (
    <div className="comparison-choose-layout">
      <section className="comparison-anchor" aria-label={`固定图片 ${side === 'b' ? 'A' : 'B'}`}>
        <span className="comparison-anchor-label">图片 {side === 'b' ? 'A' : 'B'}</span>
        <div className="comparison-anchor-image">
          {anchor && <AuthenticatedImage path={anchor.path} alt={anchor.label} />}
        </div>
        <strong>{anchor?.label || '当前图片'}</strong>
        <p>选择另一张图片，查看细节差异</p>
      </section>
      <section className="comparison-browser" aria-label={`选择图片 ${side.toUpperCase()}`}>
        <header className="comparison-browser-heading">
          <div>
            <h3>选择图片 {side.toUpperCase()}</h3>
            <p>同次生成和相关图片优先展示</p>
          </div>
          {onBack && (
            <button type="button" className="library-command" onClick={onBack}>
              <ArrowLeft size={15} aria-hidden="true" />
              返回对比
            </button>
          )}
        </header>
        <div className="comparison-browser-filters">
          <label className="library-search">
            <Search size={16} aria-hidden="true" />
            <input
              type="search"
              aria-label="搜索对比图片"
              placeholder="搜索图片名称、提示词或标签"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </label>
          <LibrarySelect
            label="对比图片来源"
            value={kind}
            onChange={setKind}
            options={[
              ['generated', '生成作品'],
              ['uploads', '我的素材'],
            ]}
          />
          <LibrarySelect
            label="对比图片项目"
            value={project}
            onChange={setProject}
            options={[
              ['all', '所有项目'],
              ['unfiled', '未分类'],
              ...projects.map(
                (item) => [item.id, `${item.name}${item.archived ? '（已归档）' : ''}`] as const,
              ),
            ]}
          />
        </div>
        <div className="comparison-browser-results" tabIndex={0} aria-label="可选对比图片">
          {related.length > 0 && (
            <>
              <h4>相关图片</h4>
              <div className="comparison-browser-grid">{cards(related)}</div>
            </>
          )}
          {available.length > 0 && (
            <>
              <h4>{related.length ? '更多图片' : '图片库'}</h4>
              <div className="comparison-browser-grid">
                {cards(
                  available.map((asset) => ({
                    path: asset.contentPath,
                    label: assetTitle(asset),
                    width: asset.width,
                    height: asset.height,
                  })),
                )}
              </div>
            </>
          )}
          {loading && (
            <p className="comparison-browser-status" role="status">
              正在读取图片…
            </p>
          )}
          {error && (
            <div className="comparison-browser-status" role="alert">
              <span>{error}</span>
              <button
                type="button"
                className="library-command"
                onClick={() => void load(cursor, !!cursor, controller.current?.signal)}
              >
                <RefreshCw size={14} aria-hidden="true" />
                重试
              </button>
            </div>
          )}
          {!loading && !error && !available.length && !related.length && (
            <div className="comparison-browser-status">
              <ImagePlus size={28} aria-hidden="true" />
              <strong>没有其他匹配的图片</strong>
              <p>试试其他项目、来源或搜索条件</p>
            </div>
          )}
          {cursor && (
            <button
              type="button"
              className="library-load-more"
              disabled={moreBusy}
              onClick={() => void load(cursor, true, controller.current?.signal)}
            >
              {moreBusy ? '正在加载…' : '加载更多图片'}
            </button>
          )}
        </div>
      </section>
    </div>
  )
}
