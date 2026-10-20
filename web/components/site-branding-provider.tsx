'use client'

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import {
  defaultSiteBranding,
  readSiteBranding,
  siteLogoUrl,
  type SiteBranding,
} from '@/lib/site-settings'

const SiteBrandingContext = createContext({
  branding: defaultSiteBranding,
  updateBranding: (_branding: SiteBranding) => {},
})

export function SiteBrandingProvider({
  initialBranding,
  children,
}: {
  initialBranding: SiteBranding
  children: ReactNode
}) {
  const [branding, setBranding] = useState(initialBranding)
  const revision = useRef(0)
  const updateBranding = useCallback((next: SiteBranding) => {
    revision.current++
    setBranding(next)
    try {
      localStorage.setItem('istudio-branding-changed', String(Date.now()))
    } catch {
      /* Saving still works without local storage. */
    }
  }, [])

  useEffect(() => {
    const controller = new AbortController()
    const refresh = async () => {
      const current = ++revision.current
      try {
        const next = await readSiteBranding(controller.signal)
        if (current === revision.current) setBranding(next)
      } catch {
        /* Keep the last known branding while the API is unavailable. */
      }
    }
    const onStorage = (event: StorageEvent) => {
      if (event.key === 'istudio-branding-changed') void refresh()
    }
    const onVisibility = () => {
      if (document.visibilityState === 'visible') void refresh()
    }
    window.addEventListener('focus', refresh)
    window.addEventListener('storage', onStorage)
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      controller.abort()
      window.removeEventListener('focus', refresh)
      window.removeEventListener('storage', onStorage)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [])

  useEffect(() => {
    // Next.js owns page titles. Updating branding must not erase route-specific metadata.
    const icons = document.querySelectorAll<HTMLLinkElement>('link[rel="icon"]')
    const url = siteLogoUrl(branding.logoPath) || '/icon.svg'
    icons.forEach((icon) => {
      icon.href = url
      icon.removeAttribute('type')
      icon.removeAttribute('sizes')
    })
  }, [branding])

  return (
    <SiteBrandingContext.Provider value={{ branding, updateBranding }}>
      {children}
    </SiteBrandingContext.Provider>
  )
}

export const useSiteBranding = () => useContext(SiteBrandingContext)
