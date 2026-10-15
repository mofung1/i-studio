'use client'

import { Moon, Sun } from 'lucide-react'
import { useRef, useState, useSyncExternalStore } from 'react'
import type { MouseEvent } from 'react'

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

type ViewTransitionLike = {
  finished: Promise<void>
}

type ViewTransitionDocument = Document & {
  startViewTransition?: (update: () => void) => ViewTransitionLike
}

function prefersReducedMotion() {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

function transitionOrigin(button: HTMLButtonElement) {
  const rect = button.getBoundingClientRect()
  const x = rect.left + rect.width / 2
  const y = rect.top + rect.height / 2
  const width = window.innerWidth
  const height = window.innerHeight
  const radius = Math.max(
    Math.hypot(x, y),
    Math.hypot(width - x, y),
    Math.hypot(x, height - y),
    Math.hypot(width - x, height - y),
  )
  return { x, y, radius }
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

  function handleToggle(event: MouseEvent<HTMLButtonElement>) {
    if (transitioningRef.current) return
    const next = !getTheme()
    const origin = transitionOrigin(event.currentTarget)
    const root = document.documentElement
    root.style.setProperty('--theme-transition-x', `${origin.x}px`)
    root.style.setProperty('--theme-transition-y', `${origin.y}px`)
    root.style.setProperty('--theme-transition-radius', `${origin.radius}px`)
    try {
      localStorage.setItem(storageKey, next ? 'dark' : 'light')
    } catch {
      /* Keep the toggle usable when storage is unavailable. */
    }

    transitioningRef.current = true
    setTransitioning(true)
    const reduceMotion = prefersReducedMotion()
    const viewTransition = (document as ViewTransitionDocument).startViewTransition

    if (!reduceMotion && viewTransition) {
      let transition: ViewTransitionLike
      try {
        transition = viewTransition.call(document, () => applyTheme(next))
      } catch {
        applyTheme(next)
        transitioningRef.current = false
        setTransitioning(false)
        return
      }
      const cleanup = () => {
        root.style.removeProperty('--theme-transition-x')
        root.style.removeProperty('--theme-transition-y')
        root.style.removeProperty('--theme-transition-radius')
        transitioningRef.current = false
        setTransitioning(false)
      }
      transition.finished.then(cleanup, cleanup)
      return
    }

    if (reduceMotion) {
      applyTheme(next)
      root.style.removeProperty('--theme-transition-x')
      root.style.removeProperty('--theme-transition-y')
      root.style.removeProperty('--theme-transition-radius')
      transitioningRef.current = false
      setTransitioning(false)
      return
    }

    const fade = addFallbackFade(next)
    applyTheme(next)
    requestAnimationFrame(() => {
      fade.classList.add('is-dismissing')
    })
    window.setTimeout(() => {
      fade.remove()
      root.style.removeProperty('--theme-transition-x')
      root.style.removeProperty('--theme-transition-y')
      root.style.removeProperty('--theme-transition-radius')
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
