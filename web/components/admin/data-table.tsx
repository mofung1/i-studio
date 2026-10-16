'use client'

import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from 'react'
import {
  flexRender,
  getCoreRowModel,
  useReactTable,
  type ColumnDef,
  type Column,
  type SortingState,
  type VisibilityState,
} from '@tanstack/react-table'
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  Columns3,
  ListFilter,
  LoaderCircle,
  Rows3,
  Table2,
} from 'lucide-react'

export type AdminSorting = SortingState
export interface AdminColumn<T> {
  id: string
  header: string
  cell: (item: T) => ReactNode
  size?: number
  align?: 'left' | 'right'
  pin?: 'left' | 'right'
  sortable?: boolean
  hideable?: boolean
}
export interface AdminSortProps {
  sorting?: AdminSorting
  onSortingChange?: (sorting: AdminSorting) => void
}
const noSorting: AdminSorting = []
function pinnedStyle<T>(column: Column<T>): CSSProperties {
  if (!column.getIsPinned()) return {}
  return {
    '--admin-column-left': `${column.getStart('left')}px`,
    '--admin-column-right': `${column.getAfter('right')}px`,
  } as CSSProperties
}

export function AdminDataTable<T>({
  title,
  columns,
  data,
  getRowId,
  loading = false,
  sorting = noSorting,
  onSortingChange,
  emptyTitle = '暂无记录',
  emptyDescription = '当前没有可显示的内容。',
  scrollKey,
}: {
  title: string
  columns: AdminColumn<T>[]
  data: T[]
  getRowId: (item: T) => string
  loading?: boolean
  emptyTitle?: string
  emptyDescription?: string
  scrollKey?: string | number
} & AdminSortProps) {
  const titleId = useId()
  const scrollRef = useRef<HTMLDivElement>(null)
  const columnMenu = useRef<HTMLDetailsElement>(null)
  const [density, setDensity] = useState<'comfortable' | 'compact'>('comfortable')
  const [visibility, setVisibility] = useState<VisibilityState>({})
  const definitions = useMemo<ColumnDef<T>[]>(
    () =>
      columns.map((column) => ({
        id: column.id,
        accessorKey: column.id,
        header: column.header,
        size: column.size ?? 160,
        enableSorting: !!column.sortable && !!onSortingChange,
        enableHiding: column.hideable !== false && !column.pin,
        sortDescFirst: false,
      })),
    [columns, onSortingChange],
  )
  const table = useReactTable({
    data,
    columns: definitions,
    getCoreRowModel: getCoreRowModel(),
    getRowId,
    manualPagination: true,
    manualSorting: true,
    enableMultiSort: false,
    state: { sorting, columnVisibility: visibility },
    initialState: {
      columnPinning: {
        left: columns.filter((column) => column.pin === 'left').map((column) => column.id),
        right: columns.filter((column) => column.pin === 'right').map((column) => column.id),
      },
    },
    onColumnVisibilityChange: setVisibility,
    onSortingChange: (updater) =>
      onSortingChange?.(typeof updater === 'function' ? updater(sorting) : updater),
  })
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = 0
  }, [scrollKey])
  useEffect(() => {
    const dismiss = (event: PointerEvent) => {
      if (columnMenu.current && !columnMenu.current.contains(event.target as Node))
        columnMenu.current.open = false
    }
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && columnMenu.current?.open) {
        event.preventDefault()
        columnMenu.current.open = false
        columnMenu.current.querySelector('summary')?.focus()
      }
    }
    document.addEventListener('pointerdown', dismiss)
    document.addEventListener('keydown', escape)
    return () => {
      document.removeEventListener('pointerdown', dismiss)
      document.removeEventListener('keydown', escape)
    }
  }, [])
  const columnMap = new Map(columns.map((column) => [column.id, column]))
  const visible = table.getVisibleLeafColumns()
  return (
    <section
      className="admin-data-table"
      data-density={density}
      aria-labelledby={titleId}
      aria-busy={loading}
    >
      <div className="admin-data-toolbar">
        <div className="admin-data-title">
          <Table2 size={17} aria-hidden="true" />
          <h2 id={titleId}>{title}</h2>
          <span role={loading ? 'status' : undefined}>
            {loading ? (
              <>
                <LoaderCircle size={13} className="settings-spinner" aria-hidden="true" />
                正在读取
              </>
            ) : (
              `本页 ${data.length} 条`
            )}
          </span>
        </div>
        <div className="admin-data-tools">
          <div className="admin-data-density" role="group" aria-label={`${title}行密度`}>
            <button
              type="button"
              aria-label="舒适行距"
              title="舒适行距"
              aria-pressed={density === 'comfortable'}
              onClick={() => setDensity('comfortable')}
            >
              <Rows3 size={15} />
            </button>
            <button
              type="button"
              aria-label="紧凑行距"
              title="紧凑行距"
              aria-pressed={density === 'compact'}
              onClick={() => setDensity('compact')}
            >
              <ListFilter size={15} />
            </button>
          </div>
          <details ref={columnMenu} className="admin-data-columns">
            <summary>
              <Columns3 size={15} aria-hidden="true" />
              列设置
            </summary>
            <div className="admin-data-column-menu">
              <strong>显示列</strong>
              {table.getAllLeafColumns().map((column) => (
                <label key={column.id}>
                  <input
                    type="checkbox"
                    aria-label={`显示${columnMap.get(column.id)?.header}`}
                    checked={column.getIsVisible()}
                    disabled={!column.getCanHide()}
                    onChange={column.getToggleVisibilityHandler()}
                  />
                  <span>{columnMap.get(column.id)?.header}</span>
                  {!column.getCanHide() && <small>固定</small>}
                </label>
              ))}
              <button type="button" onClick={() => setVisibility({})}>
                恢复默认列
              </button>
            </div>
          </details>
        </div>
      </div>
      <div
        className="admin-data-scroll"
        ref={scrollRef}
        tabIndex={0}
        role="region"
        aria-label={`${title}内容`}
      >
        <table style={{ minWidth: table.getTotalSize() }}>
          <colgroup>
            {visible.map((column) => (
              <col key={column.id} style={{ width: column.getSize() }} />
            ))}
          </colgroup>
          <thead>
            {table.getHeaderGroups().map((group) => (
              <tr key={group.id}>
                {group.headers.map((header) => {
                  const column = header.column
                  const order = column.getIsSorted()
                  const pinned = column.getIsPinned()
                  return (
                    <th
                      key={header.id}
                      title={columnMap.get(column.id)?.header}
                      scope="col"
                      data-align={columnMap.get(column.id)?.align}
                      data-pin={pinned || undefined}
                      style={pinnedStyle(column)}
                      aria-sort={
                        order === 'asc'
                          ? 'ascending'
                          : order === 'desc'
                            ? 'descending'
                            : column.getCanSort()
                              ? 'none'
                              : undefined
                      }
                    >
                      {column.getCanSort() ? (
                        <button
                          type="button"
                          disabled={loading}
                          onClick={column.getToggleSortingHandler()}
                        >
                          <span className="admin-data-header-label">
                            {flexRender(column.columnDef.header, header.getContext())}
                          </span>
                          {order === 'asc' ? (
                            <ArrowUp size={13} aria-hidden="true" />
                          ) : order === 'desc' ? (
                            <ArrowDown size={13} aria-hidden="true" />
                          ) : (
                            <ArrowUpDown size={13} aria-hidden="true" />
                          )}
                        </button>
                      ) : (
                        flexRender(column.columnDef.header, header.getContext())
                      )}
                    </th>
                  )
                })}
              </tr>
            ))}
          </thead>
          <tbody>
            {table.getRowModel().rows.map((row) => (
              <tr key={row.id}>
                {row.getVisibleCells().map((cell) => {
                  const pinned = cell.column.getIsPinned()
                  return (
                    <td
                      key={cell.id}
                      data-align={columnMap.get(cell.column.id)?.align}
                      data-pin={pinned || undefined}
                      style={pinnedStyle(cell.column)}
                    >
                      {columnMap.get(cell.column.id)?.cell(row.original)}
                    </td>
                  )
                })}
              </tr>
            ))}
            {!data.length &&
              loading &&
              Array.from({ length: 5 }, (_, i) => (
                <tr key={`skeleton-${i}`} aria-hidden="true" className="admin-data-skeleton-row">
                  {visible.map((column) => (
                    <td key={column.id}>
                      <span className="admin-data-skeleton" />
                    </td>
                  ))}
                </tr>
              ))}
          </tbody>
        </table>
        {!data.length && !loading && (
          <div className="admin-data-empty" role="status">
            <Table2 size={28} aria-hidden="true" />
            <strong>{emptyTitle}</strong>
            <p>{emptyDescription}</p>
          </div>
        )}
      </div>
    </section>
  )
}
