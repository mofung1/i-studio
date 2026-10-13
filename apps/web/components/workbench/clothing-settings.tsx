'use client'

import { Shirt, UserRound } from 'lucide-react'
import type { ClothingMode, ClothingStyle } from '@/lib/contracts'
import { clothingProductModules, clothingStyles } from '@/lib/clothing'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/select'
import { ReferenceUploader } from './reference-uploader'
import { ProductPlatformSelector } from './product-platform-selector'
import { languageOptions, ratioOptions, resolutionOptions } from './shared'

export interface ClothingSettingsValue {
  mode: ClothingMode
  style: ClothingStyle
  counts: Record<string, number>
  modelCount: number
  garments: File[]
  models: File[]
  scenes: File[]
  requirements: string
  platform: string
  outputLanguage: string
  endpointId: string
  model: string
  aspectRatio: string
  resolution: string
}

export function ClothingSettings({ value, onChange, endpoints }: { value: ClothingSettingsValue; onChange: (patch: Partial<ClothingSettingsValue>) => void; endpoints: { id: string; name: string; model: string }[] }) {
  const total = Object.values(value.counts).reduce((sum, count) => sum + count, 0)
  function count(key: string, amount: number) {
    const counts = { ...value.counts }
    if (Number.isFinite(amount) && amount > 0) counts[key] = Math.min(4, Math.floor(amount))
    else delete counts[key]
    onChange({ counts })
  }
  return <>
    <div className="clothing-mode-selector" role="group" aria-label="服装创作模式"><button type="button" aria-pressed={value.mode === 'product'} onClick={() => onChange({ mode: 'product' })}><Shirt size={16} aria-hidden="true" />商品组图</button><button type="button" aria-pressed={value.mode === 'model'} onClick={() => onChange({ mode: 'model' })}><UserRound size={16} aria-hidden="true" />模特上身</button></div>
    <fieldset className="form-section config-card config-card-assets"><div className="field-heading"><legend>服装原图</legend><span>1–6 张</span></div><p className="clothing-field-help">{value.mode === 'product' ? '上传同一件服装的不同角度，建议包含正面、背面与细节。' : '上传同套搭配中的服装，模特将穿着这套搭配。'}</p><ReferenceUploader files={value.garments} max={6} onChange={garments => onChange({ garments })} labelFor={index => `服装 ${index + 1}`} emptyTitle="上传服装原图" emptyHint="拖拽或点击上传" acceptedHint="JPG / PNG / WebP · 单张最多 10 MB" /></fieldset>
    {value.mode === 'model' && <>
      <fieldset className="form-section config-card config-card-assets"><div className="field-heading"><legend>模特照片</legend><span>必须 1 张</span></div><p className="clothing-field-help">建议上传人物清晰、身体完整的照片。</p><ReferenceUploader files={value.models} max={1} onChange={models => onChange({ models })} labelFor={() => '模特'} emptyTitle="上传模特照片" emptyHint="用于保持人物身份与体型" acceptedHint="JPG / PNG / WebP" /></fieldset>
      <fieldset className="form-section config-card config-card-assets"><div className="field-heading"><legend>拍摄场景</legend><span>可选 1 张</span></div><ReferenceUploader files={value.scenes} max={1} onChange={scenes => onChange({ scenes })} labelFor={() => '场景'} emptyTitle="上传场景参考" emptyHint="留空按拍摄风格安排背景" acceptedHint="只作为背景参考" /></fieldset>
    </>}
    <fieldset className="form-section config-card clothing-output-settings"><div className="field-heading"><legend>{value.mode === 'product' ? '选择图种' : '上身图片'}</legend><span>预计 {value.mode === 'product' ? total : value.modelCount} 张</span></div>
      {value.mode === 'product' ? <div className="clothing-module-list">{clothingProductModules.map(([key, label, hint]) => <div className={`clothing-module${value.counts[key] ? ' is-selected' : ''}`} key={key}><label><input type="checkbox" aria-label={`选择${label}`} checked={!!value.counts[key]} onChange={event => count(key, event.target.checked ? 1 : 0)} /><span><strong>{label}</strong><small>{hint}</small></span></label><input type="number" aria-label={`${label}张数`} min={0} max={4} step={1} value={value.counts[key] ?? 0} onChange={event => count(key, Number(event.target.value))} /></div>)}</div> : <label className="settings-field"><span>生成张数</span><Select value={String(value.modelCount)} onValueChange={number => onChange({ modelCount: Number(number) })}><SelectTrigger aria-label="模特图片张数"><SelectValue /></SelectTrigger><SelectContent>{[1, 2, 3, 4].map(number => <SelectItem key={number} value={String(number)}>{number} 张</SelectItem>)}</SelectContent></Select></label>}
      {value.mode === 'product' && total > 16 && <p className="form-notice error" role="alert">一次最多生成 16 张，请减少张数。</p>}
    </fieldset>
    <fieldset className="form-section config-card"><div className="field-heading"><legend>拍摄要求</legend></div><label className="clothing-requirements-label" htmlFor="clothing-requirements">补充需求（可选）</label><textarea id="clothing-requirements" className="clothing-requirements" maxLength={2000} rows={4} value={value.requirements} onChange={event => onChange({ requirements: event.target.value })} placeholder="例如：突出领口与袖口工艺、柔和自然光。面料成分与尺码请填写真实资料。" />
      <div className="clothing-parameter-grid"><label className="settings-field"><span>拍摄风格</span><Select value={value.style} onValueChange={style => onChange({ style: style as ClothingStyle })}><SelectTrigger aria-label="拍摄风格"><SelectValue /></SelectTrigger><SelectContent>{clothingStyles.map(([key, label]) => <SelectItem key={key} value={key}>{label}</SelectItem>)}</SelectContent></Select></label><label className="settings-field"><span>画面文字</span><Select value={value.outputLanguage} onValueChange={outputLanguage => onChange({ outputLanguage })}><SelectTrigger aria-label="画面文字"><SelectValue /></SelectTrigger><SelectContent>{languageOptions.map(([key, label]) => <SelectItem key={key} value={key}>{key === 'none' ? '不新增文字' : label}</SelectItem>)}</SelectContent></Select></label></div>
    </fieldset>
    <fieldset className="form-section config-card"><div className="field-heading"><legend>生成参数</legend></div><div className="clothing-parameter-grid"><label className="settings-field clothing-model-field"><span>模型</span><Select value={value.endpointId || undefined} onValueChange={id => { const endpoint = endpoints.find(endpoint => endpoint.id === id); if (endpoint) onChange({ endpointId: id, model: endpoint.model }) }}><SelectTrigger aria-label="服装生图模型"><SelectValue placeholder="请先配置生图服务" /></SelectTrigger><SelectContent>{endpoints.map(endpoint => <SelectItem key={endpoint.id} value={endpoint.id}>{endpoint.name}</SelectItem>)}</SelectContent></Select></label><label className="settings-field"><span>画面比例</span><Select value={value.aspectRatio} onValueChange={aspectRatio => onChange({ aspectRatio })}><SelectTrigger aria-label="服装画面比例"><SelectValue /></SelectTrigger><SelectContent>{ratioOptions.map(([key, label]) => <SelectItem key={key} value={key}>{label}</SelectItem>)}</SelectContent></Select></label><label className="settings-field"><span>清晰度</span><Select value={value.resolution} onValueChange={resolution => onChange({ resolution })}><SelectTrigger aria-label="服装清晰度"><SelectValue /></SelectTrigger><SelectContent>{resolutionOptions.map(([key, label]) => <SelectItem key={key} value={key}>{label}</SelectItem>)}</SelectContent></Select></label></div></fieldset>
    <fieldset className="form-section config-card"><div className="field-heading"><legend>目标平台</legend></div><ProductPlatformSelector value={value.platform} onChange={platform => onChange({ platform })} /></fieldset>
  </>
}
