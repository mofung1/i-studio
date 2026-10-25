'use client'

import { useEffect, useId, useRef, useState, type FormEvent } from 'react'
import { apiBaseUrl, getAccessToken, uploadAsset } from '@/lib/api'
import { type CreationImage, isStoredImage } from '@/lib/creation-images'
import { libraryRequest } from '@/lib/library'
import type { InspirationSubmission } from '@/lib/inspiration-submissions'
import { Field, FieldGroup, FieldLabel } from '@/components/ui/form-field'
import { LibraryDialog, LibrarySelect } from './library-controls'
import { AssetPicker } from './workbench/asset-picker'
import { AuthenticatedImage } from './authenticated-image'
import { InspirationSubmissionCover } from './inspiration-submission-cover'
import { DialogActions } from './dialog-actions'

export interface SubmissionSeed {
  id: string
  title: string
  prompt: string
  category: string
}
function SelectedCover({ image }: { image: CreationImage }) {
  const [url, setUrl] = useState('')
  useEffect(() => {
    if (isStoredImage(image)) return
    const source = URL.createObjectURL(image)
    setUrl(source)
    return () => URL.revokeObjectURL(source)
  }, [image])
  return (
    <div className="submission-cover">
      {isStoredImage(image) ? (
        <AuthenticatedImage path={image.thumbnailPath} alt="所选效果封面" />
      ) : url ? (
        <img src={url} alt="所选效果封面" />
      ) : null}
    </div>
  )
}

export function InspirationSubmissionEditor({
  item,
  seed,
  onClose,
  onSaved,
}: {
  item?: InspirationSubmission
  seed?: SubmissionSeed
  onClose: () => void
  onSaved: () => void
}) {
  const formId = useId()
  const [title, setTitle] = useState(seed?.title ?? item?.title ?? '')
  const [prompt, setPrompt] = useState(seed?.prompt ?? item?.prompt ?? '')
  const [instructions, setInstructions] = useState(item?.instructions ?? '')
  const [requiresReference, setRequiresReference] = useState(item?.requiresReference ?? false)
  const [categoryId, setCategoryId] = useState(seed ? '' : (item?.categoryId ?? ''))
  const [enabled, setEnabled] = useState(false)
  const [categories, setCategories] = useState<Array<{ id: string; category: string }>>([])
  const [cover, setCover] = useState<CreationImage | null>(null)
  const [picker, setPicker] = useState(false)
  const [consent, setConsent] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [categoryAttempt, setCategoryAttempt] = useState(0)
  const key = useRef(crypto.randomUUID())
  const pending = useRef(false)
  const active = useRef(true)
  const errorRef = useRef<HTMLParagraphElement>(null)
  useEffect(() => {
    active.current = true
    return () => {
      active.current = false
    }
  }, [])
  useEffect(() => {
    const controller = new AbortController()
    fetch(`${apiBaseUrl}/v1/inspiration/submission-settings`, {
      signal: controller.signal,
      cache: 'no-store',
    })
      .then(async (response) => {
        if (!response.ok) throw new Error('分类加载失败，请重试')
        return response.json()
      })
      .then((data) => {
        if (!controller.signal.aborted) {
          setCategories(data.categories)
          setEnabled(data.settings.enabled)
          if (!data.settings.enabled) setError('投稿暂未开放，当前内容尚未提交。')
          if (seed)
            setCategoryId(
              data.categories.find(
                (category: { category: string }) => category.category === seed.category,
              )?.id ?? '',
            )
        }
      })
      .catch((reason) => {
        if (!controller.signal.aborted) setError(reason.message)
      })
    return () => controller.abort()
  }, [categoryAttempt, item, seed])
  function changed() {
    key.current = crypto.randomUUID()
    setError('')
  }
  function close() {
    if (!busy) onClose()
  }
  async function submit(event: FormEvent) {
    event.preventDefault()
    if (pending.current) return
    if (!enabled || !categoryId || (!cover && !item) || !consent) {
      setError('请选择分类和效果封面，并确认公开内容')
      errorRef.current?.focus()
      return
    }
    pending.current = true
    setBusy(true)
    setError('')
    const token = getAccessToken()
    try {
      if (!token) throw new Error('请先登录')
      const coverAssetId = cover ? await uploadAsset(cover, token) : ''
      if (!active.current || token !== getAccessToken()) return
      await libraryRequest(
        `personal/inspiration-submissions${item ? `/${encodeURIComponent(item.id)}` : ''}`,
        {
          method: item ? 'PUT' : 'POST',
          body: JSON.stringify({
            title,
            prompt,
            categoryId,
            instructions,
            requiresReference,
            coverAssetId,
            personalPromptId: item?.personalPromptId ?? seed?.id ?? '',
            version: item?.version ?? 0,
            requestKey: key.current,
            publishConsent: consent,
          }),
        },
      )
      if (active.current && token === getAccessToken()) onSaved()
    } catch (reason) {
      if (active.current && token === getAccessToken()) {
        setError(reason instanceof Error ? reason.message : '提交失败，请重试')
        errorRef.current?.focus()
      }
    } finally {
      pending.current = false
      if (active.current) setBusy(false)
    }
  }
  return (
    <LibraryDialog
      title={item ? '修改并重新提交' : '分享提示词'}
      onClose={close}
      footer={
        <DialogActions>
          <button type="button" className="studio-secondary" disabled={busy} onClick={close}>
            取消
          </button>
          <button
            form={formId}
            className="studio-primary"
            type="submit"
            disabled={busy || !categories.length || !enabled}
          >
            {busy ? '正在提交…' : '提交审核'}
          </button>
        </DialogActions>
      }
    >
      <form id={formId} className="submission-form" onSubmit={(event) => void submit(event)}>
        {item?.reviewReason && (
          <p className="submission-review-reason">上次审核说明：{item.reviewReason}</p>
        )}
        <fieldset disabled={busy}>
          <legend className="sr-only">投稿内容</legend>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="submission-title">标题</FieldLabel>
              <input
                id="submission-title"
                className="library-input"
                required
                maxLength={160}
                value={title}
                onChange={(event) => {
                  changed()
                  setTitle(event.target.value)
                }}
              />
            </Field>
            <Field>
              <FieldLabel>分类</FieldLabel>
              <LibrarySelect
                label="投稿分类"
                value={categoryId}
                onChange={(value) => {
                  // Radix's hidden form select can emit an empty value when async options arrive.
                  if (!value) return
                  changed()
                  setCategoryId(value)
                }}
                options={categories.map((category) => [category.id, category.category])}
              />
              {!categories.length && (
                <button
                  type="button"
                  className="library-command"
                  onClick={() => setCategoryAttempt((value) => value + 1)}
                >
                  重新加载分类
                </button>
              )}
            </Field>
            <Field>
              <FieldLabel htmlFor="submission-prompt">提示词</FieldLabel>
              <textarea
                id="submission-prompt"
                className="library-input submission-prompt"
                required
                maxLength={20000}
                value={prompt}
                onChange={(event) => {
                  changed()
                  setPrompt(event.target.value)
                }}
              />
            </Field>
            <Field>
              <FieldLabel>效果封面</FieldLabel>
              {cover ? (
                <SelectedCover image={cover} />
              ) : item ? (
                <InspirationSubmissionCover path={item.coverPath} title={item.title} />
              ) : null}
              <button type="button" className="studio-secondary" onClick={() => setPicker(true)}>
                {cover || item ? '更换封面' : '选择或上传封面'}
              </button>
              <small>选择自己的生成作品或上传图片；请确保封面与提示词效果相符。</small>
            </Field>
            <Field>
              <label className="submission-check">
                <input
                  type="checkbox"
                  checked={requiresReference}
                  onChange={(event) => {
                    changed()
                    setRequiresReference(event.target.checked)
                  }}
                />
                此提示词需要参考图
              </label>
            </Field>
            <Field>
              <FieldLabel htmlFor="submission-instructions">使用说明（选填）</FieldLabel>
              <textarea
                id="submission-instructions"
                className="library-input"
                maxLength={1000}
                rows={3}
                value={instructions}
                onChange={(event) => {
                  changed()
                  setInstructions(event.target.value)
                }}
                placeholder="例如适合的场景、参考图要求或使用参数"
              />
            </Field>
            <Field>
              <label className="submission-check">
                <input
                  type="checkbox"
                  required
                  checked={consent}
                  onChange={(event) => {
                    changed()
                    setConsent(event.target.checked)
                  }}
                />
                我确认有权分享以上文字和图片，同意审核通过后公开并供其他用户复制使用。
              </label>
            </Field>
          </FieldGroup>
        </fieldset>
        <p
          className="settings-error"
          role={error ? 'alert' : undefined}
          tabIndex={-1}
          ref={errorRef}
        >
          {error}
        </p>
      </form>
      {picker && (
        <AssetPicker
          excludedIds={[]}
          limit={1}
          onClose={() => setPicker(false)}
          onSelect={(images) => {
            changed()
            setCover(images[0] ?? null)
          }}
        />
      )}
    </LibraryDialog>
  )
}
