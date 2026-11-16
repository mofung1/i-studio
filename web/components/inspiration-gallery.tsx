'use client'

import { DialogActions } from '@/components/dialog-actions'
import {
  ArrowUpRight,
  Check,
  ChevronDown,
  Copy,
  Image as ImageIcon,
  RefreshCw,
  Search,
  X,
} from 'lucide-react'
import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'

import { apiBaseUrl } from '@/lib/api'
import { copyText } from '@/lib/clipboard'
import {
  inspirationTemplate,
  inspirationWorkbenchUrl,
  type InspirationTemplate,
} from '@/lib/inspiration-handoff'
import { InfoDialog } from './info-dialog'
import { SavePersonalPrompt } from './save-personal-prompt'
import {
  type InspirationPrompt,
  type InspirationCategory,
  useInspirationPrompts,
} from './workbench/use-inspiration-prompts'
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
}: InspirationGalleryProps & { item: InspirationPrompt; className?: string }) {
  const content = (
    <>
      去生图
      <ArrowUpRight size={15} aria-hidden="true" />
    </>
  )
  return onUsePrompt ? (
    <button
      type="button"
      className={className}
      onClick={() => onUsePrompt(inspirationTemplate(item))}
    >
      {content}
    </button>
  ) : (
    <Link className={className} href={inspirationWorkbenchUrl(item.id)}>
      {content}
    </Link>
  )
}

export function InspirationCard({
  item,
  copied,
  onInspect,
  onCopy,
  onUsePrompt,
}: InspirationCardProps) {
  return (
    <article className={styles.card}>
      <SavePersonalPrompt
        iconOnly
        className={styles.save}
        seed={{
          title: item.title,
          prompt: item.prompt,
          source: item.source || '发现灵感',
          favorite: true,
        }}
      />
      <button
        type="button"
        className={styles.cover}
        aria-label={`查看${item.title}的提示词`}
        aria-haspopup="dialog"
        onClick={() => onInspect(item)}
      >
        <InspirationImage item={item} />
      </button>
      <div className={styles.cardBody}>
        <h3 className={styles.cardTitle} title={item.title}>
          {item.title}
        </h3>
        <div className={styles.cardMeta}>
          <span className={styles.categoryTag} title={item.category}>
            {item.category || '未分类'}
          </span>
          {item.requiresReference && (
            <span className={styles.referenceTag}>
              <ImageIcon size={13} aria-hidden="true" />
              需参考图
            </span>
          )}
        </div>
        <p className={styles.source} title={item.source} aria-hidden={!item.source || undefined}>
          {item.source || '\u00a0'}
        </p>
      </div>
      <div className={styles.cardActions}>
        <button
          type="button"
          className={styles.copyButton}
          aria-label="复制提示词"
          onClick={() => onCopy(item)}
        >
          {copied ? <Check size={15} aria-hidden="true" /> : <Copy size={15} aria-hidden="true" />}
          {copied ? '已复制' : '复制'}
        </button>
        <UseTemplate item={item} onUsePrompt={onUsePrompt} className={styles.startButton} />
      </div>
    </article>
  )
}

function CategoryChip({
  name,
  count,
  selected,
  secondary = false,
  onSelect,
}: {
  name: string
  count?: number
  selected: boolean
  secondary?: boolean
  onSelect: (name: string) => void
}) {
  return (
    <button
      type="button"
      className={styles.categoryChip}
      aria-pressed={selected}
      data-secondary-category={secondary || undefined}
      title={`${name || '全部'}${count === undefined ? '' : `：全库 ${count} 个模板`}`}
      onClick={() => onSelect(name)}
    >
      <span>{name || '全部'}</span>
      {count !== undefined && <span className={styles.categoryCount}>{count}</span>}
    </button>
  )
}

function CategoryPicker({
  categories,
  selected,
  onSelect,
  onClose,
}: {
  categories: InspirationCategory[]
  selected: string
  onSelect: (category: string) => void
  onClose: () => void
}) {
  const [search, setSearch] = useState('')
  const visible = categories.filter((item) =>
    item.category.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()),
  )
  return (
    <InfoDialog title="全部分类" onClose={onClose} hideActions>
      <div className={styles.categoryDialog}>
        <label className={styles.categorySearch}>
          <Search size={17} aria-hidden="true" />
          <input
            type="search"
            aria-label="搜索分类"
            placeholder="查找分类名称"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </label>
        <p className={styles.categoryHelp}>选择一个分类，浏览其中的创作模板。</p>
        <div
          className={styles.categoryList}
          role="group"
          aria-label="全部灵感分类"
          data-gallery-scroll
        >
          {!search.trim() && (
            <button
              type="button"
              className={styles.categoryOption}
              aria-pressed={selected === ''}
              onClick={() => onSelect('')}
            >
              <span className={styles.categoryName}>全部灵感</span>
              {selected === '' && <Check size={16} aria-hidden="true" />}
            </button>
          )}
          {visible.map((item) => (
            <button
              key={item.category}
              type="button"
              className={styles.categoryOption}
              aria-pressed={selected === item.category}
              onClick={() => onSelect(item.category)}
            >
              <span className={styles.categoryName}>{item.category}</span>
              <span className={styles.categoryCount}>{item.count}</span>
              {selected === item.category && <Check size={16} aria-hidden="true" />}
            </button>
          ))}
          {!visible.length && (
            <p className={styles.categoryHelp}>
              {search ? '没有匹配的分类，试试其他关键词。' : '暂无可用分类，可先浏览全部灵感。'}
            </p>
          )}
        </div>
      </div>
    </InfoDialog>
  )
}

/** A regular image grid with one shared search/category query and explicit pagination. */
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
  const [showCategories, setShowCategories] = useState(false)
  const galleryRef = useRef<HTMLDivElement>(null)
  const copiedTimer = useRef<number | undefined>(undefined)
  const active = useRef(true)
  useEffect(() => {
    active.current = true
    return () => {
      active.current = false
      window.clearTimeout(copiedTimer.current)
    }
  }, [])

  const primaryCategories = categories.slice(0, 6)
  const selectedOutsidePrimary =
    category && !primaryCategories.some((item) => item.category === category)
  const selectedCategory = categories.find((item) => item.category === category)
  const hasFilters = Boolean(category || searchInput || query)

  async function copyPrompt(item: InspirationPrompt) {
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
      setSelectedPrompt(item)
    }
  }
  function inspect(item: InspirationPrompt) {
    setCopyError('')
    setSelectedPrompt(item)
  }
  function selectCategory(next: string) {
    changeCategory(next)
    galleryRef.current?.scrollIntoView?.({ block: 'start' })
  }
  function resetGallery() {
    resetFilters()
    galleryRef.current?.scrollIntoView?.({ block: 'start' })
  }

  return (
    <div ref={galleryRef} className={styles.gallery}>
      <header className={styles.intro}>
        <div>
          {onUsePrompt ? (
            <h2 className={styles.title}>选择灵感模板</h2>
          ) : (
            <h1 className={styles.title}>发现灵感</h1>
          )}
          <p className={styles.description}>浏览创作案例，挑选提示词开始下一张作品。</p>
        </div>
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
        <span className={styles.filterLabel}>分类</span>
        <div role="group" aria-label="按分类筛选">
          <CategoryChip
            name=""
            count={categoriesLoading || categoriesError ? undefined : allTotal}
            selected={category === ''}
            onSelect={selectCategory}
          />
          {primaryCategories.map((item, index) => (
            <CategoryChip
              key={item.category}
              name={item.category}
              count={item.count}
              selected={category === item.category}
              secondary={index >= 3}
              onSelect={selectCategory}
            />
          ))}
          {selectedOutsidePrimary && (
            <CategoryChip
              name={category}
              count={selectedCategory?.count}
              selected
              onSelect={selectCategory}
            />
          )}
          {categories.length > 0 && (
            <button
              type="button"
              className={styles.allCategories}
              aria-label="全部分类"
              aria-haspopup="dialog"
              onClick={() => setShowCategories(true)}
            >
              全部分类
              <ChevronDown size={15} aria-hidden="true" />
            </button>
          )}
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

      <section className={styles.results} aria-label="灵感作品" aria-busy={isLoading}>
        <div className={styles.resultsHead}>
          <div>
            <h2 className={styles.resultTitle}>{category || '全部灵感'}</h2>
            <span className={styles.resultCount}>
              {isLoading && !prompts.length ? '正在查找模板…' : `${total} 个模板`}
              {query ? ` · 搜索“${query}”` : ''}
            </span>
          </div>
          {hasFilters && (
            <button type="button" className={styles.reset} onClick={resetGallery}>
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
              <button type="button" className={styles.stateAction} onClick={resetGallery}>
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
        {prompts.length > 0 && (
          <div className={styles.grid}>
            {prompts.map((item) => (
              <InspirationCard
                key={item.id}
                item={item}
                copied={copiedId === item.id}
                onInspect={inspect}
                onCopy={(item) => void copyPrompt(item)}
                onUsePrompt={onUsePrompt}
              />
            ))}
          </div>
        )}
        {isLoading && !prompts.length && (
          <div className={styles.grid} role="status" aria-label="正在加载灵感">
            {Array.from({ length: 6 }, (_, index) => (
              <div className={`${styles.card} ${styles.skeleton}`} key={index} aria-hidden="true">
                <span className={styles.cover} />
                <div className={styles.cardBody}>
                  <span className={styles.skeletonLine} />
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
          <div className={styles.loadMore}>
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

      {showCategories && (
        <CategoryPicker
          categories={categories}
          selected={category}
          onClose={() => setShowCategories(false)}
          onSelect={(next) => {
            selectCategory(next)
            setShowCategories(false)
          }}
        />
      )}
      {selectedPrompt && (
        <InfoDialog
          title={selectedPrompt.title}
          subtitle={[selectedPrompt.category, selectedPrompt.source].filter(Boolean).join(' · ')}
          onClose={() => setSelectedPrompt(null)}
          hideActions
          scrollBody
          footer={
            <DialogActions className="inspiration-dialog-actions">
              <button
                type="button"
                className="studio-secondary"
                onClick={() => void copyPrompt(selectedPrompt)}
              >
                <Copy size={15} aria-hidden="true" />
                {copiedId === selectedPrompt.id ? '已复制' : '复制提示词'}
              </button>
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
            <InspirationImage item={selectedPrompt} className={styles.detailImage} />
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
            <p className={styles.detailPrompt}>{selectedPrompt.prompt}</p>
          </div>
        </InfoDialog>
      )}
    </div>
  )
}
