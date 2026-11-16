'use client'

import { useEffect, useState } from 'react'

function scrollRoot(element: HTMLElement) {
  for (
    let parent = element.parentElement;
    parent && parent !== document.body;
    parent = parent.parentElement
  ) {
    const { overflowY } = window.getComputedStyle(parent)
    if (overflowY === 'auto' || overflowY === 'scroll') return parent
  }
  return null
}

export function useInspirationLoadMore(enabled: boolean, loadMore: () => void) {
  const [sentinel, setSentinel] = useState<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!enabled || !sentinel || typeof IntersectionObserver === 'undefined') return

    let observer: IntersectionObserver | null = null
    let currentRoot: HTMLElement | null = null
    let requested = false
    function observe() {
      if (!sentinel || requested) return
      const root = scrollRoot(sentinel)
      if (observer && root === currentRoot) return

      observer?.disconnect()
      currentRoot = root
      const nextObserver = new IntersectionObserver(
        (entries) => {
          if (
            requested ||
            observer !== nextObserver ||
            !entries.some((entry) => entry.isIntersecting)
          )
            return

          // Observe once per page. The next page can load after this request settles.
          requested = true
          nextObserver.disconnect()
          loadMore()
        },
        { root, rootMargin: '0px 0px 320px' },
      )
      observer = nextObserver
      observer.observe(sentinel)
    }
    observe()
    window.addEventListener('resize', observe)
    return () => {
      observer?.disconnect()
      observer = null
      window.removeEventListener('resize', observe)
    }
  }, [enabled, loadMore, sentinel])

  return setSentinel
}
