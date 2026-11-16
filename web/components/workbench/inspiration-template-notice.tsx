'use client'

import { useId, useState } from 'react'
import type { InspirationTemplate } from '@/lib/inspiration-handoff'
import { promptVariables } from '@/lib/personal-prompts'
import { DialogActions } from '../dialog-actions'
import { LibraryDialog } from '../library-controls'
import type { useInspirationHandoff } from './use-inspiration-handoff'
import styles from '../inspiration-template.module.css'

export function InspirationTemplateNotice({
  template,
  referenceCount,
  onDismiss,
}: {
  template: InspirationTemplate
  referenceCount: number
  onDismiss: () => void
}) {
  return (
    <section className={styles.notice} aria-label="灵感模板使用说明">
      <div>
        <strong>灵感模板 · {template.title}</strong>
        <button type="button" className="settings-command" onClick={onDismiss}>
          取消模板
        </button>
      </div>
      {template.requiresReference && (
        <p role="status">
          {referenceCount > 0
            ? '已添加参考图，请核对图片是否符合模板说明。'
            : '此模板需要参考图，请先上传自己的素材。'}
        </p>
      )}
      {template.instructions && <p>使用说明：{template.instructions}</p>}
    </section>
  )
}

function InspirationVariablesDialog({
  template,
  onApply,
  onClose,
}: {
  template: InspirationTemplate
  onApply: (values: Record<string, string>) => Promise<void>
  onClose: () => void
}) {
  const formId = useId()
  const [values, setValues] = useState<Record<string, string>>({})
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  return (
    <LibraryDialog
      title={`填写模板 · ${template.title}`}
      onClose={() => {
        if (!busy) onClose()
      }}
      footer={
        <DialogActions>
          <button type="button" className="studio-secondary" disabled={busy} onClick={onClose}>
            取消
          </button>
          <button type="submit" form={formId} className="studio-primary" disabled={busy}>
            {busy ? '应用中…' : '应用到工作台'}
          </button>
        </DialogActions>
      }
    >
      <form
        id={formId}
        onSubmit={(event) => {
          event.preventDefault()
          if (busy) return
          setBusy(true)
          setError('')
          void onApply(values)
            .catch((reason) => setError(reason instanceof Error ? reason.message : '应用失败'))
            .finally(() => setBusy(false))
        }}
      >
        <p className="personal-apply-preview">{template.prompt}</p>
        {template.requiresReference && <p>此模板需要参考图，应用后请上传自己的素材。</p>}
        {template.instructions && <p>使用说明：{template.instructions}</p>}
        {promptVariables(template.prompt).map((name) => (
          <label key={name}>
            {name}
            <input
              aria-label={`变量 ${name}`}
              required
              maxLength={500}
              disabled={busy}
              value={values[name] ?? ''}
              onChange={(event) =>
                setValues((previous) => ({ ...previous, [name]: event.target.value }))
              }
            />
          </label>
        ))}
        {error && (
          <p className="settings-error" role="alert">
            {error}
          </p>
        )}
      </form>
    </LibraryDialog>
  )
}

export function InspirationHandoffStatus({
  handoff,
}: {
  handoff: ReturnType<typeof useInspirationHandoff>
}) {
  return (
    <>
      {handoff.loading && (
        <p className="library-feedback" role="status">
          正在带入灵感模板…
        </p>
      )}
      {handoff.error && (
        <div className="library-feedback is-error" role="alert">
          <span>{handoff.error}</span>
          <button type="button" onClick={handoff.retry}>
            重试
          </button>
          <button type="button" onClick={handoff.dismiss}>
            取消带入
          </button>
        </div>
      )}
      {handoff.pending && (
        <InspirationVariablesDialog
          key={handoff.pending.id}
          template={handoff.pending}
          onApply={handoff.applyVariables}
          onClose={handoff.dismiss}
        />
      )}
    </>
  )
}
