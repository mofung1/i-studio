'use client'

import { useEffect, useState } from 'react'
import type { ConfigSide } from './shared'

export const CREATOR_LAYOUT_KEY = 'istudio-creator-layout'

export function useCreatorPreferences() {
  const [side, setSide] = useState<ConfigSide>('left')
  const [collapsed, setCollapsed] = useState(false)
  const [desktop, setDesktop] = useState(false)
  const [ready, setReady] = useState(false)
  useEffect(() => {
    const media = window.matchMedia('(min-width: 781px)')
    const update = () => setDesktop(media.matches)
    update()
    media.addEventListener('change', update)
    return () => media.removeEventListener('change', update)
  }, [])
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(CREATOR_LAYOUT_KEY) ?? 'null')
      setSide(saved?.side === 'right' ? 'right' : 'left')
      setCollapsed(saved?.collapsed === true)
    } catch {
      // Corrupt or unavailable preferences must not block the editor.
    }
    setReady(true)
  }, [])
  useEffect(() => {
    if (!ready) return
    try {
      localStorage.setItem(CREATOR_LAYOUT_KEY, JSON.stringify({ side, collapsed }))
    } catch {
      // The layout still works when browser storage is unavailable.
    }
  }, [side, collapsed, ready])
  return {
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
