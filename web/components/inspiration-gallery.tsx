'use client'

import { DialogActions } from '@/components/dialog-actions'
import {
  ArrowUpRight,
  Check,
  ChevronRight,
  Copy,
  Image as ImageIcon,
  RefreshCw,
  Search,
  X,
} from 'lucide-react'
import Link from 'next/link'
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from 'react'

import { apiBaseUrl } from '@/lib/api'
import { copyText } from '@/lib/clipboard'
import {
  inspirationTemplate,
  inspirationWorkbenchUrl,
  type InspirationTemplate,
} from '@/lib/inspiration-handoff'
import { InfoDialog } from './info-dialog'
import { arrangeInspirationRows, inspirationRowGap } from './inspiration-rows'
import { SavePersonalPrompt } from './save-personal-prompt'
import { useInspirationLoadMore } from './workbench/use-inspiration-load-more'
import { type InspirationPrompt, useInspirationPrompts } from './workbench/use-inspiration-prompts'
import styles from './inspiration-gallery.module.css'

interface InspirationGalleryProps {
  onUsePrompt?: (template: InspirationTemplate) => void
}
interface InspirationCardProps extends InspirationGalleryProps {
  item: InspirationPrompt
  copied: boolean
  onInspect: (item: InspirationPrompt) => void
  onCopy: (item: InspirationPrompt) => void
}

function InspirationImage({ item, className }: { item: InspirationPrompt; className?: string }) {
  const [failed, setFailed] = useState(false)
  useEffect(() => setFailed(false), [item.imageUrl])
  const imageUrl = item.imageUrl.startsWith('/') ? `${apiBaseUrl}${item.imageUrl}` : item.imageUrl
  if (!item.imageUrl || failed)
    return (
      <span className={styles.imageFallback}>
        <ImageIcon size={30} aria-hidden="true" />
        <span>暂无预览</span>
      </span>
    )
  return (
    <img
      className={className}
      src={imageUrl}
      alt={`${item.title}案例图`}
      loading="lazy"
      decoding="async"
      onError={() => setFailed(true)}
    />
  )
}

function UseTemplate({
  item,
  onUsePrompt,
  className,
  compact = false,
}: InspirationGalleryProps & { item: InspirationPrompt; className?: string; compact?: boolean }) {
  const label = '去生图'
  const actionProps = {
    className,
    'aria-label': label,
    title: compact ? label : undefined,
  }
  const content = (
    <>
      <span className={compact ? styles.quickUseLabel : undefined}>{label}</span>
      <ArrowUpRight size={15} aria-hidden="true" />
    </>
  )
  return onUsePrompt ? (
    <button type="button" {...actionProps} onClick={() => onUsePrompt(inspirationTemplate(item))}>
      {content}
    </button>
  ) : (
    <Link
      {...actionProps}
      href={inspirationWorkbenchUrl(item.id)}
      prefetch={compact ? false : undefined}
    >
      {content}
    </Link>
  )
}

function promptSeed(item: InspirationPrompt) {
  return {
    title: item.title,
    prompt: item.prompt,
    source: item.source || '发现灵感',
    favorite: true,
  }
}

function InspirationCard({ item, copied, onInspect, onCopy, onUsePrompt }: InspirationCardProps) {
  return (
    <article className={styles.card}>
      <button
        type="button"
        className={styles.cardTrigger}
        aria-label={`查看${item.title}的提示词`}
        aria-haspopup="dialog"
        onClick={() => onInspect(item)}
      >
        <span className={styles.cover}>
          <InspirationImage item={item} />
        </span>
        <span className={styles.cardCaption}>
          <span className={styles.cardTitle} title={item.title}>
            {item.title}
          </span>
          <ChevronRight size={14} aria-hidden="true" />
        </span>
      </button>
      <div className={styles.cardActions} role="group" aria-label={`${item.title}的快捷操作`}>
        <UseTemplate item={item} onUsePrompt={onUsePrompt} className={styles.quickUse} compact />
        <button
          type="button"
          className={styles.quickIcon}
          aria-label={copied ? '已复制' : '复制提示词'}
          title={copied ? '已复制' : '复制提示词'}
          onClick={() => onCopy(item)}
        >
          {copied ? <Check size={15} aria-hidden="true" /> : <Copy size={15} aria-hidden="true" />}
        </button>
        <SavePersonalPrompt seed={promptSeed(item)} className={styles.quickIcon} iconOnly />
      </div>
    </article>
  )
}

function CategoryChip({
  name,
  count,
  selected,
  onSelect,
}: {
  name: string
  count?: number
  selected: boolean
  onSelect: (name: string) => void
}) {
  return (
    <button
      type="button"
      className={styles.categoryChip}
      aria-pressed={selected}
      title={`${name || '全部'}${count === undefined ? '' : `：全库 ${count} 个模板`}`}
      onClick={() => onSelect(name)}
    >
      <span>{name || '全部'}</span>
    </button>
  )
}

export function InspirationGallery({ onUsePrompt }: InspirationGalleryProps) {
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
    loadMoreError,
    hasMore,
    categoriesLoading,
    categoriesError,
    changeCategory,
    setSearchInput,
    clearSearch,
    resetFilters,
    loadMore,
    reload,
    reloadCategories,
  } = useInspirationPrompts()
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [selectedPrompt, setSelectedPrompt] = useState<InspirationPrompt | null>(null)
  const [copyError, setCopyError] = useState('')
  const resultsRef = useRef<HTMLElement>(null)
  const [resultsWidth, setResultsWidth] = useState(0)
  const copiedTimer = useRef<number | undefined>(undefined)
  const active = useRef(true)
  useEffect(() => {
    active.current = true
    return () => {
      active.current = false
      window.clearTimeout(copiedTimer.current)
    }
  }, [])

  const hasFilters = Boolean(category || searchInput || query)
  useLayoutEffect(() => {
    const results = resultsRef.current
    if (!results) return
    const measure = () => setResultsWidth(results.clientWidth)
    measure()
    if (typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(measure)
    observer.observe(results)
    return () => observer.disconnect()
  }, [])
  const rows = useMemo(
    () => (resultsWidth > 0 ? arrangeInspirationRows(prompts, resultsWidth) : null),
    [prompts, resultsWidth],
  )
  const loadMoreRef = useInspirationLoadMore(
    !onUsePrompt &&
      !selectedPrompt &&
      hasMore &&
      !isLoading &&
      !loadMoreError &&
      searchInput === query,
    loadMore,
  )

  async function copyPrompt(item: InspirationPrompt, showDetailsOnFailure = false) {
    setCopyError('')
    try {
      await copyText(item.prompt)
      if (!active.current) return
      setCopiedId(item.id)
      window.clearTimeout(copiedTimer.current)
      copiedTimer.current = window.setTimeout(() => setCopiedId(null), 2000)
    } catch {
      if (!active.current) return
      setCopyError('浏览器未允许复制，可选中下方提示词后手动复制。')
      if (showDetailsOnFailure) setSelectedPrompt((current) => current ?? item)
    }
  }
  function inspect(item: InspirationPrompt) {
    setCopyError('')
    setSelectedPrompt(item)
  }
  function renderCard(item: InspirationPrompt) {
    return (
      <InspirationCard
        key={item.id}
        item={item}
        copied={copiedId === item.id}
        onInspect={inspect}
        onCopy={(prompt) => void copyPrompt(prompt, true)}
        onUsePrompt={onUsePrompt}
      />
    )
  }

  return (
    <div className={styles.gallery}>
      <span className="sr-only" role="status">
        {!selectedPrompt && copiedId ? '提示词已复制' : ''}
      </span>
      <header className={styles.intro}>
        {onUsePrompt && <h2 className={styles.title}>选择灵感模板</h2>}
        <div className={styles.search} role="search">
          <Search size={18} aria-hidden="true" />
          <input
            type="search"
            placeholder="搜索标题、提示词或来源"
            aria-label="搜索提示词"
            value={searchInput}
            onChange={(event) => setSearchInput(event.target.value)}
          />
          {searchInput && (
            <button
              type="button"
              className={styles.searchClear}
              aria-label="清除搜索"
              onClick={clearSearch}
            >
              <X size={16} aria-hidden="true" />
            </button>
          )}
        </div>
      </header>

      <div className={styles.filters}>
        <div className={styles.categoryRail} role="group" aria-label="按分类筛选">
          <CategoryChip
            name=""
            count={categoriesLoading || categoriesError ? undefined : allTotal}
            selected={category === ''}
            onSelect={changeCategory}
          />
          {categories.map((item) => (
            <CategoryChip
              key={item.category}
              name={item.category}
              count={item.count}
              selected={category === item.category}
              onSelect={changeCategory}
            />
          ))}
        </div>
        {categoriesLoading && !categories.length && (
          <span className={styles.categoryHelp} role="status">
            正在加载分类…
          </span>
        )}
        {categoriesError && (
          <div className={styles.categoryError} role="alert">
            <span>{categoriesError}</span>
            <button type="button" onClick={reloadCategories}>
              重试分类
            </button>
          </div>
        )}
      </div>

      <section
        ref={resultsRef}
        className={styles.results}
        aria-label="灵感作品"
        aria-busy={isLoading}
      >
        <div className={styles.resultsHead}>
          <div>
            <h2 className={styles.resultTitle}>{category || '全部灵感'}</h2>
            <span className={styles.resultCount}>
              {isLoading && !prompts.length ? '正在查找模板…' : `${total} 个模板`}
              {query ? ` · 搜索“${query}”` : ''}
            </span>
          </div>
          {hasFilters && (
            <button type="button" className={styles.reset} onClick={resetFilters}>
              重置筛选
            </button>
          )}
        </div>
        {error && (
          <div className={styles.state} role="alert">
            <ImageIcon className={styles.stateIcon} size={28} aria-hidden="true" />
            <p>{error}</p>
            <button type="button" className={styles.stateAction} onClick={reload}>
              <RefreshCw size={15} aria-hidden="true" />
              重新加载
            </button>
          </div>
        )}
        {!prompts.length && !isLoading && !error && (
          <div className={styles.state}>
            <ImageIcon className={styles.stateIcon} size={30} aria-hidden="true" />
            <p>
              {query
                ? `没有匹配“${query}”的模板${category ? `，当前分类为“${category}”` : ''}。`
                : category
                  ? `“${category}”分类暂无公开模板。`
                  : '灵感库还没有公开模板。'}
            </p>
            {hasFilters ? (
              <button type="button" className={styles.stateAction} onClick={resetFilters}>
                查看全部灵感
              </button>
            ) : (
              <Link className={styles.stateAction} href="/studio?mode=general">
                开始创作
                <ArrowUpRight size={15} aria-hidden="true" />
              </Link>
            )}
          </div>
        )}
        {rows
          ? rows.map((row) => (
              <div
                key={row.items[0]!.id}
                className={styles.galleryRow}
                style={
                  {
                    gridTemplateColumns: row.widths.map((width) => `${width}px`).join(' '),
                    '--cover-height': `${row.height}px`,
                    '--row-gap': `${inspirationRowGap(resultsWidth)}px`,
                  } as CSSProperties
                }
              >
                {row.items.map(renderCard)}
              </div>
            ))
          : prompts.length > 0 && <div className={styles.grid}>{prompts.map(renderCard)}</div>}
        {isLoading && !prompts.length && (
          <div className={styles.grid} role="status" aria-label="正在加载灵感">
            {Array.from({ length: 6 }, (_, index) => (
              <div className={`${styles.card} ${styles.skeleton}`} key={index} aria-hidden="true">
                <span className={styles.cover} />
                <div className={styles.cardCaption}>
                  <span className={styles.skeletonLine} />
                </div>
              </div>
            ))}
          </div>
        )}
        {loadMoreError && (
          <p className={styles.categoryError} role="alert">
            {loadMoreError}
          </p>
        )}
        {hasMore && (
          <div ref={loadMoreRef} className={styles.loadMore}>
            <button
              type="button"
              className={styles.stateAction}
              disabled={isLoading}
              onClick={loadMore}
            >
              {isLoading ? '正在加载…' : loadMoreError ? '重试加载' : '加载更多'}
            </button>
            <span className={styles.resultCount}>
              已显示 {prompts.length} / {total} 个模板
            </span>
          </div>
        )}
        {!hasMore && prompts.length > 0 && !isLoading && (
          <p className={styles.endNote}>
            {prompts.length === total ? '已展示全部' : '本次已展示'} {prompts.length} 个模板
          </p>
        )}
      </section>

      {selectedPrompt && (
        <InfoDialog
          title={selectedPrompt.title}
          subtitle={[selectedPrompt.category, selectedPrompt.source].filter(Boolean).join(' · ')}
          onClose={() => setSelectedPrompt(null)}
          hideActions
          scrollBody
          footer={
            <DialogActions className={styles.detailActions}>
              <button
                type="button"
                className="studio-secondary"
                onClick={() => void copyPrompt(selectedPrompt)}
              >
                {copiedId === selectedPrompt.id ? (
                  <Check size={15} aria-hidden="true" />
                ) : (
                  <Copy size={15} aria-hidden="true" />
                )}
                {copiedId === selectedPrompt.id ? '已复制' : '复制提示词'}
              </button>
              <SavePersonalPrompt seed={promptSeed(selectedPrompt)} />
              <UseTemplate
                item={selectedPrompt}
                className="studio-primary"
                onUsePrompt={
                  onUsePrompt
                    ? (template) => {
                        onUsePrompt(template)
                        setSelectedPrompt(null)
                      }
                    : undefined
                }
              />
            </DialogActions>
          }
        >
          <div className={`dialog-scroll-body ${styles.detailContent}`} data-gallery-scroll>
            <div className={styles.detailArtwork}>
              <InspirationImage item={selectedPrompt} className={styles.detailImage} />
            </div>
            <div
              className={styles.detailText}
              role="region"
              aria-label="提示词详情"
              tabIndex={0}
              data-gallery-scroll
            >
              <span className="sr-only" role="status">
                {copiedId === selectedPrompt.id ? '提示词已复制' : ''}
              </span>
              {copyError && (
                <p className="settings-error" role="alert">
                  {copyError}
                </p>
              )}
              {selectedPrompt.requiresReference && (
                <p className={styles.referenceTag}>
                  <ImageIcon size={14} aria-hidden="true" />
                  此模板需要参考图，请按说明准备自己的素材。
                </p>
              )}
              {selectedPrompt.instructions && (
                <p className={styles.detailInstructions}>使用说明：{selectedPrompt.instructions}</p>
              )}
              <div>
                <h3 className={styles.detailLabel}>提示词</h3>
                <p className={styles.detailPrompt}>{selectedPrompt.prompt}</p>
              </div>
            </div>
          </div>
        </InfoDialog>
      )}
    </div>
  )
}
