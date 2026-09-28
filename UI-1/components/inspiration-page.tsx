'use client'

import { ArrowRight, Check, ChevronDown, ChevronUp, Copy, Search, X } from 'lucide-react'
import Link from 'next/link'
import { useState } from 'react'

import { AppShell } from '@/components/app-shell'
import { RegMark } from '@/components/brand'
import { apiBaseUrl } from '@/lib/api'

import { useInspirationPrompts } from './workbench/use-inspiration-prompts'

/** 提示词超过这个长度才需要「展开」，短提示词没有折叠的必要。 */
const EXPAND_THRESHOLD = 120

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
  const [expanded, setExpanded] = useState<Set<string>>(new Set())

  function resolveImage(url: string) {
    return url.startsWith('/') ? `${apiBaseUrl}${url}` : url
  }

  async function copyPrompt(id: string, prompt: string) {
    try {
      await navigator.clipboard.writeText(prompt)
      setCopiedId(id)
      window.setTimeout(() => setCopiedId((current) => (current === id ? null : current)), 2000)
    } catch {
      // 剪贴板不可用时静默处理，用户仍可走「拿去生图」链路
    }
  }

  function toggle(id: string) {
    setExpanded((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  return (
    <AppShell
      bar={
        <header className="job-bar">
          <div className="job-bar-left">
            <div className="job-slug">
              <span>灵感库</span>
              <strong>别人写好的提示词，直接拿去用</strong>
            </div>
          </div>
          <div />
          <div className="job-bar-right">
            <Link className="btn btn-primary" href="/">
              打开工作台
            </Link>
          </div>
        </header>
      }
    >
      <div className="page">
        <div className="page-inner">
          <div className="page-head">
            <div>
              <span className="kicker">prompt index</span>
              <h1>灵感库</h1>
              <p>
                共 {allTotal || total} 条提示词。点「拿去生图」，工作台会带着这段描述一起打开。
              </p>
            </div>
          </div>

          <div style={{ marginTop: 22 }}>
            <div className="lookup" role="search">
              <Search size={17} aria-hidden="true" />
              <input
                type="search"
                placeholder="搜索标题、提示词或来源…"
                aria-label="搜索提示词"
                value={searchInput}
                onChange={(event) => setSearchInput(event.target.value)}
              />
              {searchInput && (
                <button className="lookup-clear" type="button" aria-label="清空搜索" title="清空" onClick={clearSearch}>
                  <X size={15} />
                </button>
              )}
            </div>

            <div className="tag-row">
              <button className="tag" type="button" aria-pressed={category === ''} onClick={() => changeCategory('')}>
                全部
                <span className="mono">{allTotal || total}</span>
              </button>
              {categories.map((item) => (
                <button
                  className="tag"
                  key={item.category}
                  type="button"
                  aria-pressed={category === item.category}
                  onClick={() => changeCategory(category === item.category ? '' : item.category)}
                >
                  {item.category}
                  <span className="mono">{item.count}</span>
                </button>
              ))}
            </div>
          </div>

          {error && (
            <p className="notice notice-error" role="alert">
              {error}
            </p>
          )}

          {isLoading && prompts.length === 0 ? (
            <div className="prompt-wall">
              {Array.from({ length: 6 }, (_, index) => (
                <div className="look-card" key={index}>
                  <div className="skeleton" style={{ height: 150 }} />
                  <div className="skeleton" style={{ height: 16, width: '60%' }} />
                  <div className="skeleton" style={{ height: 60 }} />
                </div>
              ))}
            </div>
          ) : prompts.length ? (
            <div className="prompt-wall">
              {prompts.map((item) => {
                const long = item.prompt.length > EXPAND_THRESHOLD
                const open = expanded.has(item.id)
                return (
                  <article className="look-card" key={item.id}>
                    <div className="look-shot" style={{ aspectRatio: item.width && item.height ? `${item.width} / ${item.height}` : '16 / 10' }}>
                      <img src={resolveImage(item.imageUrl)} alt={`${item.title} 示例`} loading="lazy" />
                      <span className="look-tag">{item.category}</span>
                    </div>
                    <div className="look-body">
                      <h3>{item.title}</h3>
                      <p className="look-prompt" data-open={!long || open}>
                        {item.prompt}
                      </p>
                      {long && (
                        <button className="look-toggle" type="button" onClick={() => toggle(item.id)} aria-expanded={open}>
                          {open ? (
                            <>
                              <ChevronUp size={13} aria-hidden="true" />
                              收起
                            </>
                          ) : (
                            <>
                              <ChevronDown size={13} aria-hidden="true" />
                              展开全文
                            </>
                          )}
                        </button>
                      )}
                    </div>
                    <div className="look-actions">
                      <button
                        className="look-copy"
                        type="button"
                        data-copied={copiedId === item.id}
                        onClick={() => void copyPrompt(item.id, item.prompt)}
                      >
                        {copiedId === item.id ? <Check size={13} aria-hidden="true" /> : <Copy size={13} aria-hidden="true" />}
                        {copiedId === item.id ? '已复制' : '复制提示词'}
                      </button>
                      <Link
                        className="look-go"
                        href={`/?mode=general&prompt=${encodeURIComponent(item.prompt)}`}
                      >
                        拿去生图
                        <ArrowRight size={13} aria-hidden="true" />
                      </Link>
                    </div>
                  </article>
                )
              })}
            </div>
          ) : (
            <div className="blank">
              <RegMark className="blank-mark" />
              <strong>没有匹配的提示词</strong>
              <p>换一个关键词，或者清空筛选看看全部 {allTotal || total} 条。</p>
              <button
                className="btn btn-outline"
                type="button"
                onClick={() => {
                  clearSearch()
                  changeCategory('')
                }}
              >
                清空筛选
              </button>
            </div>
          )}

          <div ref={sentinelRef} aria-hidden="true" />
          {hasMore && (
            <p style={{ marginTop: 26, textAlign: 'center', color: 'var(--ink-3)', fontSize: 12.5 }}>
              {isLoading ? '正在加载…' : `向下滚动，还有 ${Math.max(0, total - prompts.length)} 条`}
            </p>
          )}
          {!hasMore && prompts.length > 0 && (
            <p style={{ marginTop: 30, textAlign: 'center', color: 'var(--ink-3)', fontSize: 12.5 }}>
              这就是全部 {query ? `与「${query}」相关的` : ''} {prompts.length} 条提示词。
            </p>
          )}
        </div>
      </div>
    </AppShell>
  )
}
