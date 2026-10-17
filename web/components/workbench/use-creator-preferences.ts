'use client'

import { useEffect, useState } from 'react'
import type { ConfigSide, WorkbenchMode } from './shared'

export const CREATOR_LAYOUT_KEY = 'istudio-creator-layout'

export const COMMERCE_LAYOUT_KEY = 'istudio-commerce-creator-layout'

export function useCreatorPreferences(scope: WorkbenchMode = 'general') {
  const storageKey = scope === 'commerce' ? COMMERCE_LAYOUT_KEY : CREATOR_LAYOUT_KEY
  const [side, setSide] = useState<ConfigSide>('left')
  const [collapsed, setCollapsed] = useState(false)
  const [desktop, setDesktop] = useState(false)
  const [ready, setReady] = useState<string | null>(null)
  useEffect(() => {
    const media = window.matchMedia('(min-width: 781px)')
    const update = () => setDesktop(media.matches)
    update()
    media.addEventListener('change', update)
    return () => media.removeEventListener('change', update)
  }, [])
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(storageKey) ?? 'null')
      const legacySide = scope === 'commerce' ? localStorage.getItem('istudio-config-side') : null
      setSide((saved?.side ?? legacySide) === 'right' ? 'right' : 'left')
      setCollapsed(saved?.collapsed === true)
    } catch {
      // Corrupt or unavailable preferences must not block the editor.
      setSide('left')
      setCollapsed(false)
    }
    setReady(storageKey)
  }, [scope, storageKey])
  useEffect(() => {
    if (ready !== storageKey) return
    try {
      localStorage.setItem(storageKey, JSON.stringify({ side, collapsed }))
    } catch {
      // The layout still works when browser storage is unavailable.
    }
  }, [side, collapsed, ready, storageKey])
  return {
    desktop,
    side,
    setSide,
    collapsed: desktop && collapsed,
    setCollapsed,
    reset: () => {
      setSide('left')
      setCollapsed(false)
    },
  }
}
