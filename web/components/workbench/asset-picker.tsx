'use client'

import { Check, Images, Search, Star } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { AuthenticatedImage } from '@/components/authenticated-image'
import { LibraryDialog, LibrarySelect } from '@/components/library-controls'
import { getAccessToken } from '@/lib/api'
import { storedImage, type StoredImage } from '@/lib/creation-images'
import {
  assetTitle,
  libraryRequest,
  mergeLibraryPage,
  type LibraryAsset,
  type LibraryProject,
} from '@/lib/library'

export function AssetPicker({
  limit,
  excludedIds,
  onClose,
  onSelect,
}: {
  limit: number
  excludedIds: string[]
  onClose: () => void
  onSelect: (images: StoredImage[]) => void
}) {
  const [kind, setKind] = useState('uploads')
  const [search, setSearch] = useState('')
  const [query, setQuery] = useState('')
  const [favorite, setFavorite] = useState(false)
  const [project, setProject] = useState('all')
  const [projects, setProjects] = useState<LibraryProject[]>([])
  const [assets, setAssets] = useState<LibraryAsset[]>([])
  const [selected, setSelected] = useState<LibraryAsset[]>([])
  const [cursor, setCursor] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [attempt, setAttempt] = useState(0)
  const scope = `${kind}:${query}:${favorite}:${project}:${attempt}`
  const currentScope = useRef(scope)
  currentScope.current = scope
  const params = () =>
    new URLSearchParams({
      kind,
      q: query,
      limit: '30',
      ...(favorite ? { favorite: 'true' } : {}),
      ...(project !== 'all' ? { projectId: project } : {}),
    })
  useEffect(() => {
    const timer = setTimeout(() => setQuery(search.trim()), 250)
    return () => clearTimeout(timer)
  }, [search])
  useEffect(() => {
    const controller = new AbortController()
    void libraryRequest<{ projects: LibraryProject[] }>('projects', { signal: controller.signal })
      .then((data) => setProjects(data.projects))
      .catch(() => {})
    return () => controller.abort()
  }, [])
  useEffect(() => {
    const controller = new AbortController()
    setAssets([])
    setCursor('')
    setLoading(true)
    setError('')
    void libraryRequest<{ assets: LibraryAsset[]; nextCursor: string }>(
      `library/assets?${params()}`,
      { signal: controller.signal },
    )
      .then((data) => {
        if (!controller.signal.aborted) {
          setAssets(data.assets)
          setCursor(data.nextCursor)
        }
      })
      .catch((reason) => {
        if (!controller.signal.aborted) setError(reason.message)
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false)
      })
    return () => controller.abort()
  }, [scope])
  async function more() {
    const requestScope = scope
    setLoading(true)
    setError('')
    try {
      const query = params()
      query.set('cursor', cursor)
      const data = await libraryRequest<{ assets: LibraryAsset[]; nextCursor: string }>(
        `library/assets?${query}`,
      )
      if (requestScope === currentScope.current) {
        setAssets((previous) => mergeLibraryPage(previous, data.assets))
        setCursor(data.nextCursor)
      }
    } catch (reason) {
      if (requestScope === currentScope.current)
        setError(reason instanceof Error ? reason.message : '加载失败')
    } finally {
      if (requestScope === currentScope.current) setLoading(false)
    }
  }
  return (
    <LibraryDialog title="选择创作素材" onClose={onClose}>
      {!getAccessToken() ? (
        <p>请先登录，再使用自己的素材。</p>
      ) : (
        <div className="asset-picker">
          <div className="asset-picker-tabs">
            <button
              type="button"
              aria-pressed={kind === 'uploads'}
              onClick={() => setKind('uploads')}
            >
              我的素材
            </button>
            <button
              type="button"
              aria-pressed={kind === 'generated'}
              onClick={() => setKind('generated')}
            >
              生成作品
            </button>
            <button
              type="button"
              className="asset-picker-favorite"
              aria-pressed={favorite}
              onClick={() => setFavorite(!favorite)}
            >
              <Star size={15} />
              收藏
            </button>
          </div>
          <div className="asset-picker-filters">
            <label className="library-search">
              <Search size={16} />
              <input
                type="search"
                aria-label="搜索素材"
                placeholder="搜索名称、标签或提示词"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
            </label>
            <LibrarySelect
              label="筛选素材项目"
              value={project}
              onChange={setProject}
              options={[
                ['all', '所有项目'],
                ['unfiled', '未分类'],
                ...projects.map((item) => [item.id, item.name] as const),
              ]}
            />
          </div>
          <div className="asset-picker-grid" aria-label="可用素材" aria-busy={loading}>
            {assets.map((asset) => {
              const checked = selected.some((item) => item.id === asset.id)
              const excluded = excludedIds.includes(asset.id)
              const disabled =
                excluded ||
                (!checked && selected.length >= limit) ||
                !['image/jpeg', 'image/png', 'image/webp'].includes(asset.mime) ||
                asset.sizeBytes > 10 * 1024 * 1024
              return (
                <div key={asset.id} className="asset-picker-item">
                  <div className="asset-picker-cover">
                    <AuthenticatedImage path={asset.thumbnailPath} alt={assetTitle(asset)} />
                  </div>
                  <button
                    type="button"
                    className="asset-picker-choice"
                    aria-pressed={checked}
                    aria-label={`${excluded ? '已添加：' : ''}${assetTitle(asset)}`}
                    disabled={disabled}
                    onClick={() =>
                      setSelected((previous) =>
                        checked
                          ? previous.filter((item) => item.id !== asset.id)
                          : [...previous, asset],
                      )
                    }
                  >
                    <span className="asset-picker-check">
                      {(checked || excluded) && <Check size={14} />}
                    </span>
                    <strong>{assetTitle(asset)}</strong>
                    <small>
                      {excluded ? '已在当前素材中' : `${asset.width} × ${asset.height}`}
                    </small>
                  </button>
                </div>
              )
            })}
          </div>
          {loading && (
            <p className="library-count" role="status">
              正在加载素材…
            </p>
          )}
          {!loading && !assets.length && !error && (
            <div className="asset-picker-empty">
              <Images size={28} />
              <p>
                {query || favorite || project !== 'all'
                  ? '没有匹配的素材，试试调整筛选条件。'
                  : kind === 'uploads'
                    ? '还没有素材，先通过本地上传添加图片。'
                    : '生成作品会出现在这里，可继续用作参考。'}
              </p>
            </div>
          )}
          {error && (
            <p className="settings-error" role="alert">
              {error}
              <button type="button" onClick={() => setAttempt((value) => value + 1)}>
                重试
              </button>
            </p>
          )}
          {cursor && (
            <button
              type="button"
              className="studio-secondary"
              disabled={loading}
              onClick={() => void more()}
            >
              加载更多
            </button>
          )}
          <footer className="asset-picker-footer">
            <span>
              已选择 {selected.length} / {limit} 张
            </span>
            <button
              type="button"
              className="studio-secondary"
              onClick={() => setSelected([])}
              disabled={!selected.length}
            >
              清空
            </button>
            <button
              type="button"
              className="studio-primary"
              disabled={!selected.length}
              onClick={() => {
                onSelect(selected.map(storedImage))
                onClose()
              }}
            >
              使用所选素材
            </button>
          </footer>
        </div>
      )}
    </LibraryDialog>
  )
}
