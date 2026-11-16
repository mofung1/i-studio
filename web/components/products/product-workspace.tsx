'use client'

import { useEffect, useRef, useState } from 'react'
import { Box, ChevronRight, Plus, RefreshCw, Search } from 'lucide-react'
import { AccountBoundary } from '@/components/account-access'
import { useAccount } from '@/components/account-provider'
import { AuthenticatedImage } from '@/components/authenticated-image'
import { StudioShell } from '@/components/studio-shell'
import { frontendRequest } from '@/lib/frontend-request'
import { getAccessToken } from '@/lib/api'
import type { PublicImageModel } from '@/lib/generation-models'
import { productApi, type CommerceProduct } from '@/lib/products'
import { ProductEditor } from './product-editor'
import { ProductCreation } from './product-creation'
import styles from './products.module.css'

export function ProductWorkspace({ initialProjectId = '' }: { initialProjectId?: string }) {
  const { account } = useAccount()
  return (
    <AccountBoundary
      section="products"
      title="商品工作室"
      description="保存商品档案，制作并管理商品图片。"
      returnTo={`/products${initialProjectId ? `?${new URLSearchParams({ projectId: initialProjectId })}` : ''}`}
    >
      <ProductWorkspaceContent
        key={`${account.user?.id ?? 'guest'}:${initialProjectId}`}
        owner={account.user?.id ?? ''}
        initialProjectId={initialProjectId}
      />
    </AccountBoundary>
  )
}

function ProductWorkspaceContent({
  owner,
  initialProjectId,
}: {
  owner: string
  initialProjectId: string
}) {
  const [products, setProducts] = useState<CommerceProduct[]>([])
  const [selected, setSelected] = useState<CommerceProduct | null>(null)
  const [initialized, setInitialized] = useState(false)
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [nextCursor, setNextCursor] = useState('')
  const [error, setError] = useState('')
  const [modelsError, setModelsError] = useState('')
  const [revision, setRevision] = useState(0)
  const [models, setModels] = useState<PublicImageModel[]>([])
  const [visionEnabled, setVisionEnabled] = useState(false)
  const [dirty, setDirty] = useState(false)
  const [editorBusy, setEditorBusy] = useState(false)
  const currentQuery = useRef(query)
  currentQuery.current = query

  useEffect(() => {
    const controller = new AbortController()
    setLoading(true)
    setError('')
    const timer = window.setTimeout(
      () => {
        productApi
          .list(new URLSearchParams({ q: query, limit: '30' }), controller.signal)
          .then((data) => {
            if (controller.signal.aborted) return
            setProducts(data.products ?? [])
            setNextCursor(data.nextCursor ?? '')
            setSelected((current) =>
              current ? (data.products.find((item) => item.id === current.id) ?? current) : current,
            )
            if (!initialized) {
              setSelected(data.products?.[0] ?? null)
              setInitialized(true)
            }
          })
          .catch((error) => {
            if (!controller.signal.aborted)
              setError(error instanceof Error ? error.message : '商品档案读取失败')
          })
          .finally(() => {
            if (!controller.signal.aborted) setLoading(false)
          })
      },
      query ? 250 : 0,
    )
    return () => {
      clearTimeout(timer)
      controller.abort()
    }
  }, [query, revision, initialized])
  useEffect(() => {
    const controller = new AbortController()
    setModelsError('')
    frontendRequest<{
      imageEndpoints: PublicImageModel[]
      promptVision?: boolean
      promptEnhanceEnabled?: boolean
    }>('generation/capabilities', { signal: controller.signal })
      .then((data) => {
        if (controller.signal.aborted) return
        setModels(data.imageEndpoints ?? [])
        setVisionEnabled(Boolean(data.promptVision && data.promptEnhanceEnabled))
      })
      .catch((error) => {
        if (!controller.signal.aborted)
          setModelsError(error instanceof Error ? error.message : '模型读取失败')
      })
    return () => controller.abort()
  }, [revision])

  function saved(product: CommerceProduct) {
    setProducts((current) =>
      current.some((item) => item.id === product.id)
        ? current.map((item) => (item.id === product.id ? product : item))
        : [product, ...current],
    )
    setSelected(product)
    setInitialized(true)
  }
  async function more() {
    if (!nextCursor || loadingMore) return
    setLoadingMore(true)
    const token = getAccessToken()
    const requestQuery = query
    try {
      const data = await productApi.list(
        new URLSearchParams({ q: query, limit: '30', cursor: nextCursor }),
      )
      if (token !== getAccessToken() || currentQuery.current !== requestQuery) return
      setProducts((current) => [
        ...current,
        ...data.products.filter((item) => !current.some((existing) => existing.id === item.id)),
      ])
      setNextCursor(data.nextCursor ?? '')
    } catch (error) {
      setError(error instanceof Error ? error.message : '商品档案读取失败')
    } finally {
      setLoadingMore(false)
    }
  }
  function choose(product: CommerceProduct | null) {
    setSelected(product)
    setInitialized(true)
    setDirty(false)
  }

  return (
    <StudioShell
      section="products"
      title="商品工作室"
      projectId={selected?.projectId || initialProjectId}
      actions={
        <button className="studio-primary" disabled={editorBusy} onClick={() => choose(null)}>
          <Plus size={16} />
          建立商品档案
        </button>
      }
    >
      <div className={styles.workspace}>
        <aside className={styles.catalog} aria-label="商品列表">
          <div className={styles.catalogTitle}>
            <h1>我的商品</h1>
            <button
              className={styles.iconButton}
              aria-label="刷新商品列表"
              disabled={loading || editorBusy}
              onClick={() => setRevision((value) => value + 1)}
            >
              <RefreshCw size={16} />
            </button>
          </div>
          <label className={styles.search}>
            <Search size={16} />
            <input
              type="search"
              aria-label="搜索商品"
              placeholder="搜索商品名称"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </label>
          {error && (
            <p role="alert" className={styles.error}>
              {error}
            </p>
          )}
          {loading && !products.length ? (
            <p role="status" className={styles.muted}>
              正在读取商品…
            </p>
          ) : !products.length ? (
            <div className={styles.catalogEmpty}>
              <Box size={24} />
              <p>{query ? '没有找到商品' : '为每个商品建立一份可复用的档案。'}</p>
            </div>
          ) : (
            <div className={styles.productList}>
              {products.map((product) => (
                <button
                  key={product.id}
                  type="button"
                  disabled={editorBusy}
                  className={styles.productItem}
                  aria-current={selected?.id === product.id ? 'true' : undefined}
                  onClick={() => choose(product)}
                >
                  <span className={styles.productThumb}>
                    {product.productAssetIds[0] ? (
                      <AuthenticatedImage
                        path={`/v1/assets/${encodeURIComponent(product.productAssetIds[0])}/thumbnail`}
                        alt=""
                      />
                    ) : (
                      <Box size={21} />
                    )}
                  </span>
                  <span>
                    <strong>{product.name}</strong>
                    <small>
                      {product.productAssetIds.length} 张原图 ·{' '}
                      {Object.keys(product.adoptedAssetIds ?? {}).length} 个用途已采用
                    </small>
                  </span>
                  <ChevronRight size={15} />
                </button>
              ))}
            </div>
          )}
          {nextCursor && (
            <button className="studio-secondary" disabled={loadingMore} onClick={() => void more()}>
              {loadingMore ? '正在读取…' : '更多商品'}
            </button>
          )}
          <p className={styles.catalogHelp}>档案可反复使用，生成和修改后的图片都保留为独立版本。</p>
        </aside>
        <main className={styles.main}>
          <ol className={styles.steps} aria-label="商品创作流程">
            <li data-current={!selected}>商品档案</li>
            <li data-current={Boolean(selected)}>选择用途与生成</li>
            <li>修改与采用</li>
          </ol>
          {modelsError && (
            <p role="alert" className={styles.error}>
              {modelsError}{' '}
              <button type="button" onClick={() => setRevision((value) => value + 1)}>
                重新读取
              </button>
            </p>
          )}
          {!initialized && loading ? (
            <p role="status" className={styles.empty}>
              正在读取商品档案…
            </p>
          ) : (
            <ProductEditor
              key={`editor:${owner}:${selected?.id ?? `new:${initialProjectId}`}`}
              owner={owner}
              defaultProjectId={initialProjectId}
              product={selected ?? undefined}
              visionEnabled={visionEnabled}
              onSaved={saved}
              onDirty={setDirty}
              onBusy={setEditorBusy}
            />
          )}
          {selected ? (
            <ProductCreation
              key={`creation:${owner}:${selected.id}`}
              product={selected}
              dirty={dirty}
              editorBusy={editorBusy}
              models={models}
              onProductUpdated={saved}
            />
          ) : (
            <div className={styles.startHint}>
              <ImageStep />
              <div>
                <strong>保存档案后，开始制作商品图片</strong>
                <p>选择主图、场景、细节或卖点配图，再从生成结果中选出采用版本。</p>
              </div>
            </div>
          )}
        </main>
      </div>
    </StudioShell>
  )
}

function ImageStep() {
  return <Box size={28} aria-hidden="true" />
}
