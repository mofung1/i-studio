'use client'
import { useState, type ReactNode } from 'react'
import { formatLibraryDate } from '@/lib/library'
import {
  type SubmissionDetail,
  type InspirationSubmission,
  submissionStatus,
} from '@/lib/inspiration-submissions'
import { InspirationSubmissionCover } from './inspiration-submission-cover'

type CoverRenderer = (item: InspirationSubmission) => ReactNode
function HistoryEntry({
  item,
  renderCover,
}: {
  item: InspirationSubmission
  renderCover?: CoverRenderer
}) {
  const [open, setOpen] = useState(false)
  return (
    <details onToggle={(event) => setOpen(event.currentTarget.open)}>
      <summary>
        版本 {item.version} · {submissionStatus(item)} · {formatLibraryDate(item.createdAt)}
      </summary>
      {open && (
        <>
          {item.reviewReason && <p>审核说明：{item.reviewReason}</p>}
          {item.reviewedAt && <small>审核时间：{formatLibraryDate(item.reviewedAt)}</small>}
          <h4>{item.title}</h4>
          <p className="submission-full-prompt">{item.prompt}</p>
          {item.instructions && <p>使用说明：{item.instructions}</p>}
          {item.requiresReference && <p>需要参考图</p>}
          {renderCover ? (
            renderCover(item)
          ) : (
            <InspirationSubmissionCover
              path={item.coverPath}
              title={`版本 ${item.version} 的封面`}
            />
          )}
        </>
      )}
    </details>
  )
}
export function SubmissionHistory({
  detail,
  renderCover,
  onMore,
}: {
  detail: SubmissionDetail
  renderCover?: CoverRenderer
  onMore: () => void
}) {
  return (
    <section className="submission-history" aria-label="投稿版本与审核记录">
      <h3>版本与审核记录</h3>
      {detail.history.map((item) => (
        <HistoryEntry key={item.version} item={item} renderCover={renderCover} />
      ))}
      {detail.nextBeforeVersion > 0 && (
        <button type="button" className="studio-secondary" onClick={onMore}>
          加载更早记录
        </button>
      )}
    </section>
  )
}
