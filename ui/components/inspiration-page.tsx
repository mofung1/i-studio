'use client'

import { ArrowUpRight, Check, ChevronDown, ChevronUp, Copy, Palette, Search, X } from 'lucide-react'
import Link from 'next/link'
import { useState } from 'react'

import { apiBaseUrl } from '@/lib/api'

import { TopNavigation } from './top-navigation'
import { useInspirationPrompts } from './workbench/use-inspiration-prompts'

export function InspirationPage() {
  const {
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
  } = useInspirationPrompts()
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set())

  // 后端返回相对路径时拼上 API 基址；配置了 CDN 则是绝对地址，原样使用。
  function resolveImage(url: string) {
    return url.startsWith('/') ? `${apiBaseUrl}${url}` : url
  }

  async function copyPrompt(id: string, prompt: string) {
    try {
      await navigator.clipboard.writeText(prompt)
      setCopiedId(id)
      window.setTimeout(() => setCopiedId((current) => (current === id ? null : current)), 2000)
    } catch {
      // 剪贴板不可用时静默失败，用户仍可走「去生图」链路
    }
  }

  // 提示词超过 N 个字符才显示「展开」，短提示词不需要
  const PROMPT_EXPAND_THRESHOLD = 120

  function toggleExpanded(id: string) {
    setExpandedIds((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  return (
    <div className="site-shell">
      <TopNavigation />
      <main>
        <section className="inspire-hero">
          <span className="eyebrow"><Palette size={16} />发现灵感</span>
          <h1>选一个提示词，直接开始生成</h1>
          <p>点击卡片跳转通用生图，提示词已自动填好。共 {allTotal || total} 条提示词。</p>

          <div className="inspire-hero-search" role="search">
            <Search size={17} className="inspire-search-icon" aria-hidden="true" />
            <input
              type="search"
              className="inspire-search-input"
              placeholder="搜索标题、提示词或来源…"
              aria-label="搜索提示词"
              value={searchInput}
              onChange={(event) => setSearchInput(event.target.value)}
            />
            {searchInput ? (
              <button
                type="button"
                className="inspire-search-clear"
                aria-label="清除搜索"
                onClick={clearSearch}
              >
                <X size={15} />
              </button>
            ) : (
              <kbd className="inspire-search-kbd" aria-hidden="true">⌘K</kbd>
            )}
          </div>
        </section>

        <section className="content-section inspire-body" aria-label="提示词卡片列表">
          <div className="inspire-filters" role="group" aria-label="按分类筛选">
            <button
              type="button"
              className="inspire-filter-chip"
              aria-pressed={category === ''}
              onClick={() => changeCategory('')}
            >
              全部 · {allTotal}
            </button>
            {categories.map((item) => (
              <button
                key={item.category}
                type="button"
                className="inspire-filter-chip"
                aria-pressed={category === item.category}
                onClick={() => changeCategory(item.category)}
              >
                {item.category} · {item.count}
              </button>
            ))}
          </div>

          {error && <div className="inspire-empty-state" role="alert"><span>{error}</span></div>}

          {prompts.length === 0 && !isLoading && !error ? (
            <div className="inspire-empty-state">
              {query ? (
                <>
                  <span>没有匹配「{query}」的提示词。</span>
                  <button type="button" className="inspire-empty-action" onClick={clearSearch}>
                    清除搜索
                  </button>
                </>
              ) : (
                <span>还没有提示词，请先导入数据。</span>
              )}
            </div>
          ) : (
            <div className="inspire-grid">
              {prompts.map((item) => (
                <article className="inspire-card" key={item.id}>
                  <div
                    className="inspire-cover"
                    style={item.width && item.height ? { aspectRatio: `${item.width} / ${item.height}` } : undefined}
                  >
                    {item.imageUrl ? (
                      <img src={resolveImage(item.imageUrl)} alt={`${item.title}案例图`} loading="lazy" />
                    ) : (
                      <span className="inspire-cover-placeholder" />
                    )}
                    <span className="inspire-category-tag">{item.category}</span>
                  </div>
                  <div className="inspire-copy">
                    <h3>{item.title}</h3>
                    {item.source && <p className="inspire-source">来源：{item.source}</p>}
                    {item.prompt.length > PROMPT_EXPAND_THRESHOLD ? (
                      <div className="inspire-prompt-wrap">
                        <p
                          className="inspire-prompt-preview"
                          aria-label="提示词预览"
                          data-expanded={expandedIds.has(item.id)}
                        >
                          {item.prompt}
                        </p>
                        <button
                          type="button"
                          className="inspire-prompt-toggle"
                          aria-expanded={expandedIds.has(item.id)}
                          onClick={() => toggleExpanded(item.id)}
                        >
                          {expandedIds.has(item.id) ? (
                            <><ChevronUp size={13} />收起</>
                          ) : (
                            <><ChevronDown size={13} />展开全文</>
                          )}
                        </button>
                      </div>
                    ) : (
                      <p className="inspire-prompt-preview" aria-label="提示词预览">{item.prompt}</p>
                    )}
                  </div>
                  <div className="inspire-actions">
                    <button
                      type="button"
                      className="inspire-copy-button"
                      aria-label="复制提示词"
                      onClick={() => void copyPrompt(item.id, item.prompt)}
                    >
                      {copiedId === item.id ? <Check size={15} /> : <Copy size={15} />}
                      {copiedId === item.id ? '已复制' : '复制'}
                    </button>
                    <Link
                      className="inspire-start-button"
                      href={`/workbench?mode=general&prompt=${encodeURIComponent(item.prompt)}`}
                    >
                      去生图 <ArrowUpRight size={15} />
                    </Link>
                  </div>
                </article>
              ))}
            </div>
          )}

          {isLoading && <div className="inspire-loading" aria-label="正在加载"><span /></div>}

          {/* 触底哨兵：进入视口即加载下一页 */}
          {hasMore && !isLoading && <div ref={sentinelRef} className="inspire-sentinel" aria-hidden="true" />}
          {!hasMore && prompts.length > 0 && (
            <p className="inspire-end-note">已展示全部 {prompts.length} 条</p>
          )}
        </section>
      </main>
    </div>
  )
}
