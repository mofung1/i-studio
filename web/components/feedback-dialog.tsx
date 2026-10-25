'use client'

import { useEffect, useId, useRef, useState, type FormEvent } from 'react'
import { CheckCircle2, ImagePlus, X } from 'lucide-react'
import { useAccount } from './account-provider'
import { AccountAccess } from './account-access'
import { LibraryDialog } from './library-controls'
import { DialogActions } from './dialog-actions'
import { Field, FieldGroup, FieldLabel } from './ui/form-field'
import { apiBaseUrl, getAccessToken, readApiError } from '@/lib/api'
import { feedbackFilesError } from '@/lib/feedback'

function FeedbackPreview({ file }: { file: File }) {
  const [source, setSource] = useState('')
  useEffect(() => {
    const url = URL.createObjectURL(file)
    setSource(url)
    return () => URL.revokeObjectURL(url)
  }, [file])
  return source ? <img src={source} alt={file.name} /> : null
}

export function FeedbackDialog({ pagePath, onClose }: { pagePath: string; onClose: () => void }) {
  const { account } = useAccount()
  const formId = useId()
  const contentId = useId()
  const imagesId = useId()
  const errorId = useId()
  const [content, setContent] = useState('')
  const [files, setFiles] = useState<File[]>([])
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [saved, setSaved] = useState(false)
  const requestKey = useRef(crypto.randomUUID())
  const pending = useRef(false)
  const active = useRef(true)
  const controller = useRef<AbortController | null>(null)
  const errorRef = useRef<HTMLParagraphElement>(null)
  useEffect(() => {
    active.current = true
    return () => {
      active.current = false
      controller.current?.abort()
    }
  }, [])
  function changed() {
    requestKey.current = crypto.randomUUID()
    setError('')
  }
  function close() {
    if (!pending.current) onClose()
  }
  async function submit(event: FormEvent) {
    event.preventDefault()
    if (pending.current) return
    const problem = !content.trim() ? '请填写反馈内容' : feedbackFilesError(files)
    if (problem) {
      setError(problem)
      return
    }
    pending.current = true
    setBusy(true)
    setError('')
    const token = getAccessToken()
    controller.current = new AbortController()
    const timer = window.setTimeout(() => controller.current?.abort(), 60000)
    try {
      if (!token) throw new Error('请先登录后提交反馈')
      const body = new FormData()
      body.append('content', content.trim())
      body.append('pagePath', pagePath)
      body.append('requestKey', requestKey.current)
      files.forEach((file) => body.append('images', file))
      const response = await fetch(`${apiBaseUrl}/v1/feedback`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body,
        signal: controller.current.signal,
      })
      if (!response.ok) throw new Error(await readApiError(response, '提交失败，请重试'))
      const result = (await response.json()) as { id?: string }
      if (!result.id) throw new Error('暂时无法确认提交结果，请重试')
      if (active.current && token === getAccessToken()) setSaved(true)
    } catch (reason) {
      if (active.current && token === getAccessToken()) {
        setError(
          reason instanceof Error && reason.name !== 'AbortError'
            ? reason.message
            : '连接超时或中断，内容已保留，请重试',
        )
      }
    } finally {
      window.clearTimeout(timer)
      pending.current = false
      if (active.current) setBusy(false)
    }
  }
  useEffect(() => {
    if (error) errorRef.current?.focus()
  }, [error])
  return (
    <LibraryDialog
      title="意见反馈"
      onClose={close}
      footer={
        <DialogActions>
          <button type="button" className="studio-secondary" onClick={close} disabled={busy}>
            {saved || !account.authenticated ? '关闭' : '取消'}
          </button>
          {account.authenticated && !saved && (
            <button
              type="submit"
              form={formId}
              className="studio-primary"
              disabled={busy || !content.trim()}
            >
              {busy ? '正在提交…' : '提交反馈'}
            </button>
          )}
        </DialogActions>
      }
    >
      {!account.authenticated ? (
        <AccountAccess
          compact
          title="登录后提交反馈"
          description="告诉我们你遇到的问题或改进建议。"
          returnTo={pagePath}
          onLogin={close}
        />
      ) : saved ? (
        <div className="feedback-success" role="status">
          <CheckCircle2 size={36} aria-hidden="true" />
          <strong>反馈已收到，感谢你的建议</strong>
        </div>
      ) : (
        <form id={formId} onSubmit={submit} className="feedback-form" aria-busy={busy}>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor={contentId}>反馈内容</FieldLabel>
              <textarea
                id={contentId}
                value={content}
                onChange={(event) => {
                  setContent(event.target.value)
                  changed()
                }}
                required
                maxLength={2000}
                rows={7}
                disabled={busy}
                placeholder="描述你遇到的问题，或希望改进的地方"
                aria-describedby={error ? errorId : undefined}
              />
              <small className="feedback-count">{Array.from(content).length} / 2000</small>
            </Field>
            <Field>
              <FieldLabel htmlFor={imagesId}>上传图片（选填）</FieldLabel>
              <div className="feedback-images">
                {files.map((file, index) => (
                  <div
                    className="feedback-image"
                    key={`${index}-${file.name}-${file.lastModified}`}
                  >
                    <FeedbackPreview file={file} />
                    <button
                      type="button"
                      aria-label={`移除第 ${index + 1} 张图片`}
                      disabled={busy}
                      onClick={() => {
                        setFiles(files.filter((_, i) => i !== index))
                        changed()
                      }}
                    >
                      <X size={16} aria-hidden="true" />
                    </button>
                  </div>
                ))}
                {files.length < 3 && (
                  <label
                    className={`feedback-upload${busy ? ' is-disabled' : ''}`}
                    htmlFor={imagesId}
                  >
                    <ImagePlus size={24} aria-hidden="true" />
                    <span>添加图片</span>
                  </label>
                )}
              </div>
              <input
                id={imagesId}
                className="feedback-file-input"
                type="file"
                accept="image/jpeg,image/png,image/webp"
                multiple
                disabled={busy || files.length >= 3}
                aria-label="选择反馈图片"
                onChange={(event) => {
                  const next = [...files, ...Array.from(event.target.files ?? [])]
                  const problem = feedbackFilesError(next)
                  event.target.value = ''
                  if (problem) {
                    setError(problem)
                    return
                  }
                  setFiles(next)
                  changed()
                }}
              />
              <small>最多 3 张，支持 JPG、PNG、WebP，每张不超过 5MB。</small>
            </Field>
          </FieldGroup>
          {error && (
            <p id={errorId} ref={errorRef} tabIndex={-1} className="settings-error" role="alert">
              {error}
            </p>
          )}
        </form>
      )}
    </LibraryDialog>
  )
}
