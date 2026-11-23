'use client'

import { ChevronDown, Image as ImageIcon, X } from 'lucide-react'
import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/select'
import type { PublicImageModel } from '@/lib/generation-models'
import { ratioOptions, resolutionOptions } from './shared'

export function ImageParameters({
  summary,
  context,
  children,
}: {
  summary: string
  context?: string
  children: (portalContainer: HTMLElement | null) => ReactNode
}) {
  const [open, setOpen] = useState(false)
  const [position, setPosition] = useState<{ top: number; left: number; maxHeight: number } | null>(
    null,
  )
  const triggerRef = useRef<HTMLButtonElement>(null)
  const popoverRef = useRef<HTMLDivElement>(null)
  const pendingFocus = useRef(false)
  const popoverId = useId()

  useEffect(() => {
    popoverRef.current?.hidePopover?.()
  }, [context])

  useLayoutEffect(() => {
    if (!open) return
    const trigger = triggerRef.current
    const popover = popoverRef.current
    if (!trigger || !popover) return
    const updatePosition = () => {
      const rect = trigger.getBoundingClientRect()
      const gap = 10
      const gutter = 12
      const viewportSpace = Math.max(64, window.innerHeight - gutter * 2)
      const availableAbove = Math.max(0, Math.min(rect.top - gap - gutter, viewportSpace))
      const availableBelow = Math.max(
        0,
        Math.min(window.innerHeight - rect.bottom - gap - gutter, viewportSpace),
      )
      const above = availableAbove >= availableBelow
      const maxHeight = Math.max(64, above ? availableAbove : availableBelow)
      const height = Math.min(popover.scrollHeight + 2, maxHeight)
      const left = Math.max(
        gutter,
        Math.min(rect.left, window.innerWidth - popover.offsetWidth - gutter),
      )
      const idealTop = above ? rect.top - gap - height : rect.bottom + gap
      const top = Math.max(gutter, Math.min(idealTop, window.innerHeight - gutter - height))
      setPosition((previous) =>
        previous?.top === top && previous.left === left && previous.maxHeight === maxHeight
          ? previous
          : { top, left, maxHeight },
      )
    }
    const onScroll = (event: Event) => {
      if (!(event.target instanceof Node) || !popover.contains(event.target)) updatePosition()
    }
    updatePosition()
    const observer = new ResizeObserver(updatePosition)
    observer.observe(popover)
    observer.observe(trigger)
    window.addEventListener('resize', updatePosition)
    window.addEventListener('scroll', onScroll, true)
    return () => {
      observer.disconnect()
      window.removeEventListener('resize', updatePosition)
      window.removeEventListener('scroll', onScroll, true)
    }
  }, [open])

  useLayoutEffect(() => {
    if (!open || !position || !pendingFocus.current) return
    pendingFocus.current = false
    popoverRef.current
      ?.querySelector<HTMLButtonElement>('[role="combobox"]:not(:disabled)')
      ?.focus({ preventScroll: true })
  }, [open, position])

  const close = useCallback(() => {
    popoverRef.current?.hidePopover()
    triggerRef.current?.focus({ preventScroll: true })
  }, [])

  useEffect(() => {
    if (!open) return
    function onEscape(event: KeyboardEvent) {
      if (
        event.defaultPrevented ||
        event.key !== 'Escape' ||
        !popoverRef.current?.matches(':popover-open')
      )
        return
      // Select handles its own Escape first. Focus can briefly be on the document
      // body while the inner menu restores focus after choosing an option.
      event.preventDefault()
      close()
    }
    document.addEventListener('keydown', onEscape)
    return () => document.removeEventListener('keydown', onEscape)
  }, [close, open])

  return (
    <div className="settings-output-control">
      <span className="settings-control-label">画面参数</span>
      <button
        ref={triggerRef}
        type="button"
        className="settings-chip settings-chip-output"
        aria-label="图片参数配置"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={popoverId}
        aria-describedby={`${popoverId}-summary`}
        popoverTarget={popoverId}
      >
        <span id={`${popoverId}-summary`}>{summary}</span>
        <ChevronDown size={13} aria-hidden="true" />
      </button>
      <div
        ref={popoverRef}
        id={popoverId}
        popover="auto"
        role="dialog"
        aria-label="图片参数"
        className="image-parameters-popover"
        data-positioned={position ? '' : undefined}
        style={{
          top: position?.top ?? 0,
          left: position?.left ?? 0,
          maxHeight: position?.maxHeight,
        }}
        onToggle={(event) => {
          const visible = event.newState === 'open'
          pendingFocus.current = visible
          setOpen(visible)
          if (!visible) setPosition(null)
        }}
      >
        <header className="image-parameters-head">
          <strong>图片参数</strong>
          <button type="button" aria-label="关闭图片参数" onClick={close}>
            <X size={16} aria-hidden="true" />
          </button>
        </header>
        <div className="image-parameters-grid">{children(popoverRef.current)}</div>
      </div>
    </div>
  )
}

export function ImageSizeFields({
  aspectRatio,
  resolution,
  onSetAspectRatio,
  onSetResolution,
  capabilities,
  portalContainer,
  ratioLabel = '尺寸比例',
  resolutionLabel = '清晰度',
}: {
  aspectRatio: string
  resolution: string
  onSetAspectRatio: (value: string) => void
  onSetResolution: (value: string) => void
  capabilities?: PublicImageModel['capabilities']
  portalContainer: HTMLElement | null
  ratioLabel?: string
  resolutionLabel?: string
}) {
  return (
    <>
      <label className="settings-field">
        <span>尺寸比例</span>
        <Select value={aspectRatio} onValueChange={onSetAspectRatio}>
          <SelectTrigger aria-label={ratioLabel}>
            <ImageIcon size={14} aria-hidden="true" />
            <SelectValue>{aspectRatio}</SelectValue>
          </SelectTrigger>
          <SelectContent portalContainer={portalContainer}>
            {ratioOptions
              .filter(([value]) => !capabilities || capabilities.aspectRatios.includes(value))
              .map(([value, label]) => (
                <SelectItem key={value} value={value}>
                  {label}
                </SelectItem>
              ))}
          </SelectContent>
        </Select>
      </label>
      <label className="settings-field">
        <span>清晰度</span>
        <Select value={resolution} onValueChange={onSetResolution}>
          <SelectTrigger aria-label={resolutionLabel}>
            <SelectValue>{resolution}</SelectValue>
          </SelectTrigger>
          <SelectContent portalContainer={portalContainer}>
            {resolutionOptions
              .filter(([value]) => !capabilities || capabilities.resolutions.includes(value))
              .map(([value, label]) => (
                <SelectItem key={value} value={value}>
                  {label}
                </SelectItem>
              ))}
          </SelectContent>
        </Select>
      </label>
    </>
  )
}
