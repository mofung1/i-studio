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
  const [category, setCategory] = useState('')
  const [searchInput, setSearchInput] = useState('')
  const [query, setQuery] = useState('')
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState('')
  const loadingRef = useRef(false)
  const requestRef = useRef<AbortController | null>(null)
  const sentinelRef = useRef<HTMLDivElement | null>(null)

  const hasMore = prompts.length < total

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
      setError('')
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
          throw new Error('灵感库加载失败，请检查后端服务是否已启动')
        }
        if (!response.ok) throw new Error('灵感库加载失败')
        const data = (await response.json()) as InspirationResponse
        if (controller.signal.aborted) return
        setPrompts((prev) => (replace ? data.prompts : [...prev, ...data.prompts]))
        setTotal(data.total)
        setPage(targetPage)
      } catch (reason) {
        if (!controller.signal.aborted)
          setError(reason instanceof Error ? reason.message : '灵感库加载失败')
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

  // 首次加载：分类列表 + 第一页
  useEffect(() => {
    const controller = new AbortController()
    fetch(`${apiBaseUrl}/v1/inspiration/categories`, { signal: controller.signal })
      .then((response) =>
        response.ok ? response.json() : Promise.reject(new Error('分类加载失败')),
      )
      .then((data: { categories: InspirationCategory[] }) => setCategories(data.categories ?? []))
      .catch(() => undefined)
    return () => controller.abort()
  }, [])

  // 搜索防抖：输入即时回显，查询延迟 350ms 触发，避免逐键打接口
  useEffect(() => {
    const timer = window.setTimeout(() => setQuery(searchInput), 350)
    return () => window.clearTimeout(timer)
  }, [searchInput])

  // 新筛选会取消旧请求，避免慢响应覆盖当前分类或搜索结果。
  useEffect(() => {
    setPrompts([])
    setTotal(0)
    void loadPage(1, category, query, true)
    return () => requestRef.current?.abort()
  }, [category, query, loadPage])

  const clearSearch = useCallback(() => {
    setSearchInput('')
    setQuery('')
  }, [])

  // 触底自动加载下一页
  useEffect(() => {
    const node = sentinelRef.current
    if (!node || !hasMore) return
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) void loadMore()
      },
      { rootMargin: '400px' },
    )
    observer.observe(node)
    return () => observer.disconnect()
  }, [hasMore, loadMore])

  return {
    prompts,
    categories,
    category,
    searchInput,
    query,
    total,
    allTotal,
    isLoading,
    error,
    hasMore,
    sentinelRef,
    changeCategory,
    setSearchInput,
    clearSearch,
    loadMore,
    reload: () => {
      void loadPage(1, category, query, true)
    },
  }
}
