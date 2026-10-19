'use client'

import { FavoriteStar } from '@/components/favorite-star'
import { Check, ChevronLeft, ChevronRight, Images, Maximize2, Plus, Search, X } from 'lucide-react'
import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import { AccountAccess } from '@/components/account-access'
import { useAccount } from '@/components/account-provider'
import { AuthenticatedImage } from '@/components/authenticated-image'
import { LibraryDialog, LibrarySelect } from '@/components/library-controls'
import { getAccessToken } from '@/lib/api'
import { isStoredImage, storedImage, type CreationImage } from '@/lib/creation-images'
import {
  assetTitle,
  libraryRequest,
  mergeLibraryPage,
  type LibraryAsset,
  type LibraryProject,
} from '@/lib/library'
import { ImageLightbox } from './image-lightbox'

const acceptedTypes = ['image/jpeg', 'image/png', 'image/webp']
const sourceOptions = [
  ['uploads', '我的素材'],
  ['generated', '生成作品'],
] as const

function LocalPreview({ file }: { file: File }) {
  const [source, setSource] = useState('')
  const [failed, setFailed] = useState(false)
  useEffect(() => {
    const url = URL.createObjectURL(file)
    setFailed(false)
    setSource(url)
    return () => URL.revokeObjectURL(url)
  }, [file])
  if (failed)
    return (
      <span className="asset-picker-preview-error" role="status">
        图片无法预览，请重新选择
      </span>
    )
  return source ? <img src={source} alt={file.name} onError={() => setFailed(true)} /> : null
}

function LocalLightbox({ file, onClose }: { file: File; onClose: () => void }) {
  const [source, setSource] = useState('')
  useEffect(() => {
    const url = URL.createObjectURL(file)
    setSource(url)
    return () => URL.revokeObjectURL(url)
  }, [file])
  return source ? (
    <ImageLightbox path={source} alt={file.name} filename={file.name} onClose={onClose} />
  ) : null
}

function SelectedImages({
  images,
  onPreview,
  onRemove,
}: {
  images: CreationImage[]
  onPreview: (image: CreationImage) => void
  onRemove: (index: number) => void
}) {
  const viewportRef = useRef<HTMLDivElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const previousCount = useRef(images.length)
  const [edges, setEdges] = useState({ left: false, right: false })
  const measure = useCallback(() => {
    const viewport = viewportRef.current
    if (!viewport) return
    const left = viewport.scrollLeft > 1
    const right = viewport.scrollWidth - viewport.clientWidth - viewport.scrollLeft > 1
    setEdges((previous) =>
      previous.left === left && previous.right === right ? previous : { left, right },
    )
  }, [])
  useLayoutEffect(() => {
    const viewport = viewportRef.current
    if (!viewport) return
    // Reveal newly added files without scrolling the dialog or moving the library.
    if (images.length > previousCount.current) {
      const target = Math.max(0, viewport.scrollWidth - viewport.clientWidth)
      if (target > viewport.scrollLeft) viewport.scrollTo({ left: target, behavior: 'instant' })
    }
    previousCount.current = images.length
    measure()
  }, [images.length, measure])
  useEffect(() => {
    const observer = new ResizeObserver(measure)
    if (viewportRef.current) observer.observe(viewportRef.current)
    if (listRef.current) observer.observe(listRef.current)
    return () => observer.disconnect()
  }, [measure])
  function scroll(direction: -1 | 1) {
    const viewport = viewportRef.current
    if (!viewport) return
    viewport.scrollBy({
      left: direction * Math.max(108, viewport.clientWidth * 0.8),
      behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches
        ? 'instant'
        : 'smooth',
    })
  }
  return (
    <div
      className="asset-picker-pending"
      data-scroll-left={edges.left}
      data-scroll-right={edges.right}
    >
      <div
        className="asset-picker-selection"
        ref={viewportRef}
        role="group"
        aria-label="已选择的素材"
        tabIndex={0}
        onScroll={measure}
        onKeyDown={(event) => {
          if (event.target !== event.currentTarget) return
          if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
            event.preventDefault()
            scroll(event.key === 'ArrowLeft' ? -1 : 1)
          }
        }}
      >
        <div className="asset-picker-selection-list" ref={listRef}>
          {!images.length && (
            <span className="asset-picker-selection-hint">
              <Images size={20} aria-hidden="true" />
              已选图片会显示在这里
            </span>
          )}
          {images.map((image, index) => (
            <div
              key={isStoredImage(image) ? image.assetId : `local-${index}`}
              className="asset-picker-selected"
            >
              <div className="asset-picker-selected-cover">
                {isStoredImage(image) ? (
                  <AuthenticatedImage path={image.thumbnailPath} alt={image.name} />
                ) : (
                  <LocalPreview file={image} />
                )}
              </div>
              <button
                type="button"
                className="asset-picker-selected-preview"
                aria-label={`查看已选图片${index + 1}大图`}
                onClick={() => onPreview(image)}
              />
              <span title={image.name}>
                {index + 1}. {image.name}
              </span>
              <button
                type="button"
                className="asset-picker-selected-remove"
                aria-label={`移除所选图片${index + 1}`}
                onClick={() => onRemove(index)}
              >
                <X size={13} aria-hidden="true" />
              </button>
            </div>
          ))}
        </div>
      </div>
      {(edges.left || edges.right) && (
        <>
          <button
            type="button"
            className="asset-picker-scroll is-prev"
            aria-label="向左浏览已选图片"
            disabled={!edges.left}
            onClick={() => scroll(-1)}
          >
            <ChevronLeft size={16} aria-hidden="true" />
          </button>
          <button
            type="button"
            className="asset-picker-scroll is-next"
            aria-label="向右浏览已选图片"
            disabled={!edges.right}
            onClick={() => scroll(1)}
          >
            <ChevronRight size={16} aria-hidden="true" />
          </button>
        </>
      )}
    </div>
  )
}

export function AssetPicker({
  limit,
  excludedIds,
  onClose,
  onSelect,
}: {
  limit: number
  excludedIds: string[]
  onClose: () => void
  onSelect: (images: CreationImage[]) => void
}) {
  const { account } = useAccount()
  const sourceId = useId()
  const owner = account.user?.id ?? ''
  const [kind, setKind] = useState('uploads')
  const [search, setSearch] = useState('')
  const [query, setQuery] = useState('')
  const [favorite, setFavorite] = useState(false)
  const [project, setProject] = useState('all')
  const [projects, setProjects] = useState<LibraryProject[]>([])
  const [assets, setAssets] = useState<LibraryAsset[]>([])
  const [selection, setSelection] = useState<{ owner: string; images: CreationImage[] }>({
    owner,
    images: [],
  })
  const selected = selection.images.filter(
    (image) => !isStoredImage(image) || (selection.owner === owner && account.authenticated),
  )
  function select(update: (previous: CreationImage[]) => CreationImage[]) {
    setSelection((previous) => ({
      owner,
      images: update(
        previous.images.filter(
          (image) => !isStoredImage(image) || (previous.owner === owner && account.authenticated),
        ),
      ),
    }))
  }
  const [cursor, setCursor] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [fileError, setFileError] = useState('')
  const [dragging, setDragging] = useState(false)
  const [preview, setPreview] = useState<LibraryAsset | null>(null)
  const [selectedPreview, setSelectedPreview] = useState<CreationImage | null>(null)
  useEffect(() => setSelectedPreview(null), [owner, account.authenticated])
  const [attempt, setAttempt] = useState(0)
  const input = useRef<HTMLInputElement>(null)
  const scope = `${owner}:${account.authenticated}:${kind}:${query}:${favorite}:${project}:${attempt}`
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

  function addLocal(files: File[]) {
    const valid = files.filter(
      (file) => acceptedTypes.includes(file.type) && file.size <= 10 * 1024 * 1024,
    )
    const room = Math.max(0, limit - selected.length)
    const added = valid.slice(0, room)
    select((previous) => [...previous, ...added].slice(0, limit))
    if (valid.length !== files.length) setFileError('仅支持 JPG / PNG / WebP，单张不超过 10 MB。')
    else if (valid.length > room) setFileError(`还可以选择 ${room} 张，超出的图片已忽略。`)
    else setFileError('')
  }

  useEffect(() => {
    const timer = setTimeout(() => setQuery(search.trim()), 250)
    return () => clearTimeout(timer)
  }, [search])
  useEffect(() => {
    setProjects([])
    if (!account.authenticated) return
    const controller = new AbortController()
    const token = getAccessToken()
    void libraryRequest<{ projects: LibraryProject[] }>('projects', { signal: controller.signal })
      .then((data) => {
        if (!controller.signal.aborted && token === getAccessToken()) setProjects(data.projects)
      })
      .catch(() => {})
    return () => controller.abort()
  }, [owner, account.authenticated])
  useEffect(() => {
    const controller = new AbortController()
    setAssets([])
    setCursor('')
    setError('')
    setPreview(null)
    if (!account.authenticated) {
      setLoading(false)
      return
    }
    const token = getAccessToken()
    setLoading(true)
    void libraryRequest<{ assets: LibraryAsset[]; nextCursor: string }>(
      `library/assets?${params()}`,
      { signal: controller.signal },
    )
      .then((data) => {
        if (!controller.signal.aborted && token === getAccessToken()) {
          setAssets(data.assets)
          setCursor(data.nextCursor)
        }
      })
      .catch((reason) => {
        if (!controller.signal.aborted && token === getAccessToken()) setError(reason.message)
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false)
      })
    return () => controller.abort()
  }, [scope])
  async function more() {
    if (!cursor || loading || !account.authenticated) return
    const requestScope = scope
    const token = getAccessToken()
    setLoading(true)
    setError('')
    try {
      const query = params()
      query.set('cursor', cursor)
      const data = await libraryRequest<{ assets: LibraryAsset[]; nextCursor: string }>(
        `library/assets?${query}`,
      )
      if (requestScope === currentScope.current && token === getAccessToken()) {
        setAssets((previous) => mergeLibraryPage(previous, data.assets))
        setCursor(data.nextCursor)
      }
    } catch (reason) {
      if (requestScope === currentScope.current && token === getAccessToken())
        setError(reason instanceof Error ? reason.message : '加载失败')
    } finally {
      if (requestScope === currentScope.current) setLoading(false)
    }
  }
  return (
    <LibraryDialog
      title="选择创作素材"
      onClose={onClose}
      footer={
        <footer className="asset-picker-footer">
          <div className="asset-picker-footer-actions">
            <span aria-live="polite">
              已选择 {selected.length} / {limit} 张
            </span>
            <button
              type="button"
              className="studio-secondary"
              onClick={() => select(() => [])}
              disabled={!selected.length}
            >
              清空
            </button>
            <button
              type="button"
              className="studio-primary"
              disabled={!selected.length}
              onClick={() => {
                onSelect(selected)
                onClose()
              }}
            >
              使用所选素材
            </button>
          </div>
        </footer>
      }
    >
      <div
        className={`asset-picker${dragging ? ' is-dragging' : ''}`}
        onDragOver={(event) => {
          if (!Array.from(event.dataTransfer.types).includes('Files')) return
          event.preventDefault()
          event.stopPropagation()
          setDragging(true)
        }}
        onDragLeave={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget as Node)) setDragging(false)
        }}
        onDrop={(event) => {
          if (!Array.from(event.dataTransfer.types).includes('Files')) return
          event.preventDefault()
          event.stopPropagation()
          setDragging(false)
          addLocal(Array.from(event.dataTransfer.files))
        }}
      >
        <div className="asset-picker-materials">
          <button
            className="asset-picker-upload"
            type="button"
            aria-label="选择本地图片"
            title={
              selected.length >= limit
                ? `已选满 ${limit} 张，移除图片后可继续添加`
                : '选择本地图片，或拖入图片'
            }
            disabled={selected.length >= limit}
            onClick={() => input.current?.click()}
          >
            <Plus size={23} aria-hidden="true" />
            <strong>添加图片</strong>
            <small>{selected.length >= limit ? '已达上限' : '点击或拖入'}</small>
          </button>
          <SelectedImages
            images={selected}
            onPreview={setSelectedPreview}
            onRemove={(index) => select((previous) => previous.filter((_, at) => at !== index))}
          />
        </div>
        <input
          ref={input}
          type="file"
          hidden
          multiple={limit > 1}
          accept="image/jpeg,image/png,image/webp"
          aria-label="选择本地图片"
          onChange={(event) => {
            addLocal(Array.from(event.target.files ?? []))
            event.target.value = ''
          }}
        />
        <p className="asset-picker-file-status" role={fileError ? 'alert' : undefined}>
          {fileError || 'JPG / PNG / WebP · 单张不超过 10 MB'}
        </p>
        {!account.authenticated ? (
          <div className="asset-picker-browser">
            <AccountAccess
              compact
              title="登录后使用素材库"
              description="本地图片可以直接选择；登录后还可复用上传素材和生成作品。"
            />
          </div>
        ) : (
          <>
            <div className="asset-picker-filters" role="group" aria-label="筛选素材">
              <label className="library-search">
                <Search size={16} aria-hidden="true" />
                <input
                  type="search"
                  aria-label="搜索素材"
                  placeholder="搜索名称、标签或提示词"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                />
              </label>
              <fieldset className="asset-picker-source" role="radiogroup" aria-label="素材来源">
                <legend className="sr-only">素材来源</legend>
                {sourceOptions.map(([value, label]) => (
                  <label key={value} className="asset-picker-source-option">
                    <input
                      type="radio"
                      name={sourceId}
                      value={value}
                      checked={kind === value}
                      onChange={(event) => setKind(event.target.value)}
                    />
                    <span>{label}</span>
                  </label>
                ))}
              </fieldset>
              <div className="asset-picker-source-compact">
                <LibrarySelect
                  label="选择素材来源"
                  value={kind}
                  onChange={setKind}
                  options={sourceOptions}
                />
              </div>
              <button
                type="button"
                className="asset-picker-favorite"
                aria-label="只看收藏"
                title={favorite ? '显示全部素材' : '只看当前来源中已收藏的素材'}
                aria-pressed={favorite}
                onClick={() => setFavorite(!favorite)}
              >
                <FavoriteStar size={15} active={favorite} />
                <span>收藏</span>
              </button>
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
            <div className="asset-picker-browser">
              <div className="asset-picker-grid" aria-label="可用素材" aria-busy={loading}>
                {assets.map((asset) => {
                  const checked = selected.some(
                    (item) => isStoredImage(item) && item.assetId === asset.id,
                  )
                  const excluded = excludedIds.includes(asset.id)
                  const unsupported =
                    !acceptedTypes.includes(asset.mime) || asset.sizeBytes > 10 * 1024 * 1024
                  const disabled = excluded || (!checked && selected.length >= limit) || unsupported
                  return (
                    <div key={asset.id} className="asset-picker-item">
                      <div className="asset-picker-cover">
                        <AuthenticatedImage path={asset.thumbnailPath} alt={assetTitle(asset)} />
                      </div>
                      <button
                        type="button"
                        className="asset-picker-preview"
                        aria-label={`查看${assetTitle(asset)}大图`}
                        onClick={() => setPreview(asset)}
                      >
                        <Maximize2 size={15} aria-hidden="true" />
                      </button>
                      <button
                        type="button"
                        className="asset-picker-choice"
                        aria-pressed={checked}
                        aria-label={`${excluded ? '已添加：' : ''}${assetTitle(asset)}`}
                        disabled={disabled}
                        onClick={() =>
                          select((previous) =>
                            checked
                              ? previous.filter(
                                  (item) => !isStoredImage(item) || item.assetId !== asset.id,
                                )
                              : [...previous, storedImage(asset)],
                          )
                        }
                      >
                        <span className="asset-picker-check">
                          {(checked || excluded) && <Check size={14} aria-hidden="true" />}
                        </span>
                        <strong>{assetTitle(asset)}</strong>
                        <small>
                          {excluded
                            ? '已在当前素材中'
                            : unsupported
                              ? '格式或大小不支持'
                              : `${asset.width} × ${asset.height}`}
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
                  <Images size={28} aria-hidden="true" />
                  <p>
                    {query || favorite || project !== 'all'
                      ? '没有匹配的素材，试试调整筛选条件。'
                      : kind === 'uploads'
                        ? '还没有素材，可以先选择本地图片。'
                        : '生成作品会出现在这里，可继续用作参考。'}
                  </p>
                </div>
              )}
              {error && (
                <p className="settings-error" role="alert">
                  {error}
                  <button
                    type="button"
                    className="library-command"
                    onClick={() => setAttempt((value) => value + 1)}
                  >
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
            </div>
          </>
        )}
      </div>
      {selectedPreview &&
        (isStoredImage(selectedPreview) ? (
          account.authenticated && (
            <ImageLightbox
              path={selectedPreview.contentPath}
              alt={selectedPreview.name}
              filename={selectedPreview.name}
              onClose={() => setSelectedPreview(null)}
            />
          )
        ) : (
          <LocalLightbox file={selectedPreview} onClose={() => setSelectedPreview(null)} />
        ))}
      {preview && account.authenticated && (
        <ImageLightbox
          path={preview.contentPath}
          alt={assetTitle(preview)}
          filename={preview.filename}
          onClose={() => setPreview(null)}
        />
      )}
    </LibraryDialog>
  )
}
