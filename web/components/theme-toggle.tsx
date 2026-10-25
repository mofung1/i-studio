'use client'

import { Moon, Sun } from 'lucide-react'
import { useRef, useState, useSyncExternalStore } from 'react'

const storageKey = 'istudio-theme'
const changeEvent = 'istudio-theme-change'

function getTheme() {
  return document.documentElement.dataset.theme === 'dark'
}

function getServerTheme() {
  return false
}

function savedTheme() {
  try {
    return localStorage.getItem(storageKey)
  } catch {
    return null
  }
}

function applyTheme(dark: boolean) {
  document.documentElement.dataset.theme = dark ? 'dark' : 'light'
  window.dispatchEvent(new Event(changeEvent))
}

function prefersReducedMotion() {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

function addFallbackFade(dark: boolean) {
  const fade = document.createElement('div')
  fade.className = 'theme-transition-fallback'
  fade.style.backgroundColor = dark ? '#151618' : '#ffffff'
  document.body.appendChild(fade)
  return fade
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
  const [transitioning, setTransitioning] = useState(false)
  const transitioningRef = useRef(false)
  const label = dark ? '切换至日间模式' : '切换至夜间模式'

  function handleToggle() {
    if (transitioningRef.current) return
    const next = !getTheme()
    try {
      localStorage.setItem(storageKey, next ? 'dark' : 'light')
    } catch {
      /* Keep the toggle usable when storage is unavailable. */
    }

    transitioningRef.current = true
    setTransitioning(true)
    const reduceMotion = prefersReducedMotion()

    if (reduceMotion) {
      applyTheme(next)
      transitioningRef.current = false
      setTransitioning(false)
      return
    }

    // Root view-transition snapshots can swallow clicks even with pointer-events disabled.
    // Keep the page live beneath a short, non-interactive fade instead.
    const fade = addFallbackFade(next)
    applyTheme(next)
    requestAnimationFrame(() => {
      fade.classList.add('is-dismissing')
    })
    window.setTimeout(() => {
      fade.remove()
      transitioningRef.current = false
      setTransitioning(false)
    }, 240)
  }

  return (
    <button
      type="button"
      className="studio-theme-toggle"
      aria-label={label}
      title={label}
      aria-pressed={dark}
      aria-busy={transitioning}
      disabled={transitioning}
      onClick={handleToggle}
    >
      {dark ? <Sun size={18} aria-hidden="true" /> : <Moon size={18} aria-hidden="true" />}
    </button>
  )
}
