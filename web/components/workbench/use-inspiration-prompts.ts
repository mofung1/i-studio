'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

import { apiBaseUrl } from '@/lib/api'

export interface InspirationPrompt {
  submissionId?: string
  instructions?: string
  requiresReference?: boolean
  id: string
  title: string
  category: string
  prompt: string
  source: string
  imageUrl: string
  width: number
  height: number
  sortOrder: number
}

export interface InspirationCategory {
  id?: string
  category: string
  count: number
  enabledCount?: number
}

interface InspirationResponse {
  prompts: InspirationPrompt[]
  page: number
  pageSize: number
  total: number
}

const PAGE_SIZE = 24

export function useInspirationPrompts() {
  const [prompts, setPrompts] = useState<InspirationPrompt[]>([])
  const [categories, setCategories] = useState<InspirationCategory[]>([])
  const [categoriesLoading, setCategoriesLoading] = useState(true)
  const [categoriesError, setCategoriesError] = useState('')
  const [category, setCategory] = useState('')
  const [searchInput, setSearchInput] = useState('')
  const [query, setQuery] = useState('')
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState('')
  const [loadMoreError, setLoadMoreError] = useState('')
  const [hasMore, setHasMore] = useState(false)
  const loadingRef = useRef(false)
  const requestRef = useRef<AbortController | null>(null)
  const categoriesRequestRef = useRef<AbortController | null>(null)

  // 全库总数：各启用分类条数之和。切换分类时 total 会变成当前分类的条数，
  // 「全部」chip 与 hero 文案需要始终展示全库量级，故单独派生。
  const allTotal = categories.reduce((sum, item) => sum + item.count, 0)

  const loadPage = useCallback(
    async (targetPage: number, selectedCategory: string, searchQuery: string, replace: boolean) => {
      if (loadingRef.current && !replace) return
      requestRef.current?.abort()
      const controller = new AbortController()
      requestRef.current = controller
      loadingRef.current = true
      setIsLoading(true)
      if (replace) setError('')
      setLoadMoreError('')
      try {
        const params = new URLSearchParams({
          page: String(targetPage),
          pageSize: String(PAGE_SIZE),
        })
        if (selectedCategory) params.set('category', selectedCategory)
        if (searchQuery) params.set('q', searchQuery)
        let response: Response
        try {
          response = await fetch(`${apiBaseUrl}/v1/inspiration/prompts?${params.toString()}`, {
            signal: controller.signal,
          })
        } catch {
          throw new Error('灵感加载失败，请检查网络后重试')
        }
        if (!response.ok) throw new Error('灵感库加载失败')
        const data = (await response.json()) as InspirationResponse
        if (controller.signal.aborted || requestRef.current !== controller) return
        setPrompts((prev) => {
          if (replace) return data.prompts
          // A newly published item can shift a page boundary while the gallery is open.
          return [...new Map([...prev, ...data.prompts].map((item) => [item.id, item])).values()]
        })
        setTotal(data.total)
        setPage(data.page)
        // Pagination advances through server offsets, not the deduplicated card count.
        // A live total can change between pages; an empty or repeated page always ends browsing.
        setHasMore(
          data.prompts.length > 0 &&
            data.page >= targetPage &&
            data.page * data.pageSize < data.total,
        )
      } catch (reason) {
        if (!controller.signal.aborted && requestRef.current === controller) {
          const message = reason instanceof Error ? reason.message : '灵感加载失败，请重试'
          if (replace) setError(message)
          else setLoadMoreError(message)
        }
      } finally {
        if (requestRef.current === controller) {
          setIsLoading(false)
          loadingRef.current = false
        }
      }
    },
    [],
  )

  // 切换分类：只改状态，由下面的 effect 统一触发加载，避免重复请求
  const changeCategory = useCallback((next: string) => {
    setCategory(next)
  }, [])

  const loadMore = useCallback(() => {
    if (!hasMore || isLoading) return
    void loadPage(page + 1, category, query, false)
  }, [category, hasMore, isLoading, loadPage, page, query])

  const reloadCategories = useCallback(async () => {
    categoriesRequestRef.current?.abort()
    const controller = new AbortController()
    categoriesRequestRef.current = controller
    setCategoriesLoading(true)
    setCategoriesError('')
    try {
      const response = await fetch(`${apiBaseUrl}/v1/inspiration/categories`, {
        signal: controller.signal,
      })
      if (!response.ok) throw new Error('分类暂时无法加载，请重试')
      const data = (await response.json()) as { categories: InspirationCategory[] }
      if (controller.signal.aborted || categoriesRequestRef.current !== controller) return
      setCategories(data.categories ?? [])
    } catch {
      if (!controller.signal.aborted && categoriesRequestRef.current === controller)
        setCategoriesError('分类暂时无法加载，请重试')
    } finally {
      if (categoriesRequestRef.current === controller) setCategoriesLoading(false)
    }
  }, [])

  useEffect(() => {
    void reloadCategories()
    return () => categoriesRequestRef.current?.abort()
  }, [reloadCategories])

  // 搜索防抖：输入即时回显，查询延迟 350ms 触发，避免逐键打接口
  useEffect(() => {
    const timer = window.setTimeout(() => setQuery(searchInput), 350)
    return () => window.clearTimeout(timer)
  }, [searchInput])

  // 新筛选会取消旧请求，避免慢响应覆盖当前分类或搜索结果。
  useEffect(() => {
    setPrompts([])
    setTotal(0)
    setPage(1)
    setHasMore(false)
    void loadPage(1, category, query, true)
    return () => requestRef.current?.abort()
  }, [category, query, loadPage])

  const clearSearch = useCallback(() => {
    setSearchInput('')
    setQuery('')
  }, [])

  const resetFilters = useCallback(() => {
    setCategory('')
    setSearchInput('')
    setQuery('')
  }, [])

  return {
    prompts,
    categories,
    categoriesLoading,
    categoriesError,
    reloadCategories,
    category,
    searchInput,
    query,
    total,
    allTotal,
    isLoading,
    error,
    loadMoreError,
    hasMore,
    changeCategory,
    setSearchInput,
    clearSearch,
    resetFilters,
    loadMore,
    reload: () => {
      void loadPage(1, category, query, true)
    },
  }
}
