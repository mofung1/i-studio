'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { getAccessToken } from '@/lib/api'
import { libraryRequest } from '@/lib/library'
import {
  type InspirationSubmission,
  type SubmissionPage,
  submissionStatus,
} from '@/lib/inspiration-submissions'
import { LibraryDialog } from './library-controls'
import { DialogActions } from './dialog-actions'
import { InspirationSubmissionEditor, type SubmissionSeed } from './inspiration-submission-editor'

/** Keep the selected private text in this page; only its ID is used to find an earlier submission. */
export function PersonalPromptShare({
  source,
  onClose,
  onSaved,
}: {
  source: SubmissionSeed
  onClose: () => void
  onSaved: () => void
}) {
  const [existing, setExisting] = useState<InspirationSubmission | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [attempt, setAttempt] = useState(0)
  useEffect(() => {
    const controller = new AbortController()
    const token = getAccessToken()
    setLoading(true)
    setError('')
    setExisting(null)
    libraryRequest<SubmissionPage>(
      `personal/inspiration-submissions?personalPromptId=${encodeURIComponent(source.id)}`,
      { signal: controller.signal },
    )
      .then((data) => {
        if (!controller.signal.aborted && token === getAccessToken())
          setExisting(data.submissions.find((item) => item.personalPromptId === source.id) ?? null)
      })
      .catch((reason) => {
        if (!controller.signal.aborted && token === getAccessToken())
          setError(reason instanceof Error ? reason.message : '投稿状态读取失败，请重试')
      })
      .finally(() => {
        if (!controller.signal.aborted && token === getAccessToken()) setLoading(false)
      })
    return () => controller.abort()
  }, [source.id, attempt])
  if (!loading && !error && existing?.status !== 'pending')
    return (
      <InspirationSubmissionEditor
        key={source.id}
        seed={source}
        item={existing ?? undefined}
        onClose={onClose}
        onSaved={onSaved}
      />
    )
  return (
    <LibraryDialog
      title={existing ? '该提示词已提交审核' : '分享提示词'}
      onClose={onClose}
      footer={
        <DialogActions>
          <button type="button" className="studio-secondary" onClick={onClose}>
            关闭
          </button>
          {error ? (
            <button
              type="button"
              className="studio-primary"
              onClick={() => setAttempt((value) => value + 1)}
            >
              重试
            </button>
          ) : existing ? (
            <Link className="studio-primary" href="/inspire/submissions">
              查看我的投稿
            </Link>
          ) : null}
        </DialogActions>
      }
    >
      {loading ? (
        <p role="status">正在准备分享内容…</p>
      ) : error ? (
        <p role="alert" className="settings-error">
          {error}
        </p>
      ) : (
        <>
          <p>{source.title}</p>
          <p>
            当前状态：{existing && submissionStatus(existing)}
            。请等待审核，或到我的投稿中先撤回再修改。
          </p>
        </>
      )}
    </LibraryDialog>
  )
}
