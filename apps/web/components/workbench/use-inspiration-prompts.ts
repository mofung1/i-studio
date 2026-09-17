'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

import { apiBaseUrl } from '@/lib/api'

export interface InspirationPrompt {
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
  category: string
  count: number
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
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')
  const loadingRef = useRef(false)
  const sentinelRef = useRef<HTMLDivElement | null>(null)

  const hasMore = prompts.length < total

  // 全库总数：各启用分类条数之和。切换分类时 total 会变成当前分类的条数，
  // 「全部」chip 与 hero 文案需要始终展示全库量级，故单独派生。
  const allTotal = categories.reduce((sum, item) => sum + item.count, 0)

  const loadPage = useCallback(async (targetPage: number, selectedCategory: string, replace: boolean) => {
    if (loadingRef.current) return
    loadingRef.current = true
    setIsLoading(true)
    setError('')
    try {
      const params = new URLSearchParams({ page: String(targetPage), pageSize: String(PAGE_SIZE) })
      if (selectedCategory) params.set('category', selectedCategory)
      const response = await fetch(`${apiBaseUrl}/v1/inspiration/prompts?${params.toString()}`)
      if (!response.ok) throw new Error('灵感库加载失败')
      const data = (await response.json()) as InspirationResponse
      setPrompts((prev) => (replace ? data.prompts : [...prev, ...data.prompts]))
      setTotal(data.total)
      setPage(targetPage)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '灵感库加载失败')
    } finally {
      setIsLoading(false)
      loadingRef.current = false
    }
  }, [])

  // 切换分类时回到第一页
  const changeCategory = useCallback(
    (next: string) => {
      if (next === category) return
      setCategory(next)
      void loadPage(1, next, true)
    },
    [category, loadPage],
  )

  const loadMore = useCallback(() => {
    if (!hasMore || isLoading) return
    void loadPage(page + 1, category, false)
  }, [category, hasMore, isLoading, loadPage, page])

  // 首次加载：分类列表 + 第一页
  useEffect(() => {
    const controller = new AbortController()
    fetch(`${apiBaseUrl}/v1/inspiration/categories`, { signal: controller.signal })
      .then((response) => (response.ok ? response.json() : Promise.reject(new Error('分类加载失败'))))
      .then((data: { categories: InspirationCategory[] }) => setCategories(data.categories ?? []))
      .catch(() => undefined)
    return () => controller.abort()
  }, [])

  useEffect(() => {
    void loadPage(1, category, true)
  }, [loadPage, category])

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
    total,
    allTotal,
    isLoading,
    error,
    hasMore,
    sentinelRef,
    changeCategory,
    loadMore,
  }
}
