'use client'

import { ChevronLeft, ChevronRight } from 'lucide-react'
import { LibrarySelect } from '../library-controls'

export function AdminPagination({
  page,
  pageSize,
  total,
  totalPages,
  loading,
  label = '任务',
  unit = '条',
  onPageChange,
  onPageSizeChange,
}: {
  page: number
  pageSize: number
  total: number
  totalPages: number
  loading: boolean
  label?: string
  unit?: string
  onPageChange: (page: number) => void
  onPageSizeChange: (size: number) => void
}) {
  const pages = [...new Set([1, page - 1, page, page + 1, totalPages])]
    .filter((value) => value >= 1 && value <= totalPages)
    .sort((a, b) => a - b)
  const steps: Array<number | string> = []
  for (const value of pages) {
    const previous = steps.at(-1)
    if (typeof previous === 'number' && value > previous + 1) {
      steps.push(value === previous + 2 ? previous + 1 : `gap-${value}`)
    }
    steps.push(value)
  }
  return (
    <nav className="ops-pagination" aria-label={`${label}分页`}>
      <div className="ops-pagination-summary" aria-live="polite">
        <span>
          共 {total} {unit}
          {label} · 第 {page} / {totalPages} 页
        </span>
        {loading && <span role="status">正在读取…</span>}
      </div>
      <LibrarySelect
        label={`每页${label}条数`}
        value={String(pageSize)}
        options={[
          ['20', '20 条 / 页'],
          ['50', '50 条 / 页'],
          ['100', '100 条 / 页'],
        ]}
        disabled={loading}
        onChange={(value) => onPageSizeChange(Number(value))}
      />
      <div className="ops-pagination-buttons">
        <button
          type="button"
          aria-label={`上一页${label}`}
          disabled={loading || page <= 1}
          onClick={() => onPageChange(page - 1)}
        >
          <ChevronLeft size={15} aria-hidden="true" />
        </button>
        {steps.map((step) =>
          typeof step === 'number' ? (
            <button
              key={step}
              type="button"
              aria-label={`第 ${step} 页${label}`}
              aria-current={page === step ? 'page' : undefined}
              disabled={loading}
              onClick={() => onPageChange(step)}
            >
              {step}
            </button>
          ) : (
            <span key={step} aria-hidden="true">
              …
            </span>
          ),
        )}
        <button
          type="button"
          aria-label={`下一页${label}`}
          disabled={loading || page >= totalPages}
          onClick={() => onPageChange(page + 1)}
        >
          <ChevronRight size={15} aria-hidden="true" />
        </button>
      </div>
    </nav>
  )
}
