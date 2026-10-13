'use client'

import { ArrowUpRight, Check, Copy, Folder, Image as ImageIcon, RefreshCw, Search, X } from 'lucide-react'
import Link from 'next/link'
import { useState } from 'react'

import { apiBaseUrl } from '@/lib/api'
import { InfoDialog } from './info-dialog'
import { type InspirationPrompt, useInspirationPrompts } from './workbench/use-inspiration-prompts'

interface InspirationGalleryProps {
  onUsePrompt?: (prompt: string) => void
}

interface InspirationCardProps extends InspirationGalleryProps {
  item: InspirationPrompt
  copied: boolean
  onInspect: (item: InspirationPrompt) => void
  onCopy: (item: InspirationPrompt) => void
}

export function InspirationCard({ item, copied, onInspect, onCopy, onUsePrompt }: InspirationCardProps) {
  const imageUrl = item.imageUrl.startsWith('/') ? `${apiBaseUrl}${item.imageUrl}` : item.imageUrl
  return <article className="inspire-card">
    <button type="button" className="inspire-cover" aria-label={`查看${item.title}的提示词`} aria-haspopup="dialog" onClick={() => onInspect(item)} style={item.width && item.height ? { aspectRatio: `${item.width} / ${item.height}` } : undefined}>
      {item.imageUrl ? <img src={imageUrl} alt={`${item.title}案例图`} loading="lazy" /> : <span className="inspire-cover-placeholder" />}
      <span className="inspire-category-tag">{item.category}</span>
    </button>
    <div className="inspire-copy">
      <h3>{item.title}</h3>
      {item.source && <p className="inspire-source">{item.source}</p>}
    </div>
    <div className="inspire-actions">
      <button type="button" className="inspire-view-button" aria-haspopup="dialog" onClick={() => onInspect(item)}><ImageIcon size={14} />提示词</button>
      <button type="button" className="inspire-copy-button" aria-label="复制提示词" onClick={() => onCopy(item)}>
        {copied ? <Check size={15} /> : <Copy size={15} />}{copied ? '已复制' : '复制'}
      </button>
      {onUsePrompt
        ? <button type="button" className="inspire-start-button" onClick={() => onUsePrompt(item.prompt)}>去生图<ArrowUpRight size={15} /></button>
        : <Link className="inspire-start-button" href={`/workbench?mode=general&prompt=${encodeURIComponent(item.prompt)}`}>去生图<ArrowUpRight size={15} /></Link>}
    </div>
  </article>
}

/** Search, category filtering and pagination continue to use the real inspiration API. */
export function InspirationGallery({ onUsePrompt }: InspirationGalleryProps) {
  const { prompts, categories, category, searchInput, query, allTotal, isLoading, error, hasMore, sentinelRef, changeCategory, setSearchInput, clearSearch, reload } = useInspirationPrompts()
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [selectedPrompt, setSelectedPrompt] = useState<InspirationPrompt | null>(null)

  async function copyPrompt(item: InspirationPrompt) {
    try {
      await navigator.clipboard.writeText(item.prompt)
      setCopiedId(item.id)
      window.setTimeout(() => setCopiedId((current) => current === item.id ? null : current), 2000)
    } catch {
      // The full prompt remains selectable in the details dialog.
    }
  }

  return <div className="inspire-gallery">
    <aside className="inspire-gallery-head" aria-label="灵感筛选">
      <div className="inspire-hero-search" role="search">
        <Search size={17} className="inspire-search-icon" aria-hidden="true" />
        <input type="search" className="inspire-search-input" placeholder="搜索标题、提示词或来源…" aria-label="搜索提示词" value={searchInput} onChange={(event) => setSearchInput(event.target.value)} />
        {searchInput && <button type="button" className="inspire-search-clear" aria-label="清除搜索" onClick={clearSearch}><X size={15} /></button>}
      </div>
      <div className="inspire-filter-section">
        {!onUsePrompt && <div className="inspire-category-heading"><span>分类</span><Link href="/inspire/categories"><Folder size={14} aria-hidden="true" />分类管理</Link></div>}
        <div className="inspire-filters" role="group" aria-label="按分类筛选">
          <button type="button" className="inspire-filter-chip" aria-pressed={category === ''} onClick={() => changeCategory('')}><span>全部</span><span className="inspire-filter-count">{allTotal}</span></button>
          {categories.map((item) => <button key={item.category} type="button" className="inspire-filter-chip" aria-pressed={category === item.category} onClick={() => changeCategory(item.category)}><span>{item.category}</span><span className="inspire-filter-count">{item.count}</span></button>)}
        </div>
      </div>
    </aside>

    <section className="inspire-results" aria-label="灵感作品">
      {error && <div className="inspire-empty-state" role="alert"><ImageIcon size={28} aria-hidden="true" /><span>{error}</span><button type="button" className="inspire-empty-action" onClick={reload}><RefreshCw size={15} />重新加载</button></div>}
      {!prompts.length && !isLoading && !error && <div className="inspire-empty-state">
        <ImageIcon size={28} aria-hidden="true" />
        {query ? <><span>没有匹配「{query}」的提示词。</span><button type="button" className="inspire-empty-action" onClick={clearSearch}>清除搜索</button></> : <><span>灵感库还没有内容</span><Link className="studio-primary" href="/workbench?mode=general">开始创作<ArrowUpRight size={15} /></Link></>}
      </div>}
      {prompts.length > 0 && <div className="inspire-grid">
        {prompts.map((item) => <InspirationCard key={item.id} item={item} copied={copiedId === item.id} onInspect={setSelectedPrompt} onCopy={(prompt) => void copyPrompt(prompt)} onUsePrompt={onUsePrompt} />)}
      </div>}
      {isLoading && !prompts.length && <div className="inspire-grid inspire-skeleton-grid" role="status" aria-label="正在加载灵感">
        {Array.from({ length: 8 }, (_, index) => <div className="inspire-card is-skeleton" key={index}><span className="inspire-cover" /><div className="inspire-copy"><span className="skeleton-line" /><span className="skeleton-line skeleton-line-narrow" /></div></div>)}
      </div>}
      {isLoading && prompts.length > 0 && <div className="inspire-loading" aria-label="正在加载"><span /></div>}
      {hasMore && !isLoading && <div ref={sentinelRef} className="inspire-sentinel" aria-hidden="true" />}
      {!hasMore && prompts.length > 0 && <p className="inspire-end-note">已展示全部 {prompts.length} 条</p>}
    </section>

    {selectedPrompt && <InfoDialog title={selectedPrompt.title} subtitle={[selectedPrompt.category, selectedPrompt.source].filter(Boolean).join(' · ')} onClose={() => setSelectedPrompt(null)} hideActions>
      <p className="inspiration-dialog-prompt">{selectedPrompt.prompt}</p>
      <div className="inspiration-dialog-actions">
        <button type="button" className="studio-secondary" onClick={() => void copyPrompt(selectedPrompt)}><Copy size={15} />{copiedId === selectedPrompt.id ? '已复制' : '复制提示词'}</button>
        {onUsePrompt
          ? <button type="button" className="studio-primary" onClick={() => { onUsePrompt(selectedPrompt.prompt); setSelectedPrompt(null) }}>去生图<ArrowUpRight size={15} /></button>
          : <Link className="studio-primary" href={`/workbench?mode=general&prompt=${encodeURIComponent(selectedPrompt.prompt)}`}>去生图<ArrowUpRight size={15} /></Link>}
      </div>
    </InfoDialog>}
  </div>
}
