'use client'

import { useEffect, useRef, useState, type ChangeEvent, type ReactNode } from 'react'
import { Check, ChevronDown, ImagePlus, LoaderCircle, Save, Sparkles, X } from 'lucide-react'
import { AuthenticatedImage } from '@/components/authenticated-image'
import { getAccessToken, uploadAsset } from '@/lib/api'
import { frontendRequest, FrontendRequestError } from '@/lib/frontend-request'
import {
  productApi,
  productDraftKey,
  productFields,
  restoreProductDraft,
  sameProductFields,
  type CommerceProduct,
  type ProductAnalysis,
  type ProductDraft,
} from '@/lib/products'
import styles from './products.module.css'

export function ProductEditor({
  owner,
  product,
  defaultProjectId = '',
  visionEnabled,
  workflowHeader,
  onSaved,
  onDirty,
  onBusy,
}: {
  owner: string
  product?: CommerceProduct
  defaultProjectId?: string
  visionEnabled: boolean
  workflowHeader?: ReactNode
  onSaved: (product: CommerceProduct) => void
  onDirty: (dirty: boolean) => void
  onBusy: (busy: boolean) => void
}) {
  const [draft, setDraft] = useState(() => restoreProductDraft(owner, product, defaultProjectId))
  const [open, setOpen] = useState(
    !product ||
      !sameProductFields(
        restoreProductDraft(owner, product, defaultProjectId),
        productFields(product),
      ),
  )
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [storageError, setStorageError] = useState(false)
  const [analysis, setAnalysis] = useState<ProductAnalysis | null>(null)
  const [projects, setProjects] = useState<Array<{ id: string; name: string }>>([])
  const alive = useRef(true)
  const dirty = !sameProductFields(draft, productFields(product))
  const stale = Boolean(product && dirty && draft.version !== product.version)
  const key = productDraftKey(owner, product?.id, defaultProjectId)
  useEffect(() => {
    alive.current = true
    return () => {
      alive.current = false
    }
  }, [])
  useEffect(() => {
    onDirty(dirty)
  }, [dirty, onDirty])
  useEffect(() => {
    onBusy(Boolean(busy))
    return () => onBusy(false)
  }, [busy, onBusy])
  useEffect(() => {
    try {
      if (dirty) localStorage.setItem(key, JSON.stringify(draft))
      else localStorage.removeItem(key)
      setStorageError(false)
    } catch {
      setStorageError(true)
    }
  }, [draft, dirty, key])
  useEffect(() => {
    const controller = new AbortController()
    frontendRequest<{ projects: Array<{ id: string; name: string }> }>('projects', {
      signal: controller.signal,
    })
      .then((data) => {
        if (!controller.signal.aborted) setProjects(data.projects ?? [])
      })
      .catch(() => {
        /* An existing project association is kept even when its label cannot be loaded. */
      })
    return () => controller.abort()
  }, [])

  function change<K extends keyof ProductDraft>(name: K, value: ProductDraft[K]) {
    setDraft((current) => ({ ...current, [name]: value }))
    setNotice('')
    setAnalysis(null)
  }
  async function save() {
    if (stale) {
      setError('商品档案已有更新，请先确认如何处理本地草稿')
      return
    }
    if (!draft.name.trim()) {
      setError('请填写商品名称')
      return
    }
    setBusy('save')
    setError('')
    setNotice('')
    const token = getAccessToken()
    try {
      const { product: saved } = await productApi.save(draft, product?.id)
      if (!alive.current || getAccessToken() !== token) return
      try {
        localStorage.removeItem(key)
      } catch {
        /* Saved on the server. */
      }
      setDraft(productFields(saved))
      onSaved(saved)
      setOpen(false)
      setNotice('商品档案已保存')
    } catch (error) {
      if (alive.current) setError(error instanceof Error ? error.message : '保存失败，草稿已保留')
      if (product && error instanceof FrontendRequestError && error.status === 409) {
        try {
          const { product: latest } = await productApi.get(product.id)
          if (alive.current && getAccessToken() === token) onSaved(latest)
        } catch {
          /* Keep the unsaved draft and original conflict message. */
        }
      }
    } finally {
      if (alive.current) setBusy('')
    }
  }
  async function upload(
    event: ChangeEvent<HTMLInputElement>,
    role: 'productAssetIds' | 'referenceAssetIds',
  ) {
    const files = Array.from(event.target.files ?? [])
    event.target.value = ''
    if (!files.length) return
    const total = draft.productAssetIds.length + draft.referenceAssetIds.length
    if (total + files.length > 6) {
      setError(`两类图片合计最多 6 张，目前还可添加 ${6 - total} 张`)
      return
    }
    if (files.some((file) => !['image/png', 'image/jpeg', 'image/webp'].includes(file.type))) {
      setError('请上传 PNG、JPG 或 WebP 图片')
      return
    }
    setBusy(role)
    setError('')
    setAnalysis(null)
    const token = getAccessToken()
    try {
      for (const file of files) {
        const assetId = await uploadAsset(file, token)
        if (!alive.current || getAccessToken() !== token) return
        setDraft((current) => ({ ...current, [role]: [...current[role], assetId] }))
      }
    } catch (error) {
      if (alive.current) setError(error instanceof Error ? error.message : '上传失败，请重试')
    } finally {
      if (alive.current) setBusy('')
    }
  }
  async function analyze() {
    setBusy('analyze')
    setError('')
    setAnalysis(null)
    const token = getAccessToken()
    try {
      const result = await productApi.analyze(draft)
      if (alive.current && token === getAccessToken()) setAnalysis(result)
    } catch (error) {
      if (alive.current)
        setError(error instanceof Error ? error.message : '分析失败，可以继续手动填写')
    } finally {
      if (alive.current) setBusy('')
    }
  }
  const totalImages = draft.productAssetIds.length + draft.referenceAssetIds.length
  return (
    <section className={styles.editor} aria-label="商品档案">
      {workflowHeader}
      <div className={styles.sectionHead}>
        <div>
          <h2>{product ? product.name : '建立商品档案'}</h2>
          <p>{product ? '图片与商品资料会带入每次创作。' : '先保存商品资料，后续生成直接复用。'}</p>
        </div>
        {product && (
          <button
            type="button"
            className="studio-secondary"
            onClick={() => setOpen(!open)}
            aria-expanded={open}
            disabled={Boolean(busy)}
          >
            <ChevronDown size={15} />
            {open ? '收起档案' : '编辑档案'}
          </button>
        )}
      </div>
      {!open && (
        <div className={styles.productSummary}>
          <div className={styles.summaryImages}>
            {draft.productAssetIds.slice(0, 4).map((id, index) => (
              <AuthenticatedImage
                key={id}
                path={`/v1/assets/${encodeURIComponent(id)}/thumbnail`}
                alt={`商品原图 ${index + 1}`}
              />
            ))}
          </div>
          <div>
            <p>{draft.description || '还没有填写商品描述'}</p>
            <span>
              {draft.productAssetIds.length} 张商品原图 · {draft.referenceAssetIds.length}{' '}
              张风格参考
            </span>
          </div>
        </div>
      )}
      {open && (
        <form
          className={styles.form}
          onSubmit={(event) => {
            event.preventDefault()
            void save()
          }}
        >
          {stale && (
            <div className={styles.analysis} role="alert">
              <strong>商品档案已有新版本，本地草稿尚未覆盖它</strong>
              <p>可以读取最新内容，或确认将当前草稿应用到最新版本后再保存。</p>
              <div className={styles.actions}>
                <button
                  type="button"
                  className="studio-secondary"
                  disabled={Boolean(busy)}
                  onClick={() => {
                    setDraft(productFields(product))
                    setError('')
                  }}
                >
                  载入最新档案
                </button>
                <button
                  type="button"
                  className="studio-secondary"
                  disabled={Boolean(busy)}
                  onClick={() => {
                    setDraft((value) => ({ ...value, version: product?.version }))
                    setError('')
                  }}
                >
                  继续使用当前草稿
                </button>
              </div>
            </div>
          )}
          <fieldset disabled={Boolean(busy)} className={styles.fields}>
            <div className={styles.twoColumns}>
              <label>
                商品名称
                <input
                  value={draft.name}
                  maxLength={120}
                  required
                  placeholder="例如：琥珀色香水 50 ml"
                  onChange={(event) => change('name', event.target.value)}
                />
              </label>
              <label>
                所属项目
                <select
                  value={draft.projectId}
                  onChange={(event) => change('projectId', event.target.value)}
                >
                  <option value="">不归入项目</option>
                  {draft.projectId && !projects.some((p) => p.id === draft.projectId) && (
                    <option value={draft.projectId}>当前项目</option>
                  )}
                  {projects.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <label>
              商品描述
              <textarea
                value={draft.description}
                maxLength={2000}
                rows={3}
                placeholder="填写品类、颜色、材质和商家确认的规格。"
                onChange={(event) => change('description', event.target.value)}
              />
            </label>
            <div className={styles.twoColumns}>
              <label>
                已确认的卖点
                <textarea
                  value={draft.sellingPoints}
                  maxLength={2000}
                  rows={3}
                  placeholder="每行一条，只填写确定的信息。"
                  onChange={(event) => change('sellingPoints', event.target.value)}
                />
              </label>
              <label>
                必须保留的细节
                <textarea
                  value={draft.preserveDetails}
                  maxLength={2000}
                  rows={3}
                  placeholder="例如：瓶身形状、琥珀色、标签与 Logo。"
                  onChange={(event) => change('preserveDetails', event.target.value)}
                />
              </label>
            </div>
            <div className={styles.twoColumns}>
              {(['productAssetIds', 'referenceAssetIds'] as const).map((role) => (
                <div key={role} className={styles.imageField}>
                  <div>
                    <strong>{role === 'productAssetIds' ? '商品原图' : '风格参考（选填）'}</strong>
                    <p>
                      {role === 'productAssetIds'
                        ? '提供真实外观、包装和细节。'
                        : '只参考光线、背景与画面风格。'}
                    </p>
                  </div>
                  <div className={styles.imageStrip}>
                    {draft[role].map((id, index) => (
                      <div key={id} className={styles.uploadedImage}>
                        <AuthenticatedImage
                          path={`/v1/assets/${encodeURIComponent(id)}/thumbnail`}
                          alt={`${role === 'productAssetIds' ? '商品原图' : '风格参考'} ${index + 1}`}
                        />
                        <button
                          type="button"
                          aria-label={`移除${role === 'productAssetIds' ? '商品原图' : '风格参考'} ${index + 1}`}
                          onClick={() =>
                            change(
                              role,
                              draft[role].filter((value) => value !== id),
                            )
                          }
                        >
                          <X size={13} />
                        </button>
                      </div>
                    ))}
                    {totalImages < 6 && (
                      <label className={styles.uploadButton}>
                        <ImagePlus size={19} />
                        <span>添加图片</span>
                        <input
                          aria-label={`上传${role === 'productAssetIds' ? '商品原图' : '风格参考'}`}
                          type="file"
                          accept="image/png,image/jpeg,image/webp"
                          multiple
                          onChange={(event) => void upload(event, role)}
                        />
                      </label>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </fieldset>
          <div className={styles.formToolbar}>
            <span>
              {totalImages}/6 张 ·{' '}
              {dirty
                ? storageError
                  ? '本地草稿不可用，请及时保存'
                  : '草稿已保存在此浏览器'
                : '档案已同步'}
            </span>
            <div>
              {visionEnabled && (
                <button
                  type="button"
                  className="studio-secondary"
                  disabled={Boolean(busy) || !draft.productAssetIds.length}
                  onClick={() => void analyze()}
                >
                  {busy === 'analyze' ? (
                    <LoaderCircle className={styles.spinner} size={15} />
                  ) : (
                    <Sparkles size={15} />
                  )}
                  识图整理资料
                </button>
              )}
              <button
                type="submit"
                className="studio-primary"
                disabled={
                  Boolean(busy) || stale || !draft.name.trim() || Boolean(product && !dirty)
                }
              >
                {busy === 'save' ? (
                  <LoaderCircle className={styles.spinner} size={15} />
                ) : (
                  <Save size={15} />
                )}
                保存档案
              </button>
            </div>
          </div>
          {analysis && (
            <div className={styles.analysis} aria-label="商品资料建议">
              <strong>核对以下建议，再应用到档案</strong>
              <dl>
                <dt>商品描述</dt>
                <dd>{analysis.analysis.description}</dd>
                <dt>卖点</dt>
                <dd>{analysis.analysis.sellingPoints || '没有足够信息，请手动补充'}</dd>
                <dt>保留细节</dt>
                <dd>{analysis.analysis.preserveDetails}</dd>
              </dl>
              {analysis.warnings?.map((warning) => (
                <p key={warning}>{warning}</p>
              ))}
              <div className={styles.actions}>
                <button
                  className="studio-secondary"
                  type="button"
                  onClick={() => setAnalysis(null)}
                >
                  不应用
                </button>
                <button
                  className="studio-primary"
                  type="button"
                  onClick={() => {
                    setDraft((current) => ({ ...current, ...analysis.analysis }))
                    setAnalysis(null)
                    setNotice('建议已填入，请核对并保存档案')
                  }}
                >
                  <Check size={15} />
                  应用建议
                </button>
              </div>
            </div>
          )}
        </form>
      )}
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
    </section>
  )
}
