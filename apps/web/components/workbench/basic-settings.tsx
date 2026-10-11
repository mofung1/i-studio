'use client'

import { ChevronDown, Image as ImageIcon, Sparkles } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
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

function GeneralParameterPopover({ aspectRatio, resolution, count, style, referenceStrength, onSetResolution, onSetCount, onSetAspectRatio, onSetStyle, onSetReferenceStrength }: Pick<BasicSettingsProps, 'aspectRatio' | 'resolution' | 'count' | 'style' | 'referenceStrength' | 'onSetResolution' | 'onSetCount' | 'onSetAspectRatio' | 'onSetStyle' | 'onSetReferenceStrength'>) {
  return <div className="basic-settings-popover" role="dialog" aria-label="图片参数">
    <div className="basic-settings-popover-grid">
      <label className="settings-field"><span>创作风格</span><Select value={style} onValueChange={value => onSetStyle(value as GeneralStyle)}><SelectTrigger aria-label="创作风格"><SelectValue /></SelectTrigger><SelectContent>{styleOptions.map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent></Select></label>
      <label className="settings-field"><span>参考强度</span><Select value={referenceStrength} onValueChange={value => onSetReferenceStrength(value as ReferenceStrength)}><SelectTrigger aria-label="参考强度"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="low">低</SelectItem><SelectItem value="medium">中</SelectItem><SelectItem value="high">高</SelectItem></SelectContent></Select></label>
      <label className="settings-field"><span>尺寸比例</span><Select value={aspectRatio} onValueChange={onSetAspectRatio}><SelectTrigger aria-label="尺寸比例"><ImageIcon size={14} aria-hidden="true" /><SelectValue /></SelectTrigger><SelectContent>{ratioOptions.map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent></Select></label>
      <label className="settings-field"><span>清晰度</span><Select value={resolution} onValueChange={onSetResolution}><SelectTrigger aria-label="清晰度"><SelectValue /></SelectTrigger><SelectContent>{resolutionOptions.map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent></Select></label>
      <label className="settings-field"><span>生成数量</span><Select value={String(count)} onValueChange={value => onSetCount(Number(value))}><SelectTrigger aria-label="生成数量"><SelectValue /></SelectTrigger><SelectContent>{generalCountOptions.map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent></Select></label>
    </div>
  </div>
}

export function BasicSettings(props: BasicSettingsProps) {
  const { mode, task, aspectRatio, resolution, count, imageEndpoints, endpointId, onSetEndpoint, onSetResolution, onSetCount, outputSummary, outputLanguage, onSetOutputLanguage, onSetAspectRatio, style, referenceStrength, onSetStyle, onSetReferenceStrength } = props
  const [paramsOpen, setParamsOpen] = useState(false)
  const paramsRef = useRef<HTMLElement>(null)

  useEffect(() => {
    if (!paramsOpen) return
    const closeOutside = (event: PointerEvent) => {
      const target = event.target as HTMLElement
      if (!paramsRef.current?.contains(target) && !target.closest('.select-content')) setParamsOpen(false)
    }
    const closeEscape = (event: KeyboardEvent) => { if (event.key === 'Escape') setParamsOpen(false) }
    document.addEventListener('pointerdown', closeOutside)
    document.addEventListener('keydown', closeEscape)
    return () => {
      document.removeEventListener('pointerdown', closeOutside)
      document.removeEventListener('keydown', closeEscape)
    }
  }, [paramsOpen])

  if (mode === 'general') {
    const modelName = imageEndpoints.find(endpoint => endpoint.id === endpointId)?.name ?? '选择模型'
    return <section className={`basic-settings compact-basic-settings ${paramsOpen ? 'is-open' : ''}`} aria-label="生成参数" ref={paramsRef}>
      <div className="compact-settings-row">
        <Select value={endpointId || undefined} onValueChange={onSetEndpoint}>
          <SelectTrigger className="settings-chip settings-chip-model" aria-label="模型选择"><Sparkles size={14} aria-hidden="true" /><SelectValue placeholder={modelName} /></SelectTrigger>
          <SelectContent>{imageEndpoints.map(endpoint => <SelectItem key={endpoint.id} value={endpoint.id}>{endpoint.name}</SelectItem>)}</SelectContent>
        </Select>
        <button type="button" className="settings-chip settings-chip-output" aria-expanded={paramsOpen} aria-controls="general-parameter-popover" onClick={() => setParamsOpen(value => !value)}>
          <ImageIcon size={14} aria-hidden="true" /><span>{aspectRatio} · {resolution} · {count} 张</span><ChevronDown size={13} aria-hidden="true" />
        </button>
      </div>
      {paramsOpen && <div id="general-parameter-popover"><GeneralParameterPopover {...{ aspectRatio, resolution, count, style, referenceStrength, onSetResolution, onSetCount, onSetAspectRatio, onSetStyle, onSetReferenceStrength }} /></div>}
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
        <Select value={outputLanguage} onValueChange={onSetOutputLanguage}>
          <SelectTrigger aria-label="目标语言"><SelectValue /></SelectTrigger>
          <SelectContent>{languageOptions.map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent>
        </Select>
        <span className="settings-value">{outputSummary}</span>
      </div> : <div className="settings-field"><span>预计出图</span><span className="settings-value">{outputSummary}</span></div>}
    </div>
  </fieldset>
}
