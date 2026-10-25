'use client'

import { useId, useState } from 'react'
import { DialogActions } from './dialog-actions'
import { LibraryDialog } from './library-controls'
import {
  applicationFor,
  presetDescription,
  promptVariables,
  type PersonalApplication,
  type PersonalPrompt,
} from '@/lib/personal-prompts'

export function PersonalPromptApply({
  item,
  onClose,
  onApply,
}: {
  item: PersonalPrompt
  onClose: () => void
  onApply: (
    application: PersonalApplication,
    values: Record<string, string>,
  ) => void | Promise<void>
}) {
  const formId = useId()
  const [values, setValues] = useState<Record<string, string>>({})
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const variables = promptVariables(item.prompt)
  return (
    <LibraryDialog
      title={`应用 ${item.title}`}
      onClose={() => {
        if (!busy) onClose()
      }}
      footer={
        <DialogActions>
          <button className="studio-secondary" type="button" disabled={busy} onClick={onClose}>
            取消
          </button>
          <button form={formId} type="submit" className="studio-primary" disabled={busy}>
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
          setError('')
          setBusy(true)
          void Promise.resolve()
            .then(() => onApply(applicationFor(item, values), values))
            .catch((reason) => setError(reason instanceof Error ? reason.message : '应用失败'))
            .finally(() => setBusy(false))
        }}
      >
        <p className="personal-apply-preview">{item.prompt || '只应用创作参数'}</p>
        {item.kind === 'preset' && (
          <p className="personal-preset-summary">{presetDescription(item.config)}</p>
        )}
        {variables.map((name) => (
          <label key={name}>
            {name}
            <input
              aria-label={`变量 ${name}`}
              required
              maxLength={500}
              value={values[name] ?? ''}
              disabled={busy}
              onChange={(event) =>
                setValues((previous) => ({ ...previous, [name]: event.target.value }))
              }
            />
          </label>
        ))}
        <p className="library-count">应用后可以继续编辑，确认内容后再生成。</p>
        {error && (
          <p role="alert" className="settings-error">
            {error}
          </p>
        )}
      </form>
    </LibraryDialog>
  )
}
