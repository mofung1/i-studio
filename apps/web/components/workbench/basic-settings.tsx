'use client'

import { ChevronDown, Image as ImageIcon, Sparkles, X } from 'lucide-react'
import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/select'
import type { CommerceTaskType } from '@/lib/contracts'
import { generalCountOptions, languageOptions, ratioOptions, resolutionOptions, styleOptions, type GeneralStyle, type ReferenceStrength, type WorkbenchMode } from './shared'

interface BasicSettingsProps {
  mode: WorkbenchMode
  task: CommerceTaskType
  aspectRatio: string
  resolution: string
  count: number
  imageEndpoints: { id: string; name: string; model: string }[]
  endpointId: string
  onSetEndpoint: (id: string) => void
  onSetResolution: (resolution: string) => void
  onSetCount: (count: number) => void
  outputSummary: string
  outputLanguage: string
  onSetOutputLanguage: (language: string) => void
  onSetAspectRatio: (ratio: string) => void
  style: GeneralStyle
  referenceStrength: ReferenceStrength
  onSetStyle: (style: GeneralStyle) => void
  onSetReferenceStrength: (strength: ReferenceStrength) => void
}

function GeneralParameterPopover({ aspectRatio, resolution, count, style, referenceStrength, onSetResolution, onSetCount, onSetAspectRatio, onSetStyle, onSetReferenceStrength, portalContainer }: Pick<BasicSettingsProps, 'aspectRatio' | 'resolution' | 'count' | 'style' | 'referenceStrength' | 'onSetResolution' | 'onSetCount' | 'onSetAspectRatio' | 'onSetStyle' | 'onSetReferenceStrength'> & { portalContainer: HTMLElement | null }) {
  return <div className="basic-settings-popover-grid">
      <label className="settings-field"><span>创作风格</span><Select value={style} onValueChange={value => onSetStyle(value as GeneralStyle)}><SelectTrigger aria-label="创作风格"><SelectValue /></SelectTrigger><SelectContent portalContainer={portalContainer}>{styleOptions.map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent></Select></label>
      <label className="settings-field"><span>参考强度</span><Select value={referenceStrength} onValueChange={value => onSetReferenceStrength(value as ReferenceStrength)}><SelectTrigger aria-label="参考强度"><SelectValue /></SelectTrigger><SelectContent portalContainer={portalContainer}><SelectItem value="low">低</SelectItem><SelectItem value="medium">中</SelectItem><SelectItem value="high">高</SelectItem></SelectContent></Select></label>
      <label className="settings-field"><span>尺寸比例</span><Select value={aspectRatio} onValueChange={onSetAspectRatio}><SelectTrigger aria-label="尺寸比例"><ImageIcon size={14} aria-hidden="true" /><SelectValue /></SelectTrigger><SelectContent portalContainer={portalContainer}>{ratioOptions.map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent></Select></label>
      <label className="settings-field"><span>清晰度</span><Select value={resolution} onValueChange={onSetResolution}><SelectTrigger aria-label="清晰度"><SelectValue /></SelectTrigger><SelectContent portalContainer={portalContainer}>{resolutionOptions.map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent></Select></label>
      <label className="settings-field"><span>生成数量</span><Select value={String(count)} onValueChange={value => onSetCount(Number(value))}><SelectTrigger aria-label="生成数量"><SelectValue /></SelectTrigger><SelectContent portalContainer={portalContainer}>{generalCountOptions.map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent></Select></label>
  </div>
}

export function BasicSettings(props: BasicSettingsProps) {
  const { mode, task, aspectRatio, resolution, count, imageEndpoints, endpointId, onSetEndpoint, onSetResolution, onSetCount, outputSummary, outputLanguage, onSetOutputLanguage, onSetAspectRatio, style, referenceStrength, onSetStyle, onSetReferenceStrength } = props
  const [paramsOpen, setParamsOpen] = useState(false)
  const [position, setPosition] = useState<{ top: number; left: number; maxHeight: number } | null>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const popoverRef = useRef<HTMLDivElement>(null)
  const popoverId = useId()

  useEffect(() => {
    if (mode !== 'general') setParamsOpen(false)
  }, [mode])

  useLayoutEffect(() => {
    if (!paramsOpen || mode !== 'general') return
    const trigger = triggerRef.current
    const popover = popoverRef.current
    if (!trigger || !popover) return
    const updatePosition = () => {
      const rect = trigger.getBoundingClientRect()
      const gap = 10
      const gutter = 12
      const viewportSpace = Math.max(64, window.innerHeight - gutter * 2)
      const availableAbove = Math.max(0, Math.min(rect.top - gap - gutter, viewportSpace))
      const availableBelow = Math.max(0, Math.min(window.innerHeight - rect.bottom - gap - gutter, viewportSpace))
      const above = availableAbove >= availableBelow
      const maxHeight = Math.max(64, above ? availableAbove : availableBelow)
      const height = Math.min(popover.scrollHeight + 2, maxHeight)
      const left = Math.max(gutter, Math.min(rect.left, window.innerWidth - popover.offsetWidth - gutter))
      const idealTop = above ? rect.top - gap - height : rect.bottom + gap
      const top = Math.max(gutter, Math.min(idealTop, window.innerHeight - gutter - height))
      setPosition(previous => previous?.top === top && previous.left === left && previous.maxHeight === maxHeight ? previous : { top, left, maxHeight })
    }
    const onScroll = (event: Event) => { if (!(event.target instanceof Node) || !popover.contains(event.target)) updatePosition() }
    updatePosition()
    const focusFrame = requestAnimationFrame(() => popover.querySelector<HTMLButtonElement>('[role="combobox"]')?.focus({ preventScroll: true }))
    const observer = new ResizeObserver(updatePosition)
    observer.observe(popover)
    observer.observe(trigger)
    window.addEventListener('resize', updatePosition)
    window.addEventListener('scroll', onScroll, true)
    return () => {
      cancelAnimationFrame(focusFrame)
      observer.disconnect()
      window.removeEventListener('resize', updatePosition)
      window.removeEventListener('scroll', onScroll, true)
    }
  }, [paramsOpen, mode])

  if (mode === 'general') {
    const modelName = imageEndpoints.find(endpoint => endpoint.id === endpointId)?.name ?? '选择模型'
    return <section className={`basic-settings compact-basic-settings ${paramsOpen ? 'is-open' : ''}`} aria-label="生成参数">
      <div className="compact-settings-row">
        <Select value={endpointId || undefined} onValueChange={onSetEndpoint}>
          <SelectTrigger className="settings-chip settings-chip-model" aria-label="模型选择"><Sparkles size={14} aria-hidden="true" /><SelectValue placeholder={modelName} /></SelectTrigger>
          <SelectContent>{imageEndpoints.map(endpoint => <SelectItem key={endpoint.id} value={endpoint.id}>{endpoint.name}</SelectItem>)}</SelectContent>
        </Select>
        <button ref={triggerRef} type="button" className="settings-chip settings-chip-output" aria-label="图片参数配置" aria-haspopup="dialog" aria-expanded={paramsOpen} aria-controls={popoverId} popoverTarget={popoverId}>
          <ImageIcon size={14} aria-hidden="true" /><span>{aspectRatio} · {resolution} · {count} 张</span><ChevronDown size={13} aria-hidden="true" />
        </button>
      </div>
      <div ref={popoverRef} id={popoverId} popover="auto" role="dialog" aria-label="图片参数" className="basic-settings-popover general-parameter-popover" style={{ top: position?.top ?? 0, left: position?.left ?? 0, maxHeight: position?.maxHeight, visibility: position ? 'visible' : 'hidden' }} onKeyDown={event => {
        if (event.key !== 'Escape' || (event.target as HTMLElement).closest('.select-content')) return
        event.preventDefault()
        popoverRef.current?.hidePopover()
        triggerRef.current?.focus({ preventScroll: true })
      }} onToggle={event => {
        const open = event.newState === 'open'
        setParamsOpen(open)
        if (!open) setPosition(null)
      }}>
        <header className="general-parameter-head"><strong>图片参数</strong><button type="button" aria-label="关闭图片参数" onClick={() => { popoverRef.current?.hidePopover(); triggerRef.current?.focus({ preventScroll: true }) }}><X size={16} aria-hidden="true" /></button></header>
        <GeneralParameterPopover {...{ aspectRatio, resolution, count, style, referenceStrength, onSetResolution, onSetCount, onSetAspectRatio, onSetStyle, onSetReferenceStrength }} portalContainer={popoverRef.current} />
      </div>
    </section>
  }

  return <fieldset className="form-section config-card basic-settings">
    <div className="field-heading"><legend>生成参数</legend></div>
    <div className="settings-grid">
      <label className="settings-field model-field"><span>生图模型</span><Select value={endpointId || undefined} onValueChange={onSetEndpoint}><SelectTrigger aria-label="生图模型"><SelectValue placeholder="请先配置生图服务" /></SelectTrigger><SelectContent>{imageEndpoints.map(endpoint => <SelectItem key={endpoint.id} value={endpoint.id}>{endpoint.name}</SelectItem>)}</SelectContent></Select></label>
      <label className="settings-field"><span>尺寸比例</span><Select value={aspectRatio} onValueChange={onSetAspectRatio}><SelectTrigger aria-label="尺寸比例"><SelectValue /></SelectTrigger><SelectContent>{ratioOptions.map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent></Select></label>
      <label className="settings-field"><span>清晰度</span><Select value={resolution} onValueChange={onSetResolution}><SelectTrigger aria-label="清晰度"><SelectValue /></SelectTrigger><SelectContent>{resolutionOptions.map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent></Select></label>
      {mode === 'commerce' && task !== 'product-retouch' ? <div className="settings-field commerce-output-field">
        <span>预计出图</span>
        <div className="commerce-output-controls">
          <Select value={outputLanguage} onValueChange={onSetOutputLanguage}>
            <SelectTrigger aria-label="目标语言" title={languageOptions.find(([value]) => value === outputLanguage)?.[1]}><SelectValue /></SelectTrigger>
            <SelectContent>{languageOptions.map(([value, label]) => <SelectItem key={value} value={value} title={label}>{label}</SelectItem>)}</SelectContent>
          </Select>
          <span className="settings-value">{outputSummary}</span>
        </div>
      </div> : <div className="settings-field"><span>预计出图</span><span className="settings-value">{outputSummary}</span></div>}
    </div>
  </fieldset>
}
