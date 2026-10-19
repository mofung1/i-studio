'use client'
import { Input } from './ui/input'
import { Button } from '@/components/admin/ui/button'

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
  const first = total ? (page - 1) * pageSize + 1 : 0
  const last = Math.min(page * pageSize, total)
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
          第 {first}–{last} {unit}，共 {total} {unit}
          {label}
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
      <span className="admin-page-position">
        第 {page} / {totalPages} 页
      </span>
      <div className="ops-pagination-buttons">
        <Button
          variant="outline"
          type="button"
          aria-label={`上一页${label}`}
          disabled={loading || page <= 1}
          onClick={() => onPageChange(page - 1)}
        >
          <ChevronLeft data-icon="inline-start" aria-hidden="true" />
        </Button>
        {steps.map((step) =>
          typeof step === 'number' ? (
            <Button
              variant="outline"
              key={step}
              type="button"
              aria-label={`第 ${step} 页${label}`}
              aria-current={page === step ? 'page' : undefined}
              disabled={loading}
              onClick={() => onPageChange(step)}
            >
              {step}
            </Button>
          ) : (
            <span key={step} aria-hidden="true">
              …
            </span>
          ),
        )}
        <Button
          variant="outline"
          type="button"
          aria-label={`下一页${label}`}
          disabled={loading || page >= totalPages}
          onClick={() => onPageChange(page + 1)}
        >
          <ChevronRight data-icon="inline-start" aria-hidden="true" />
        </Button>
      </div>
      <form
        className="admin-pagination-jump"
        onSubmit={(event) => {
          event.preventDefault()
          const input = event.currentTarget.elements.namedItem('page') as HTMLInputElement
          const next = Number(input.value)
          if (
            !loading &&
            Number.isInteger(next) &&
            next >= 1 &&
            next <= totalPages &&
            next !== page
          )
            onPageChange(next)
        }}
      >
        <label htmlFor={`page-jump-${label}`}>跳至</label>
        <Input
          key={`${page}:${totalPages}`}
          id={`page-jump-${label}`}
          aria-label={`跳转到第几页${label}`}
          name="page"
          type="number"
          inputMode="numeric"
          min={1}
          max={totalPages}
          defaultValue={page}
          disabled={loading || totalPages <= 1}
          required
        />
        <Button variant="outline" size="sm" type="submit" disabled={loading || totalPages <= 1}>
          前往
        </Button>
      </form>
    </nav>
  )
}
