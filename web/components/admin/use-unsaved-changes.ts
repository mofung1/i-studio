'use client'

import { useEffect } from 'react'

const navigationEvent = 'istudio-admin-before-navigate'

/** Commands and non-link navigation share the same unsaved-edit confirmation. */
export function confirmAdminNavigation() {
  return window.dispatchEvent(new Event(navigationEvent, { cancelable: true }))
}

export function useAdminUnsavedChanges(dirty: boolean) {
  useEffect(() => {
    if (!dirty) return
    const confirm = (event: Event) => {
      if (!window.confirm('当前配置尚未保存，仍要离开此页面？')) event.preventDefault()
    }
    const beforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault()
      event.returnValue = ''
    }
    const linkClick = (event: MouseEvent) => {
      if (
        event.defaultPrevented ||
        event.button !== 0 ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey
      )
        return
      const link = event.target instanceof Element ? event.target.closest('a[href]') : null
      if (
        !(link instanceof HTMLAnchorElement) ||
        link.hasAttribute('download') ||
        (link.target && link.target !== '_self')
      )
        return
      const target = new URL(link.href, window.location.href)
      const current = new URL(window.location.href)
      if (
        target.origin === current.origin &&
        target.pathname === current.pathname &&
        target.search === current.search
      )
        return
      if (!confirmAdminNavigation()) {
        event.preventDefault()
        event.stopPropagation()
      }
    }
    window.addEventListener(navigationEvent, confirm)
    window.addEventListener('beforeunload', beforeUnload)
    document.addEventListener('click', linkClick, true)
    return () => {
      window.removeEventListener(navigationEvent, confirm)
      window.removeEventListener('beforeunload', beforeUnload)
      document.removeEventListener('click', linkClick, true)
    }
  }, [dirty])
}
