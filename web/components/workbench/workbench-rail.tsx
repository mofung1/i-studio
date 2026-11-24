'use client'

import {
  BookMarked,
  Box,
  ChevronDown,
  Copy,
  Folder,
  Image as ImageIcon,
  Images,
  LayoutGrid,
  Frame,
  Menu,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  Settings,
  Shirt,
  Sparkles,
  WandSparkles,
  X,
} from 'lucide-react'
import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'

import { Brand } from '@/components/brand'
import { FeedbackButton } from '@/components/feedback-provider'
import type { CommerceTaskType } from '@/lib/contracts'
import { preserveStudioProject, studioToolUrl } from '@/lib/studio-navigation'
import { commerceTasks, type WorkbenchMode } from './shared'

export type StudioSection =
  | 'general'
  | 'commerce'
  | 'inspire'
  | 'history'
  | 'assets'
  | 'settings'
  | 'prompts'
  | 'products'
  | 'canvas'

interface WorkbenchRailProps {
  mode?: WorkbenchMode
  section?: StudioSection
  task?: CommerceTaskType
  projectId?: string | null
  onChangeMode?: (mode: WorkbenchMode) => void
  onChangeTask?: (task: CommerceTaskType) => void
}

const taskIcons = {
  'product-main': Box,
  'detail-page': Images,
  'viral-recreate': Copy,
  'product-retouch': WandSparkles,
  'clothing-set': Shirt,
}

export function WorkbenchRail({
  mode,
  section = mode ?? 'general',
  task,
  projectId,
  onChangeMode,
  onChangeTask,
}: WorkbenchRailProps) {
  const project = projectId ? new URLSearchParams({ projectId }) : undefined
  const inCommerce = section === 'commerce'
  const [collapsed, setCollapsed] = useState(false)
  const [commerceExpanded, setCommerceExpanded] = useState(true)
  const [navigationOpen, setNavigationOpen] = useState(false)
  const navigationToggle = useRef<HTMLButtonElement>(null)
  const rail = useRef<HTMLElement>(null)
  useEffect(() => {
    if (!navigationOpen) return
    const closeOutside = (event: PointerEvent) => {
      if (!rail.current?.contains(event.target as Node)) setNavigationOpen(false)
    }
    document.addEventListener('pointerdown', closeOutside)
    return () => document.removeEventListener('pointerdown', closeOutside)
  }, [navigationOpen])
  useEffect(() => {
    try {
      setCollapsed(window.localStorage.getItem('istudio-rail-collapsed') === 'true')
    } catch {
      /* Storage may be unavailable. */
    }
  }, [])

  function toggleRail() {
    const next = !collapsed
    setCollapsed(next)
    document.documentElement.setAttribute('data-studio-rail', next ? 'collapsed' : 'expanded')
    try {
      window.localStorage.setItem('istudio-rail-collapsed', String(next))
    } catch {
      /* Collapse still works without persistence. */
    }
  }

  return (
    <aside
      className={`workbench-rail${navigationOpen ? ' is-navigation-open' : ''}`}
      aria-label="工作台导航"
      ref={rail}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null))
          setNavigationOpen(false)
      }}
      onKeyDown={(event) => {
        if (event.key === 'Escape' && navigationOpen) {
          event.preventDefault()
          setNavigationOpen(false)
          navigationToggle.current?.focus()
        }
      }}
    >
      <div className="studio-rail-heading">
        <div className="workbench-rail-brand">
          <Brand />
        </div>
        <button
          ref={navigationToggle}
          type="button"
          className="studio-mobile-navigation-toggle"
          aria-label={navigationOpen ? '收起导航' : '展开导航'}
          aria-expanded={navigationOpen}
          aria-controls="studio-navigation studio-rail-footer"
          onClick={() => setNavigationOpen((open) => !open)}
        >
          {navigationOpen ? (
            <X size={20} aria-hidden="true" />
          ) : (
            <Menu size={20} aria-hidden="true" />
          )}
        </button>
      </div>
      <button
        type="button"
        className="studio-rail-toggle"
        aria-label={collapsed ? '展开侧边栏' : '收起侧边栏'}
        aria-expanded={!collapsed}
        aria-controls="studio-navigation"
        onClick={toggleRail}
      >
        {collapsed ? (
          <PanelLeftOpen size={17} strokeWidth={1.75} aria-hidden="true" />
        ) : (
          <PanelLeftClose size={17} strokeWidth={1.75} aria-hidden="true" />
        )}
        <span className="studio-rail-toggle-label" aria-hidden="true">
          {collapsed ? '展开侧边栏' : '收起侧边栏'}
        </span>
      </button>
      <a
        className="studio-new"
        href={studioToolUrl('general', undefined, project)}
        aria-label="新建创作"
        title="新建创作"
      >
        <Plus size={18} />
        <span>新建创作</span>
      </a>
      <nav
        id="studio-navigation"
        className="workbench-rail-nav"
        aria-label="主导航"
        onClick={(event) => {
          const action = (event.target as Element).closest('a, button')
          if (navigationOpen && action && !action.classList.contains('studio-commerce-toggle')) {
            setNavigationOpen(false)
            navigationToggle.current?.focus()
          }
        }}
      >
        {onChangeMode ? (
          <button
            type="button"
            className={section === 'general' ? 'active' : ''}
            aria-label="AI 生图"
            title="AI 生图"
            aria-pressed={section === 'general'}
            onClick={() => onChangeMode('general')}
          >
            <ImageIcon size={18} />
            <span>AI 生图</span>
          </button>
        ) : (
          <Link
            href={studioToolUrl('general', undefined, project)}
            className={section === 'general' ? 'active' : ''}
            aria-label="AI 生图"
            title="AI 生图"
            aria-current={section === 'general' ? 'page' : undefined}
          >
            <ImageIcon size={18} />
            <span>AI 生图</span>
          </Link>
        )}
        <Link
          href={preserveStudioProject('/products', project)}
          className={section === 'products' ? 'active' : ''}
          aria-label="商品管理"
          title="商品管理"
          aria-current={section === 'products' ? 'page' : undefined}
        >
          <Box size={18} />
          <span>商品管理</span>
        </Link>
        <Link
          href="/canvas"
          className={section === 'canvas' ? 'active' : ''}
          aria-label="画布"
          title="画布"
          aria-current={section === 'canvas' ? 'page' : undefined}
        >
          <Frame size={18} />
          <span>画布</span>
        </Link>
        {inCommerce ? (
          <button
            type="button"
            className={`studio-commerce-toggle${commerceExpanded ? '' : ' active'}`}
            aria-label="电商工具"
            aria-expanded={commerceExpanded}
            aria-controls="studio-commerce-tools"
            title={commerceExpanded ? '收起电商工具子菜单' : '展开电商工具子菜单'}
            onClick={() => setCommerceExpanded((expanded) => !expanded)}
          >
            <LayoutGrid size={18} aria-hidden="true" />
            <span>电商工具</span>
            <ChevronDown className="studio-commerce-chevron" size={14} aria-hidden="true" />
          </button>
        ) : onChangeTask ? (
          <button
            type="button"
            aria-label="电商工具"
            title="电商工具"
            onClick={() => {
              setCommerceExpanded(true)
              onChangeTask('product-main')
            }}
          >
            <LayoutGrid size={18} aria-hidden="true" />
            <span>电商工具</span>
          </button>
        ) : (
          <Link
            href={studioToolUrl('commerce', 'product-main', project)}
            aria-label="电商工具"
            title="电商工具"
          >
            <LayoutGrid size={18} aria-hidden="true" />
            <span>电商工具</span>
          </Link>
        )}
        {inCommerce && (
          <div
            id="studio-commerce-tools"
            className="studio-task-nav"
            role="group"
            aria-label="电商任务"
            hidden={!commerceExpanded}
          >
            {commerceTasks.map(([id, meta]) => {
              const Icon = taskIcons[id]
              const content = (
                <>
                  <Icon size={15} aria-hidden="true" />
                  <span>{meta.title}</span>
                </>
              )
              return onChangeTask ? (
                <button
                  type="button"
                  key={id}
                  aria-label={meta.title}
                  title={meta.title}
                  aria-pressed={task === id}
                  onClick={() => onChangeTask(id)}
                >
                  {content}
                </button>
              ) : (
                <Link
                  key={id}
                  href={studioToolUrl('commerce', id, project)}
                  aria-label={meta.title}
                  title={meta.title}
                  aria-current={task === id ? 'page' : undefined}
                >
                  {content}
                </Link>
              )
            })}
          </div>
        )}
        <Link
          href="/inspire"
          className={section === 'inspire' ? 'active' : ''}
          aria-label="发现灵感"
          title="发现灵感"
          aria-current={section === 'inspire' ? 'page' : undefined}
        >
          <Sparkles size={18} />
          <span>发现灵感</span>
        </Link>
        <Link
          href="/prompts"
          className={section === 'prompts' ? 'active' : ''}
          aria-label="我的提示词"
          title="我的提示词"
          aria-current={section === 'prompts' ? 'page' : undefined}
        >
          <BookMarked size={18} />
          <span>我的提示词</span>
        </Link>
        <Link
          href="/assets"
          className={section === 'assets' || section === 'history' ? 'active' : ''}
          aria-label="我的资产"
          title="我的资产"
          aria-current={section === 'assets' || section === 'history' ? 'page' : undefined}
        >
          <Folder size={18} />
          <span>我的资产</span>
        </Link>
      </nav>
      <div
        id="studio-rail-footer"
        className="studio-rail-footer"
        onClick={() => setNavigationOpen(false)}
      >
        <FeedbackButton />
        <Link
          href="/account"
          aria-label="个人中心"
          title="个人中心"
          aria-current={section === 'settings' ? 'page' : undefined}
        >
          <Settings size={18} />
          <span>个人中心</span>
        </Link>
      </div>
    </aside>
  )
}
