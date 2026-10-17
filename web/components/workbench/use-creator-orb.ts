'use client'

import {
  useLayoutEffect,
  useRef,
  type RefObject,
  type PointerEvent,
  type KeyboardEvent,
} from 'react'
import type { ConfigSide } from './shared'

type Point = { x: number; y: number }
type OrbDrag = {
  pointerId: number
  handle: HTMLButtonElement
  start: Point
  origin: Point
  grab: Point
  active: boolean
}

/** The collapsed inspector floats over the canvas; dragging never changes its dock side. */
export function useCreatorOrb({
  panelRef,
  enabled,
  side,
}: {
  panelRef: RefObject<HTMLElement | null>
  enabled: boolean
  side: ConfigSide
}) {
  const position = useRef<Point | null>(null)
  const drag = useRef<OrbDrag | null>(null)
  const suppressClick = useRef(false)

  function geometry() {
    const node = panelRef.current
    const shell = node?.closest('.workbench-shell')
    const canvas = shell?.querySelector('.creation-canvas')
    if (!node || !shell || !canvas) return null
    const area = canvas.getBoundingClientRect()
    const parent = shell.getBoundingClientRect()
    const orb = node.getBoundingClientRect()
    const left = Math.max(area.left, 0) + 8
    const top = Math.max(area.top, 0) + 8
    return {
      node,
      parent,
      area,
      minX: left - area.left,
      minY: top - area.top,
      maxX: Math.max(left, Math.min(area.right, window.innerWidth) - orb.width - 8) - area.left,
      maxY: Math.max(top, Math.min(area.bottom, window.innerHeight) - orb.height - 8) - area.top,
    }
  }

  function place(point = position.current) {
    const bounds = geometry()
    if (!bounds) return
    const next = point ?? { x: side === 'left' ? bounds.minX : bounds.maxX, y: bounds.minY }
    position.current = {
      x: Math.max(bounds.minX, Math.min(next.x, bounds.maxX)),
      y: Math.max(bounds.minY, Math.min(next.y, bounds.maxY)),
    }
    bounds.node.style.setProperty(
      '--creator-orb-x',
      `${bounds.area.left - bounds.parent.left + position.current.x}px`,
    )
    bounds.node.style.setProperty(
      '--creator-orb-y',
      `${bounds.area.top - bounds.parent.top + position.current.y}px`,
    )
  }

  function finish(cancelled: boolean) {
    const current = drag.current
    if (!current) return
    drag.current = null
    suppressClick.current = current.active
    panelRef.current?.removeAttribute('data-orb-dragging')
    if (cancelled) place(current.origin)
    if (current.handle.hasPointerCapture?.(current.pointerId))
      current.handle.releasePointerCapture(current.pointerId)
  }

  // These listeners always use the current enabled state and geometry.
  const actions = useRef({ place, finish })
  actions.current = { place, finish }
  useLayoutEffect(() => {
    if (!enabled) return
    actions.current.place()
    const update = () => {
      actions.current.finish(false)
      actions.current.place()
    }
    const cancel = () => actions.current.finish(true)
    const escape = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape' && drag.current) {
        event.preventDefault()
        cancel()
      }
    }
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(update)
    const shell = panelRef.current?.closest('.workbench-shell')
    const canvas = shell?.querySelector('.creation-canvas')
    if (shell) observer?.observe(shell)
    if (canvas) observer?.observe(canvas)
    window.addEventListener('resize', update)
    window.addEventListener('scroll', update, true)
    window.addEventListener('blur', cancel)
    window.addEventListener('keydown', escape)
    return () => {
      actions.current.finish(false)
      observer?.disconnect()
      window.removeEventListener('resize', update)
      window.removeEventListener('scroll', update, true)
      window.removeEventListener('blur', cancel)
      window.removeEventListener('keydown', escape)
      panelRef.current?.style.removeProperty('--creator-orb-x')
      panelRef.current?.style.removeProperty('--creator-orb-y')
    }
  }, [enabled, panelRef])

  return {
    reset() {
      position.current = null
      if (enabled) place()
    },
    handleProps: {
      onPointerDown(event: PointerEvent<HTMLButtonElement>) {
        if (!enabled || drag.current || event.button !== 0 || event.isPrimary === false) return
        suppressClick.current = false
        const bounds = geometry()
        if (!bounds || !position.current) return
        const visual = bounds.node.getBoundingClientRect()
        drag.current = {
          pointerId: event.pointerId,
          handle: event.currentTarget,
          start: { x: event.clientX, y: event.clientY },
          origin: { ...position.current },
          grab: { x: event.clientX - visual.left, y: event.clientY - visual.top },
          active: false,
        }
        event.currentTarget.setPointerCapture(event.pointerId)
        event.currentTarget.focus({ preventScroll: true })
        event.preventDefault()
      },
      onPointerMove(event: PointerEvent<HTMLButtonElement>) {
        const current = drag.current
        if (!current || event.pointerId !== current.pointerId) return
        if (
          !current.active &&
          Math.hypot(event.clientX - current.start.x, event.clientY - current.start.y) < 6
        )
          return
        const bounds = geometry()
        if (!bounds) return
        current.active = true
        bounds.node.setAttribute('data-orb-dragging', 'true')
        place({
          x: event.clientX - current.grab.x - bounds.area.left,
          y: event.clientY - current.grab.y - bounds.area.top,
        })
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
        if (!enabled) return
        const delta: Record<string, Point> = {
          ArrowLeft: { x: -1, y: 0 },
          ArrowRight: { x: 1, y: 0 },
          ArrowUp: { x: 0, y: -1 },
          ArrowDown: { x: 0, y: 1 },
        }
        const direction = delta[event.key]
        if (event.key === 'Home') {
          event.preventDefault()
          position.current = null
          place()
        } else if (direction && position.current) {
          event.preventDefault()
          const step = event.shiftKey ? 48 : 16
          place({
            x: position.current.x + direction.x * step,
            y: position.current.y + direction.y * step,
          })
        }
      },
    },
    shouldExpand(detail: number) {
      const allowed = !suppressClick.current || detail === 0
      suppressClick.current = false
      return allowed
    },
  }
}
