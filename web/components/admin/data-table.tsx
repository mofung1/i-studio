'use client'

import { Button } from './ui/button'
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuCheckboxItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuItem,
} from './ui/dropdown-menu'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './ui/table'
import { Skeleton } from './ui/skeleton'
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from './ui/empty'
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
  const [density, setDensity] = useState<'comfortable' | 'compact'>('compact')
  const [visibility, setVisibility] = useState<VisibilityState>({})
  const preferenceKey = `istudio-admin-table:${title}`
  function remember(nextDensity: typeof density, nextVisibility: VisibilityState) {
    try {
      localStorage.setItem(
        preferenceKey,
        JSON.stringify({ density: nextDensity, visibility: nextVisibility }),
      )
    } catch {
      /* Table controls remain usable without storage. */
    }
  }
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
    onColumnVisibilityChange: (updater) => {
      const next = typeof updater === 'function' ? updater(visibility) : updater
      setVisibility(next)
      remember(density, next)
    },
    onSortingChange: (updater) =>
      onSortingChange?.(typeof updater === 'function' ? updater(sorting) : updater),
  })
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = 0
  }, [scrollKey])
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(preferenceKey) ?? 'null') as {
        density?: unknown
        visibility?: unknown
      } | null
      setDensity(saved?.density === 'comfortable' ? 'comfortable' : 'compact')
      const next: VisibilityState = {}
      if (saved?.visibility && typeof saved.visibility === 'object') {
        for (const column of table.getAllLeafColumns()) {
          const value = (saved.visibility as Record<string, unknown>)[column.id]
          if (column.getCanHide() && typeof value === 'boolean') next[column.id] = value
        }
      }
      setVisibility(next)
    } catch {
      setDensity('compact')
      setVisibility({})
    }
  }, [preferenceKey, table])
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
              onClick={() => {
                setDensity('comfortable')
                remember('comfortable', visibility)
              }}
            >
              <Rows3 size={15} />
            </button>
            <button
              type="button"
              aria-label="紧凑行距"
              title="紧凑行距"
              aria-pressed={density === 'compact'}
              onClick={() => {
                setDensity('compact')
                remember('compact', visibility)
              }}
            >
              <ListFilter size={15} />
            </button>
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" aria-label={`${title}列设置`}>
                <Columns3 data-icon="inline-start" />
                列设置
                <span className="admin-column-count">
                  {visible.length}/{columns.length}
                </span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="admin-column-menu">
              <DropdownMenuLabel>显示列</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuGroup>
                {table.getAllLeafColumns().map((column) => (
                  <DropdownMenuCheckboxItem
                    key={column.id}
                    aria-label={`显示${columnMap.get(column.id)?.header}`}
                    checked={column.getIsVisible()}
                    disabled={!column.getCanHide()}
                    onSelect={(event) => event.preventDefault()}
                    onCheckedChange={(checked) => column.toggleVisibility(checked)}
                  >
                    {columnMap.get(column.id)?.header}
                    {!column.getCanHide() && (
                      <small className="ml-auto text-muted-foreground">固定</small>
                    )}
                  </DropdownMenuCheckboxItem>
                ))}
              </DropdownMenuGroup>
              <DropdownMenuSeparator />
              <DropdownMenuGroup>
                <DropdownMenuItem
                  onSelect={() => {
                    setVisibility({})
                    remember(density, {})
                  }}
                >
                  恢复默认列
                </DropdownMenuItem>
              </DropdownMenuGroup>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
      <div
        className="admin-data-scroll"
        ref={scrollRef}
        tabIndex={0}
        role="region"
        aria-label={`${title}内容`}
      >
        <Table aria-label={title} style={{ minWidth: table.getTotalSize() }}>
          <colgroup>
            {visible.map((column) => (
              <col key={column.id} style={{ width: column.getSize() }} />
            ))}
          </colgroup>
          <TableHeader>
            {table.getHeaderGroups().map((group) => (
              <TableRow key={group.id}>
                {group.headers.map((header) => {
                  const column = header.column
                  const order = column.getIsSorted()
                  const pinned = column.getIsPinned()
                  return (
                    <TableHead
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
                    </TableHead>
                  )
                })}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows.map((row) => (
              <TableRow key={row.id}>
                {row.getVisibleCells().map((cell) => {
                  const pinned = cell.column.getIsPinned()
                  return (
                    <TableCell
                      key={cell.id}
                      data-align={columnMap.get(cell.column.id)?.align}
                      data-pin={pinned || undefined}
                      style={pinnedStyle(cell.column)}
                    >
                      {columnMap.get(cell.column.id)?.cell(row.original)}
                    </TableCell>
                  )
                })}
              </TableRow>
            ))}
            {!data.length &&
              loading &&
              Array.from({ length: 5 }, (_, i) => (
                <TableRow
                  key={`skeleton-${i}`}
                  aria-hidden="true"
                  className="admin-data-skeleton-row"
                >
                  {visible.map((column) => (
                    <TableCell key={column.id}>
                      <Skeleton className="h-4 w-3/4" />
                    </TableCell>
                  ))}
                </TableRow>
              ))}
          </TableBody>
        </Table>
        {!data.length && !loading && (
          <Empty className="admin-data-empty" role="status">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <Table2 />
              </EmptyMedia>
              <EmptyTitle>{emptyTitle}</EmptyTitle>
              <EmptyDescription>{emptyDescription}</EmptyDescription>
            </EmptyHeader>
          </Empty>
        )}
      </div>
    </section>
  )
}
