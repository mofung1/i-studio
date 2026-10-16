'use client'

import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type PointerEvent,
  type KeyboardEvent,
} from 'react'
import type { ConfigSide } from './shared'

type Preview = { side: ConfigSide; left: number; top: number; width: number; height: number }

/** Drag only the grip; keep the canvas in place until the panel docks. */
export function usePanelDock({
  enabled,
  collapsed,
  side,
  onDock,
}: {
  enabled: boolean
  collapsed: boolean
  side: ConfigSide
  onDock?: (side: ConfigSide) => void
}) {
  const panelRef = useRef<HTMLElement>(null)
  const frame = useRef(0)
  const pending = useRef<DOMRect | null>(null)
  const drag = useRef<{
    pointerId: number
    handle: HTMLButtonElement
    startX: number
    startY: number
    grabX: number
    grabY: number
    base: DOMRect
    left: number
    right: number
    top: number
    bottom: number
    active: boolean
    target: ConfigSide
  } | null>(null)
  const [preview, setPreview] = useState<Preview | null>(null)
  const options = useRef({ side, onDock })
  options.current = { side, onDock }

  function stopMotion() {
    cancelAnimationFrame(frame.current)
    frame.current = 0
  }
  function settle() {
    const node = panelRef.current
    const previous = pending.current
    pending.current = null
    if (!node || !previous) return
    stopMotion()
    node.style.transform = ''
    const next = node.getBoundingClientRect()
    let x = previous.left - next.left
    let y = previous.top - next.top
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    let vx = 0
    let vy = 0
    let last = performance.now()
    const tick = (now: number) => {
      const dt = Math.min((now - last) / 1000, 0.032)
      last = now
      vx += (-260 * x - 33 * vx) * dt
      vy += (-260 * y - 33 * vy) * dt
      x += vx * dt
      y += vy * dt
      node.style.transform = `translate(${x}px, ${y}px)`
      if (Math.abs(x) + Math.abs(y) < 0.4 && Math.abs(vx) + Math.abs(vy) < 4) {
        node.style.transform = ''
        frame.current = 0
      } else frame.current = requestAnimationFrame(tick)
    }
    node.style.transform = `translate(${x}px, ${y}px)`
    frame.current = requestAnimationFrame(tick)
  }
  useLayoutEffect(settle, [side])

  function finish(cancelled: boolean) {
    const current = drag.current
    const node = panelRef.current
    if (!current || !node) return
    drag.current = null
    pending.current = node.getBoundingClientRect()
    if (current.handle.hasPointerCapture?.(current.pointerId))
      current.handle.releasePointerCapture(current.pointerId)
    setPreview(null)
    const target = cancelled ? options.current.side : current.target
    if (current.active && target !== options.current.side) options.current.onDock?.(target)
    else settle()
  }
  function moveTo(target: ConfigSide) {
    if (target === options.current.side) return
    pending.current = panelRef.current?.getBoundingClientRect() ?? null
    options.current.onDock?.(target)
  }
  const cancel = useRef(() => finish(true))
  cancel.current = () => finish(true)
  useEffect(() => {
    const reset = () => {
      cancel.current()
      stopMotion()
      if (panelRef.current) panelRef.current.style.transform = ''
    }
    const escape = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape' && drag.current) {
        event.preventDefault()
        cancel.current()
      }
    }
    window.addEventListener('resize', reset)
    window.addEventListener('blur', reset)
    window.addEventListener('keydown', escape)
    return () => {
      stopMotion()
      window.removeEventListener('resize', reset)
      window.removeEventListener('blur', reset)
      window.removeEventListener('keydown', escape)
    }
  }, [])
  useEffect(() => {
    if (!enabled || collapsed) {
      cancel.current()
      stopMotion()
      if (panelRef.current) panelRef.current.style.transform = ''
    }
  }, [enabled, collapsed])

  return {
    panelRef,
    preview,
    moveTo,
    handleProps: {
      onPointerDown(event: PointerEvent<HTMLButtonElement>) {
        if (
          drag.current ||
          !enabled ||
          collapsed ||
          event.button !== 0 ||
          !window.matchMedia('(min-width: 781px)').matches
        )
          return
        const node = panelRef.current
        const shell = node?.closest('.workbench-shell')
        const header = shell?.querySelector('.workbench-nav')
        const rail = shell?.querySelector('.workbench-rail')
        if (!node || !shell || !header || !rail) return
        const visual = node.getBoundingClientRect()
        stopMotion()
        node.style.transform = ''
        const base = node.getBoundingClientRect()
        node.style.transform = `translate(${visual.left - base.left}px, ${visual.top - base.top}px)`
        const bounds = shell.getBoundingClientRect()
        const gap = parseFloat(window.getComputedStyle(shell).columnGap) || 16
        drag.current = {
          pointerId: event.pointerId,
          handle: event.currentTarget,
          startX: event.clientX,
          startY: event.clientY,
          grabX: event.clientX - visual.left,
          grabY: event.clientY - visual.top,
          base,
          left: rail.getBoundingClientRect().right + gap,
          right: bounds.right,
          top: header.getBoundingClientRect().bottom + gap,
          bottom: bounds.bottom,
          active: false,
          target: side,
        }
        event.currentTarget.setPointerCapture(event.pointerId)
        event.preventDefault()
        event.currentTarget.focus({ preventScroll: true })
      },
      onPointerMove(event: PointerEvent<HTMLButtonElement>) {
        const current = drag.current
        const node = panelRef.current
        if (!current || !node || event.pointerId !== current.pointerId) return
        if (
          !current.active &&
          Math.hypot(event.clientX - current.startX, event.clientY - current.startY) < 6
        )
          return
        current.active = true
        const x = Math.max(
          current.left,
          Math.min(event.clientX - current.grabX, current.right - current.base.width),
        )
        const y = Math.max(
          current.top,
          Math.min(event.clientY - current.grabY, current.bottom - current.base.height),
        )
        node.style.transform = `translate(${x - current.base.left}px,${y - current.base.top}px)`
        current.target =
          x + current.base.width / 2 < (current.left + current.right) / 2 ? 'left' : 'right'
        const target = current.target
        setPreview((previous) =>
          previous?.side === target
            ? previous
            : {
                side: target,
                left: target === 'left' ? current.left : current.right - current.base.width,
                top: current.top,
                width: current.base.width,
                height: Math.max(0, current.bottom - current.top),
              },
        )
      },
      onPointerUp(event: PointerEvent<HTMLButtonElement>) {
        if (drag.current?.pointerId === event.pointerId) finish(false)
      },
      onPointerCancel(event: PointerEvent<HTMLButtonElement>) {
        if (drag.current?.pointerId === event.pointerId) finish(true)
      },
      onLostPointerCapture(event: PointerEvent<HTMLButtonElement>) {
        if (drag.current?.pointerId === event.pointerId) finish(true)
      },
      onKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
        if (!enabled || !['ArrowLeft', 'ArrowRight'].includes(event.key)) return
        event.preventDefault()
        moveTo(event.key === 'ArrowLeft' ? 'left' : 'right')
      },
    },
  }
}
