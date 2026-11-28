'use client'

import { Menu, X } from 'lucide-react'
import { useEffect, useRef, useState, type ReactNode } from 'react'

import { AccountMenu } from './account-menu'
import { Brand } from './brand'
import { ThemeToggle } from './theme-toggle'
import { WorkbenchRail, type StudioSection } from './workbench/workbench-rail'

/**
 * 首页专用的全幅外壳：页面本身不占侧栏和顶栏，导航从浮动入口以抽屉形式打开。
 * 抽屉里复用的仍是 WorkbenchRail，避免首页和其它页面出现两套菜单。
 */
export function ImmersiveShell({
  section,
  projectId,
  children,
}: {
  section: StudioSection
  projectId?: string | null
  children: ReactNode
}) {
  const [navigationOpen, setNavigationOpen] = useState(false)
  const dialogRef = useRef<HTMLDialogElement>(null)
  const menuButtonRef = useRef<HTMLButtonElement>(null)
  const closeButtonRef = useRef<HTMLButtonElement>(null)
  const restoreMenuFocusRef = useRef(true)

  useEffect(() => {
    if (!navigationOpen) return
    const root = document.documentElement
    const previousRailState = root.getAttribute('data-studio-rail')
    root.setAttribute('data-studio-rail', 'expanded')
    return () => {
      if (previousRailState === null) root.removeAttribute('data-studio-rail')
      else root.setAttribute('data-studio-rail', previousRailState)
    }
  }, [navigationOpen])

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    const handleClose = () => {
      setNavigationOpen(false)
      if (restoreMenuFocusRef.current) menuButtonRef.current?.focus()
      restoreMenuFocusRef.current = true
    }
    const handleCancel = (event: Event) => {
      event.preventDefault()
      setNavigationOpen(false)
    }
    dialog.addEventListener('close', handleClose)
    dialog.addEventListener('cancel', handleCancel)
    return () => {
      dialog.removeEventListener('close', handleClose)
      dialog.removeEventListener('cancel', handleCancel)
    }
  }, [])

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    if (!navigationOpen) {
      if (dialog.open) dialog.close()
      return
    }
    if (!dialog.open) dialog.showModal()
    const previousOverflow = document.documentElement.style.overflow
    document.documentElement.style.overflow = 'hidden'
    const frame = requestAnimationFrame(() => {
      if (dialog.open) closeButtonRef.current?.focus()
    })
    return () => {
      cancelAnimationFrame(frame)
      document.documentElement.style.overflow = previousOverflow
    }
  }, [navigationOpen])

  function closeNavigation() {
    setNavigationOpen(false)
  }

  function closeNavigationForFeedback() {
    // Release the native modal before the shared feedback dialog takes focus.
    restoreMenuFocusRef.current = false
    dialogRef.current?.close()
    setNavigationOpen(false)
  }

  return (
    <div className="studio-shell studio-shell--immersive">
      <a className="skip-link" href="#studio-main">
        跳至主要内容
      </a>
      <header className="studio-home-chrome">
        <div className="studio-home-chrome-start">
          <div className="studio-home-brand">
            <Brand href="/home" />
          </div>
          <button
            ref={menuButtonRef}
            type="button"
            className="studio-home-menu"
            aria-label="打开工作台导航"
            aria-haspopup="dialog"
            aria-expanded={navigationOpen}
            aria-controls="studio-home-drawer"
            onClick={() => setNavigationOpen(true)}
          >
            <Menu size={17} aria-hidden="true" />
            <span>菜单</span>
          </button>
        </div>
        <div className="studio-home-chrome-end">
          <ThemeToggle />
          <AccountMenu />
        </div>
      </header>
      <div className="studio-content studio-content--immersive" id="studio-main" tabIndex={-1}>
        {children}
      </div>
      <dialog
        ref={dialogRef}
        id="studio-home-drawer"
        className="studio-home-drawer"
        aria-label="工作台导航"
        onClick={(event) => {
          if (event.target === event.currentTarget) closeNavigation()
          else if ((event.target as Element).closest('a')) closeNavigation()
        }}
      >
        <div className="studio-home-drawer-panel">
          <button
            ref={closeButtonRef}
            type="button"
            className="studio-home-drawer-close"
            aria-label="关闭工作台导航"
            onClick={closeNavigation}
          >
            <X size={18} aria-hidden="true" />
          </button>
          <WorkbenchRail
            section={section}
            projectId={projectId ?? null}
            onOpenFeedback={closeNavigationForFeedback}
          />
        </div>
      </dialog>
    </div>
  )
}
