'use client'

import { useId } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../ui/select'
import { Button } from './ui/button'
import { Input } from './ui/input'

const defaultPageSizes = [20, 50, 100] as const

export function AdminPagination({
  page,
  pageSize,
  total,
  totalPages,
  loading,
  label = '任务',
  unit = '条',
  showTotal = true,
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
  showTotal?: boolean
  onPageChange: (page: number) => void
  onPageSizeChange?: (size: number) => void
}) {
  const jumpId = useId()
  const multiplePages = totalPages > 1
  if (total === 0 || (!multiplePages && (!onPageSizeChange || total <= defaultPageSizes[0]))) {
    return null
  }
  const first = (page - 1) * pageSize + 1
  const last = Math.min(page * pageSize, total)
  const pageSizes = [...new Set([...defaultPageSizes, pageSize])].sort((a, b) => a - b)
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
    <nav className="admin-pagination" aria-label={`${label}分页`}>
      <div className="admin-pagination-summary" aria-live="polite">
        <span>
          第 {first}–{last} {unit}
          {showTotal && `，共 ${total} ${unit}${label}`}
        </span>
        {loading && <span>正在读取…</span>}
      </div>
      <div className="admin-pagination-actions">
        {onPageSizeChange && (
          <div className="admin-pagination-size">
            <span aria-hidden="true">每页</span>
            <Select
              value={String(pageSize)}
              disabled={loading}
              onValueChange={(value) => onPageSizeChange(Number(value))}
            >
              <SelectTrigger size="sm" aria-label={`每页${label}条数`}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent side="top">
                <SelectGroup>
                  {pageSizes.map((size) => (
                    <SelectItem value={String(size)} key={size}>
                      {size}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </div>
        )}
        {multiplePages && (
          <div className="admin-pagination-navigation">
            <span className="admin-page-position">
              第 {page} / {Math.max(totalPages, 1)} 页
            </span>
            <div className="admin-pagination-buttons">
              <Button
                variant="outline"
                size="icon-sm"
                type="button"
                aria-label={`上一页${label}`}
                disabled={loading || page <= 1}
                onClick={() => onPageChange(page - 1)}
              >
                <ChevronLeft aria-hidden="true" />
              </Button>
              {steps.map((step) =>
                typeof step === 'number' ? (
                  <Button
                    variant={page === step ? 'default' : 'outline'}
                    size="sm"
                    key={step}
                    type="button"
                    aria-label={`第 ${step} 页${label}`}
                    aria-current={page === step ? 'page' : undefined}
                    className="admin-page-number min-w-8 px-2"
                    disabled={loading}
                    onClick={() => {
                      if (step !== page) onPageChange(step)
                    }}
                  >
                    {step}
                  </Button>
                ) : (
                  <span key={step} className="admin-page-gap px-0.5" aria-hidden="true">
                    …
                  </span>
                ),
              )}
              <Button
                variant="outline"
                size="icon-sm"
                type="button"
                aria-label={`下一页${label}`}
                disabled={loading || page >= totalPages}
                onClick={() => onPageChange(page + 1)}
              >
                <ChevronRight aria-hidden="true" />
              </Button>
            </div>
          </div>
        )}
        {multiplePages && (
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
              ) {
                onPageChange(next)
              }
            }}
          >
            <label htmlFor={jumpId}>跳至</label>
            <Input
              key={`${page}:${totalPages}`}
              id={jumpId}
              aria-label={`跳转到第几页${label}`}
              name="page"
              type="number"
              inputMode="numeric"
              min={1}
              max={totalPages}
              defaultValue={page}
              disabled={loading}
              required
            />
            <Button variant="ghost" size="sm" type="submit" disabled={loading}>
              前往
            </Button>
          </form>
        )}
      </div>
    </nav>
  )
}
