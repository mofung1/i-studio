'use client'

import { Moon, Sun } from 'lucide-react'
import { useSyncExternalStore } from 'react'

const storageKey = 'istudio-theme'
const changeEvent = 'istudio-theme-change'

function getTheme() {
  return document.documentElement.dataset.theme === 'dark'
}

function getServerTheme() {
  return false
}

function savedTheme() {
  try { return localStorage.getItem(storageKey) } catch { return null }
}

function applyTheme(dark: boolean) {
  document.documentElement.dataset.theme = dark ? 'dark' : 'light'
  window.dispatchEvent(new Event(changeEvent))
}

function subscribe(onChange: () => void) {
  const media = window.matchMedia('(prefers-color-scheme: dark)')
  const onSystemChange = () => {
    if (!savedTheme()) applyTheme(media.matches)
  }
  const onStorageChange = (event: StorageEvent) => {
    if (event.key !== storageKey && event.key !== null) return
    const saved = savedTheme()
    applyTheme(saved === 'dark' || (saved !== 'light' && media.matches))
  }
  window.addEventListener(changeEvent, onChange)
  window.addEventListener('storage', onStorageChange)
  media.addEventListener('change', onSystemChange)
  return () => {
    window.removeEventListener(changeEvent, onChange)
    window.removeEventListener('storage', onStorageChange)
    media.removeEventListener('change', onSystemChange)
  }
}

export function ThemeToggle() {
  const dark = useSyncExternalStore(subscribe, getTheme, getServerTheme)
  const label = dark ? '切换至日间模式' : '切换至夜间模式'

  return <button type="button" className="studio-theme-toggle" aria-label={label} title={label} aria-pressed={dark} onClick={() => {
    const next = !getTheme()
    try { localStorage.setItem(storageKey, next ? 'dark' : 'light') } catch { /* Keep the toggle usable when storage is unavailable. */ }
    applyTheme(next)
  }}>
    {dark ? <Sun size={18} aria-hidden="true" /> : <Moon size={18} aria-hidden="true" />}
  </button>
}
