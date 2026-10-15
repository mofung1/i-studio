'use client'

import { Check, Images, Maximize2, Search, Star, Upload, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
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
  const [attempt, setAttempt] = useState(0)
  const input = useRef<HTMLInputElement>(null)
  const selectionAnchor = useRef<HTMLDivElement>(null)
  const revealSelection = useRef(false)
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
    revealSelection.current = added.length > 0
    select((previous) => [...previous, ...added].slice(0, limit))
    if (valid.length !== files.length) setFileError('仅支持 JPG / PNG / WebP，单张不超过 10 MB。')
    else if (valid.length > room) setFileError(`还可以选择 ${room} 张，超出的图片已忽略。`)
    else setFileError('')
  }

  useEffect(() => {
    if (!revealSelection.current) return
    revealSelection.current = false
    selectionAnchor.current?.scrollIntoView?.({ block: 'nearest' })
  }, [selection])

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
        <button
          className="asset-picker-upload"
          type="button"
          disabled={selected.length >= limit}
          onClick={() => input.current?.click()}
        >
          <span className="asset-picker-upload-icon">
            <Upload size={21} aria-hidden="true" />
          </span>
          <span>
            <strong>选择本地图片</strong>
            <small>也可以拖入图片 · JPG / PNG / WebP · 单张不超过 10 MB</small>
          </span>
          <span className="asset-picker-upload-action">本地上传</span>
        </button>
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
        {fileError && (
          <p className="settings-error" role="alert">
            {fileError}
          </p>
        )}
        {selected.length > 0 && (
          <div ref={selectionAnchor} className="asset-picker-pending" aria-label="已选择的素材">
            <header>
              <strong>待使用的图片 · {selected.length} 张</strong>
              <span>点击「使用所选素材」带入当前创作</span>
            </header>
            <div className="asset-picker-selection">
              {selected.map((image, index) => (
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
                  <span title={image.name}>
                    {index + 1}. {image.name}
                  </span>
                  <button
                    type="button"
                    aria-label={`移除所选图片${index + 1}`}
                    onClick={() => select((previous) => previous.filter((_, at) => at !== index))}
                  >
                    <X size={13} aria-hidden="true" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
        {!account.authenticated ? (
          <AccountAccess
            compact
            title="登录后使用素材库"
            description="本地图片可以直接选择；登录后还可复用上传素材和生成作品。"
          />
        ) : (
          <>
            <div className="asset-picker-tabs" role="group" aria-label="素材来源">
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
                <Star size={15} aria-hidden="true" />
                收藏
              </button>
            </div>
            <div className="asset-picker-filters">
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
          </>
        )}
      </div>
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
