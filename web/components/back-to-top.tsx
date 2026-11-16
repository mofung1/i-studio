'use client'

import { ArrowUp } from 'lucide-react'
import { useEffect, useState } from 'react'

const showAfter = 480

export function BackToTop({ targetId }: { targetId: string }) {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const target = document.getElementById(targetId)
    if (!target) return

    function updateVisibility() {
      setVisible(Math.max(target?.scrollTop ?? 0, window.scrollY) >= showAfter)
    }

    updateVisibility()
    target.addEventListener('scroll', updateVisibility, { passive: true })
    window.addEventListener('scroll', updateVisibility, { passive: true })
    return () => {
      target.removeEventListener('scroll', updateVisibility)
      window.removeEventListener('scroll', updateVisibility)
    }
  }, [targetId])

  function goToTop() {
    const target = document.getElementById(targetId)
    const behavior = window.matchMedia('(prefers-reduced-motion: reduce)').matches
      ? 'instant'
      : 'smooth'

    target?.focus({ preventScroll: true })
    if (target?.scrollTop) target.scrollTo({ top: 0, behavior })
    if (window.scrollY) window.scrollTo({ top: 0, behavior })
  }

  if (!visible) return null

  return (
    <button
      type="button"
      className="studio-back-to-top"
      aria-label="回到顶部"
      title="回到顶部"
      onClick={goToTop}
    >
      <ArrowUp size={19} aria-hidden="true" />
    </button>
  )
}
