'use client'

import { useEffect, useRef, useState } from 'react'
import {
  Check,
  Download,
  ImagePlus,
  LoaderCircle,
  RefreshCw,
  SlidersHorizontal,
  Sparkles,
} from 'lucide-react'
import { AuthenticatedImage, downloadProtectedAsset } from '@/components/authenticated-image'
import { GenerationCost, useGenerationCost } from '@/components/generation-cost'
import { useAccount } from '@/components/account-provider'
import { ImageComparisonDialog } from '@/components/image-comparison-dialog'
import {
  generationStatusLabels,
  useGenerationTask,
} from '@/components/workbench/use-generation-task'
import { getAccessToken, uploadAsset } from '@/lib/api'
import {
  compatibleImageParameters,
  modelCompatibilityIssue,
  type PublicImageModel,
} from '@/lib/generation-models'
import {
  productApi,
  productPurposes,
  productPurposeLabel,
  productCreationDraftKey,
  restoreProductCreationDraft,
  type CommerceProduct,
  type ProductPurpose,
  type ProductVersion,
} from '@/lib/products'
import { ProductMaskEditor } from './product-mask-editor'
import styles from './products.module.css'

export function ProductCreation({
  product,
  dirty,
  editorBusy,
  models,
  onProductUpdated,
}: {
  product: CommerceProduct
  dirty: boolean
  editorBusy: boolean
  models: PublicImageModel[]
  onProductUpdated: (product: CommerceProduct) => void
}) {
  const { account } = useAccount()
  const owner = account.user?.id ?? ''
  const [initial] = useState(() => restoreProductCreationDraft(owner, product.id))
  const [purpose, setPurpose] = useState<ProductPurpose>(initial.purpose)
  const [instructions, setInstructions] = useState(initial.instructions)
  const [modelId, setModelId] = useState(initial.modelId)
  const [aspectRatio, setAspectRatio] = useState<string>(initial.aspectRatio)
  const [resolution, setResolution] = useState<string>(initial.resolution)
  const [count, setCount] = useState(initial.count)
  const [versions, setVersions] = useState<ProductVersion[]>([])
  const [nextCursor, setNextCursor] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [revision, setRevision] = useState(0)
  const [adopting, setAdopting] = useState('')
  const [editing, setEditing] = useState<ProductVersion | null>(null)
  const [comparison, setComparison] = useState<ProductVersion | null>(null)
  const [loadingMore, setLoadingMore] = useState(false)
  const active = useRef(true)
  const generation = useGenerationTask(`product:${product.id}`)
  const eligibleModels = models.filter((item) => item.capabilities?.referenceImages !== false)
  const selected = eligibleModels.find((item) => item.id === modelId)
  const cost = useGenerationCost(selected?.id, count)
  const pending = generation.isSubmitting || generation.isGenerating
  const compatibility = modelCompatibilityIssue(selected, {
    aspectRatio,
    resolution,
    hasImages: true,
    requiresImages: true,
  })
  useEffect(() => {
    active.current = true
    return () => {
      active.current = false
    }
  }, [])
  useEffect(() => {
    try {
      localStorage.setItem(
        productCreationDraftKey(owner, product.id),
        JSON.stringify({ purpose, instructions, modelId, aspectRatio, resolution, count }),
      )
    } catch {
      /* Saved product records and generation tasks remain available on the server. */
    }
  }, [owner, product.id, purpose, instructions, modelId, aspectRatio, resolution, count])
  useEffect(() => {
    if (modelId) return
    const model = eligibleModels.find((item) => item.isDefault) ?? eligibleModels[0]
    if (model) {
      setModelId(model.id)
      const values = compatibleImageParameters(model, { aspectRatio, resolution })
      setAspectRatio(values.aspectRatio)
      setResolution(values.resolution)
    }
  }, [models, modelId])
  useEffect(() => {
    const controller = new AbortController()
    setLoading(true)
    setError('')
    productApi
      .versions(product.id, '', controller.signal)
      .then((data) => {
        if (controller.signal.aborted) return
        setVersions(data.versions ?? [])
        setNextCursor(data.nextCursor ?? '')
      })
      .catch((error) => {
        if (!controller.signal.aborted)
          setError(error instanceof Error ? error.message : '图片读取失败')
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false)
      })
    return () => controller.abort()
  }, [product.id, revision])
  const delivered = generation.generationTask?.resultImages?.length ?? 0
  useEffect(() => {
    if (delivered || generation.generationTask?.status === 'succeeded')
      setRevision((value) => value + 1)
  }, [generation.generationTask?.id, generation.generationTask?.status, delivered])

  async function more() {
    if (!nextCursor || loadingMore) return
    setLoadingMore(true)
    try {
      const data = await productApi.versions(product.id, nextCursor)
      if (!active.current) return
      setVersions((items) => [
        ...items,
        ...data.versions.filter((item) => !items.some((old) => old.assetId === item.assetId)),
      ])
      setNextCursor(data.nextCursor ?? '')
    } catch (error) {
      if (active.current) setError(error instanceof Error ? error.message : '读取失败')
    } finally {
      if (active.current) setLoadingMore(false)
    }
  }
  async function submit(mask?: File, editInstructions?: string): Promise<boolean> {
    if (!selected || dirty || editorBusy || pending) return false
    let submitted = false
    setError('')
    setNotice('')
    let maskAssetId: string | undefined
    if (mask) {
      maskAssetId = await uploadAsset(mask, getAccessToken())
      if (!active.current) return false
    }
    await generation.submit({
      productFiles: [],
      referenceFiles: [],
      buildPayload: () => ({
        mode: 'general',
        model: selected.model,
        endpointId: selected.id,
        aspectRatio,
        resolution,
        count: mask ? 1 : count,
        prompt: editInstructions || instructions || productPurposeLabel(purpose),
        referenceAssetIds: [],
        style: 'unspecified',
        referenceStrength: 'high',
        productId: product.id,
        productVersion: product.version,
        productPurpose: mask && editing ? editing.purpose : purpose,
        productInstructions: editInstructions ?? instructions,
        ...(product.projectId ? { projectId: product.projectId } : {}),
        ...(mask && editing ? { parentAssetId: editing.assetId, maskAssetId } : {}),
      }),
      onAuthRequired: () => setError('登录状态已失效，请重新登录'),
      onSubmitted: () => {
        submitted = true
      },
    })
    return submitted
  }
  async function adopt(version: ProductVersion) {
    setAdopting(version.assetId)
    setError('')
    setNotice('')
    const token = getAccessToken()
    try {
      const data = await productApi.adopt(product.id, version.assetId)
      if (!active.current || token !== getAccessToken()) return
      onProductUpdated(data.product)
      setNotice(`已将这张图片设为${productPurposeLabel(version.purpose)}的采用版本`)
    } catch (error) {
      if (active.current) setError(error instanceof Error ? error.message : '采用失败')
    } finally {
      if (active.current) setAdopting('')
    }
  }
  const blocked = dirty
    ? '档案有未保存的修改，请先保存再生成。'
    : !product.productAssetIds.length
      ? '请在商品档案中添加至少 1 张商品原图。'
      : !selected
        ? '暂无支持商品参考图的可用模型。'
        : compatibility
  return (
    <>
      <section className={styles.creation} aria-label="选择用途与生成">
        <div className={styles.sectionHead}>
          <div>
            <h2>这次要做什么图片？</h2>
            <p>根据已保存的商品档案生成，所有结果归入当前商品。</p>
          </div>
        </div>
        <div className={styles.purposes} role="group" aria-label="图片用途">
          {productPurposes.map((item) => (
            <button
              key={item.value}
              type="button"
              aria-pressed={purpose === item.value}
              onClick={() => setPurpose(item.value)}
              disabled={pending}
            >
              <strong>{item.label}</strong>
              <span>{item.description}</span>
            </button>
          ))}
        </div>
        <label className={styles.instruction}>
          补充要求（选填）
          <textarea
            value={instructions}
            rows={3}
            maxLength={2000}
            onChange={(event) => setInstructions(event.target.value)}
            placeholder="描述本次想要的场景、构图和光线。商品资料会自动带入。"
            disabled={pending}
          />
        </label>
        <div className={styles.settings}>
          <label>
            生图模型
            <select
              value={modelId}
              disabled={pending}
              onChange={(event) => {
                const next = eligibleModels.find((item) => item.id === event.target.value)
                setModelId(event.target.value)
                const parameters = compatibleImageParameters(next, { aspectRatio, resolution })
                setAspectRatio(parameters.aspectRatio)
                setResolution(parameters.resolution)
              }}
            >
              {!selected && <option value="">选择模型</option>}
              {eligibleModels.map((model) => (
                <option key={model.id} value={model.id}>
                  {model.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            画面比例
            <select
              value={aspectRatio}
              disabled={pending}
              onChange={(event) => setAspectRatio(event.target.value)}
            >
              {(selected?.capabilities?.aspectRatios ?? ['1:1', '3:4', '4:3', '9:16', '16:9']).map(
                (ratio) => (
                  <option key={ratio}>{ratio}</option>
                ),
              )}
            </select>
          </label>
          <label>
            清晰度
            <select
              value={resolution}
              disabled={pending}
              onChange={(event) => setResolution(event.target.value)}
            >
              {(selected?.capabilities?.resolutions ?? ['1K', '2K', '4K']).map((value) => (
                <option key={value}>{value}</option>
              ))}
            </select>
          </label>
          <label>
            生成张数
            <select
              value={count}
              disabled={pending}
              onChange={(event) => setCount(Number(event.target.value))}
            >
              {[1, 2, 3, 4].map((value) => (
                <option key={value} value={value}>
                  {value} 张
                </option>
              ))}
            </select>
          </label>
        </div>
        {blocked && (
          <p role="status" className={styles.hint}>
            {blocked}
          </p>
        )}
        <div className={styles.generateFooter}>
          <GenerationCost {...cost} />
          <button
            className="studio-primary"
            type="button"
            disabled={
              Boolean(blocked) || pending || editorBusy || !cost.quote?.canAfford || cost.pending
            }
            onClick={() => void submit()}
          >
            {pending ? (
              <LoaderCircle className={styles.spinner} size={17} />
            ) : (
              <Sparkles size={17} />
            )}
            {generation.isSubmitting
              ? '正在提交…'
              : generation.isGenerating
                ? '正在生成…'
                : `生成${productPurposeLabel(purpose)}`}
          </button>
        </div>
        {pending && (
          <p className={styles.taskStatus} role="status">
            {generationStatusLabels[generation.generationTask?.status ?? ''] || '正在提交生成任务'}
            。离开页面后任务仍会继续。
          </p>
        )}
        {generation.notice && (
          <p
            role={generation.notice.kind === 'error' ? 'alert' : 'status'}
            className={generation.notice.kind === 'error' ? styles.error : styles.notice}
          >
            {generation.notice.message}
          </p>
        )}
        {generation.generationTask?.errorMessage && !pending && (
          <p className={styles.error} role="alert">
            {generation.generationTask.errorMessage}
          </p>
        )}
      </section>
      <section className={styles.versions} aria-label="商品图片版本">
        <div className={styles.sectionHead}>
          <div>
            <h2>候选与采用版本</h2>
            <p>每种用途可采用一张图片，随时可以改用旧版本。</p>
          </div>
          <button
            className="studio-secondary"
            type="button"
            disabled={loading}
            onClick={() => setRevision((value) => value + 1)}
          >
            <RefreshCw size={15} />
            刷新
          </button>
        </div>
        {error && (
          <p role="alert" className={styles.error}>
            {error}
          </p>
        )}
        {notice && (
          <p role="status" className={styles.notice}>
            {notice}
          </p>
        )}
        {loading && !versions.length ? (
          <p role="status" className={styles.empty}>
            正在读取图片版本…
          </p>
        ) : !versions.length ? (
          <div className={styles.empty}>
            <ImagePlus size={32} />
            <strong>这里会保存这个商品的每次生成</strong>
            <p>先选择图片用途，生成第一组候选图。</p>
          </div>
        ) : (
          <div className={styles.versionGrid}>
            {versions.map((version) => {
              const adopted = product.adoptedAssetIds?.[version.purpose] === version.assetId
              const canEdit = Boolean(selected?.capabilities?.maskEditing)
              return (
                <article
                  key={version.assetId}
                  className={`${styles.versionCard}${adopted ? ` ${styles.adopted}` : ''}`}
                >
                  <button
                    className={styles.versionImage}
                    type="button"
                    aria-label={`查看${productPurposeLabel(version.purpose)}版本`}
                    onClick={() => setComparison(version)}
                  >
                    <AuthenticatedImage
                      path={version.thumbnailPath || version.contentPath}
                      alt={`${product.name} · ${productPurposeLabel(version.purpose)}`}
                    />
                  </button>
                  <div className={styles.versionMeta}>
                    <strong>{productPurposeLabel(version.purpose)}</strong>
                    {adopted && (
                      <span>
                        <Check size={13} />
                        已采用
                      </span>
                    )}
                    <p>
                      {version.parentAssetId ? '局部修改版本' : '生成版本'} · {version.width} ×{' '}
                      {version.height}
                    </p>
                  </div>
                  <div className={styles.versionActions}>
                    <button
                      type="button"
                      className={adopted ? 'studio-secondary' : 'studio-primary'}
                      disabled={Boolean(adopting) || adopted}
                      onClick={() => void adopt(version)}
                    >
                      {adopting === version.assetId ? '保存中…' : adopted ? '当前采用' : '采用此图'}
                    </button>
                    <button
                      type="button"
                      className="studio-secondary"
                      disabled={!canEdit || pending || dirty || editorBusy}
                      title={
                        !canEdit
                          ? '当前模型暂未开放局部修改，请选择支持的模型'
                          : dirty
                            ? '请先保存商品档案'
                            : '涂抹需要修改的区域'
                      }
                      onClick={() => {
                        generation.setNotice(null)
                        setEditing(version)
                      }}
                    >
                      <SlidersHorizontal size={14} />
                      局部修改
                    </button>
                    <button
                      type="button"
                      className={styles.iconButton}
                      aria-label={`下载${productPurposeLabel(version.purpose)}图片`}
                      onClick={() => {
                        void downloadProtectedAsset(
                          version.contentPath,
                          `${product.name}-${productPurposeLabel(version.purpose)}.png`,
                        ).catch((error) =>
                          setError(error instanceof Error ? error.message : '下载失败'),
                        )
                      }}
                    >
                      <Download size={17} />
                    </button>
                  </div>
                </article>
              )
            })}
          </div>
        )}
        {nextCursor && (
          <div className={styles.loadMore}>
            <button className="studio-secondary" disabled={loadingMore} onClick={() => void more()}>
              {loadingMore ? '正在加载…' : '加载更多版本'}
            </button>
          </div>
        )}
      </section>
      {editing && selected && (
        <ProductMaskEditor
          version={editing}
          modelId={selected.id}
          modelName={selected.name}
          submissionError={
            generation.notice?.kind === 'error' ? generation.notice.message : undefined
          }
          onSubmit={(mask, text) => submit(mask, text)}
          onClose={() => setEditing(null)}
        />
      )}
      {comparison && (
        <ImageComparisonDialog
          candidates={[
            ...product.productAssetIds.slice(0, 1).map((assetId) => ({
              id: assetId,
              path: `/v1/assets/${encodeURIComponent(assetId)}/content`,
              label: '商品原图',
            })),
            ...versions.map((version) => ({
              id: version.assetId,
              path: version.contentPath,
              label: `${productPurposeLabel(version.purpose)}${product.adoptedAssetIds?.[version.purpose] === version.assetId ? '（已采用）' : ''}`,
            })),
          ]}
          initialLeft={comparison.contentPath}
          initialRight={
            comparison.parentAssetId
              ? `/v1/assets/${encodeURIComponent(comparison.parentAssetId)}/content`
              : product.productAssetIds[0]
                ? `/v1/assets/${encodeURIComponent(product.productAssetIds[0])}/content`
                : undefined
          }
          onClose={() => setComparison(null)}
        />
      )}
    </>
  )
}
