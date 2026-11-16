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
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
} from './ui/dropdown-menu'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './ui/table'
import { Skeleton } from './ui/skeleton'
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from './ui/empty'
import {
  useCallback,
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
  ChevronLeft,
  ChevronRight,
  MoveHorizontal,
  LoaderCircle,
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
  emptyAction,
  scrollKey,
}: {
  title: string
  columns: AdminColumn<T>[]
  data: T[]
  getRowId: (item: T) => string
  loading?: boolean
  emptyTitle?: string
  emptyDescription?: string
  emptyAction?: ReactNode
  scrollKey?: string | number
} & AdminSortProps) {
  const titleId = useId()
  const scrollHelpId = useId()
  const scrollRef = useRef<HTMLDivElement>(null)
  const [viewport, setViewport] = useState({
    overflow: false,
    narrow: false,
    atStart: true,
    atEnd: true,
  })
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
  const totalWidth = table.getTotalSize()
  const activeSort = sorting[0]
  const sortLabel = activeSort ? columnMap.get(activeSort.id)?.header : undefined
  const measureViewport = useCallback(() => {
    const element = scrollRef.current
    if (!element || !element.clientWidth) return
    const next = {
      overflow: element.scrollWidth > element.clientWidth + 1,
      narrow: element.clientWidth < 640,
      atStart: element.scrollLeft <= 1,
      atEnd: element.scrollLeft + element.clientWidth >= element.scrollWidth - 1,
    }
    setViewport((previous) =>
      Object.keys(next).every(
        (key) => previous[key as keyof typeof next] === next[key as keyof typeof next],
      )
        ? previous
        : next,
    )
  }, [])
  useEffect(() => {
    measureViewport()
    const element = scrollRef.current
    if (!element) return
    const observer =
      typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measureViewport)
    observer?.observe(element)
    const content = element.querySelector('table')
    if (content) observer?.observe(content)
    window.addEventListener('resize', measureViewport)
    return () => {
      observer?.disconnect()
      window.removeEventListener('resize', measureViewport)
    }
  }, [measureViewport, totalWidth, data.length])
  function scrollColumns(direction: -1 | 1) {
    const element = scrollRef.current
    if (!element) return
    element.scrollBy({ left: direction * Math.max(160, element.clientWidth * 0.75) })
  }
  return (
    <section
      className="admin-data-table"
      data-density={density}
      aria-labelledby={titleId}
      aria-busy={loading}
    >
      <div className="admin-data-toolbar">
        <div className="admin-data-heading">
          <div className="admin-data-title">
            <Table2 size={17} aria-hidden="true" />
            <h2 id={titleId}>{title}</h2>
            <span role={loading ? 'status' : undefined}>
              {loading ? (
                <>
                  <LoaderCircle size={13} className="settings-spinner" aria-hidden="true" />
                  {data.length ? '正在更新' : '正在读取'}
                </>
              ) : (
                `本页 ${data.length} 条`
              )}
            </span>
          </div>
          {sortLabel && (
            <p className="admin-data-sort-summary">
              按{sortLabel}
              {activeSort?.desc ? '降序' : '升序'}排列
            </p>
          )}
        </div>
        <div className="admin-data-tools">
          {sortLabel && onSortingChange && (
            <Button
              variant="ghost"
              size="sm"
              disabled={loading}
              onClick={() => onSortingChange?.([])}
            >
              恢复默认排序
            </Button>
          )}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" aria-label={`${title}显示设置`}>
                <Columns3 data-icon="inline-start" />
                显示设置
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="admin-column-menu">
              <DropdownMenuLabel>行距</DropdownMenuLabel>
              <DropdownMenuRadioGroup
                value={density}
                onValueChange={(value) => {
                  const next = value === 'comfortable' ? 'comfortable' : 'compact'
                  setDensity(next)
                  remember(next, visibility)
                }}
              >
                <DropdownMenuRadioItem value="comfortable" aria-label="舒适行距">
                  舒适
                </DropdownMenuRadioItem>
                <DropdownMenuRadioItem value="compact" aria-label="紧凑行距">
                  紧凑
                </DropdownMenuRadioItem>
              </DropdownMenuRadioGroup>
              <DropdownMenuSeparator />
              <DropdownMenuLabel>
                显示列{' '}
                <span className="admin-column-count">
                  {visible.length}/{columns.length}
                </span>
              </DropdownMenuLabel>
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
                      <small className="ml-auto text-muted-foreground">必显</small>
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
      {viewport.overflow && data.length > 0 && (
        <div className="admin-data-scroll-help" id={scrollHelpId}>
          <span>
            <MoveHorizontal size={14} aria-hidden="true" />
            左右滑动查看全部列
          </span>
          <div role="group" aria-label={`${title}横向浏览`}>
            <Button
              variant="ghost"
              size="icon"
              aria-label={`向左滚动${title}`}
              disabled={viewport.atStart}
              onClick={() => scrollColumns(-1)}
            >
              <ChevronLeft size={15} />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              aria-label={`向右滚动${title}`}
              disabled={viewport.atEnd}
              onClick={() => scrollColumns(1)}
            >
              <ChevronRight size={15} />
            </Button>
          </div>
        </div>
      )}
      <div
        className="admin-data-scroll"
        ref={scrollRef}
        tabIndex={0}
        role="region"
        aria-label={`${title}内容`}
        aria-describedby={viewport.overflow && data.length > 0 ? scrollHelpId : undefined}
        data-empty={!data.length && !loading ? 'true' : undefined}
        onScroll={measureViewport}
      >
        <Table aria-label={title} style={{ minWidth: totalWidth }}>
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
                  const pinned = !viewport.narrow && column.getIsPinned()
                  return (
                    <TableHead
                      key={header.id}
                      title={columnMap.get(column.id)?.header}
                      scope="col"
                      data-align={columnMap.get(column.id)?.align}
                      data-pin={pinned || undefined}
                      style={pinned ? pinnedStyle(column) : undefined}
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
                          title={`点击${column.getNextSortingOrder() === 'asc' ? '按升序排列' : column.getNextSortingOrder() === 'desc' ? '按降序排列' : '恢复默认排序'}`}
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
                  const pinned = !viewport.narrow && cell.column.getIsPinned()
                  return (
                    <TableCell
                      key={cell.id}
                      data-align={columnMap.get(cell.column.id)?.align}
                      data-pin={pinned || undefined}
                      style={pinned ? pinnedStyle(cell.column) : undefined}
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
            {emptyAction && <EmptyContent>{emptyAction}</EmptyContent>}
          </Empty>
        )}
      </div>
    </section>
  )
}
