import { Check, Sparkles, Upload } from 'lucide-react'
import { Button } from '@/components/ui'
import type { GenerationModel } from '@/lib/contracts'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/select'

import type { InlineGenerationTask, GenerationNotice } from './use-generation-task'
import {
  detailModules,
  languageOptions,
  platformOptions,
  productMainModules,
  retouchOptions,
  type ConfigSide,
  type GeneralStyle,
  type ModuleMode,
  type ReferenceStrength,
  type WorkbenchMode,
} from './shared'
import type { CommerceTaskType } from '@/lib/contracts'
import { SelectedImageThumbnail } from './selected-image-thumbnail'

interface ConfigPanelProps {
  mode: WorkbenchMode
  task: CommerceTaskType
  title: string
  requirementsPlaceholder: string
  productFiles: File[]
  referenceFiles: File[]
  prompt: string
  requirements: string
  platform: string
  outputLanguage: string
  style: GeneralStyle
  referenceStrength: ReferenceStrength
  moduleMode: ModuleMode
  moduleCounts: Record<string, number>
  recreateStrength: 'style' | 'high'
  enhancements: string[]
  count: number
  model: GenerationModel
  aspectRatio: string
  resolution: string
  aiEnabled: boolean | null
  notice: GenerationNotice | null
  isSubmitting: boolean
  isGenerating: boolean
  generationTask: InlineGenerationTask | null
  onSetProductFiles: (files: File[]) => void
  onSetReferenceFiles: (files: File[]) => void
  onSetPrompt: (prompt: string) => void
  onSetRequirements: (requirements: string) => void
  onSetPlatform: (platform: string) => void
  onSetOutputLanguage: (language: string) => void
  onSetStyle: (style: GeneralStyle) => void
  onSetReferenceStrength: (strength: ReferenceStrength) => void
  onSetModuleMode: (mode: ModuleMode) => void
  onSetModuleCounts: (counts: Record<string, number>) => void
  onSetRecreateStrength: (strength: 'style' | 'high') => void
  onSetEnhancements: (enhancements: string[]) => void
  onSetCount: (count: number) => void
  onSetModel: (model: GenerationModel) => void
  onSetAspectRatio: (ratio: string) => void
  onSetResolution: (resolution: string) => void
  onSubmit: () => void
}

export function ConfigPanel(props: ConfigPanelProps) {
  const {
    mode, task, title, requirementsPlaceholder,
    productFiles, referenceFiles, prompt, requirements,
    platform, outputLanguage, style, referenceStrength,
    moduleMode, moduleCounts, recreateStrength, enhancements,
    count, model, aspectRatio, resolution,
    aiEnabled, notice, isSubmitting, isGenerating,
    onSetProductFiles, onSetReferenceFiles, onSetPrompt, onSetRequirements,
    onSetPlatform, onSetOutputLanguage, onSetStyle, onSetReferenceStrength,
    onSetModuleMode, onSetModuleCounts, onSetRecreateStrength, onSetEnhancements,
    onSetCount, onSetModel, onSetAspectRatio, onSetResolution, onSubmit,
  } = props

  const maxProductFiles = task === 'product-retouch' ? 1 : task === 'viral-recreate' ? 3 : 6

  function addProductFiles(selectedFiles: File[]) {
    onSetProductFiles([...productFiles, ...selectedFiles].slice(0, maxProductFiles))
  }

  return (
    <aside className="configuration-panel">
      <div className="configuration-scroll">
        <fieldset className="form-section config-card config-card-assets">
          <div className="field-heading"><legend>{mode === 'general' ? '参考图片' : task === 'viral-recreate' ? '商品原图' : '产品素材'}</legend><span>{mode === 'general' ? `${referenceFiles.length}/6 张 · 可选` : task === 'product-retouch' ? `${productFiles.length}/1 张 · 必须 1 张` : `${productFiles.length}/${maxProductFiles} 张 · 至少 1 张`}</span></div>
          <div className="upload-list">
            {(mode === 'general' ? referenceFiles : productFiles).map((file, index) => (
              <SelectedImageThumbnail
                key={`${file.name}-${file.size}-${file.lastModified}-${index}`}
                file={file}
                label={mode === 'general' ? `参考 ${index + 1}` : index === 0 ? '主图' : `素材 ${index + 1}`}
                onRemove={() => mode === 'general'
                  ? onSetReferenceFiles(referenceFiles.filter((_, fileIndex) => fileIndex !== index))
                  : onSetProductFiles(productFiles.filter((_, fileIndex) => fileIndex !== index))}
              />
            ))}
            {(mode === 'general' ? referenceFiles.length < 6 : productFiles.length < maxProductFiles) && <label className="add-thumb"><span className="add-thumb-icon"><Upload size={16} /></span><span>添加图片</span><input multiple type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => {
              const selectedFiles = Array.from(event.target.files ?? [])
              if (mode === 'general') onSetReferenceFiles([...referenceFiles, ...selectedFiles].slice(0, 6))
              else addProductFiles(selectedFiles)
              event.target.value = ''
            }} /></label>}
          </div>
        </fieldset>

        {mode === 'commerce' && task === 'viral-recreate' && (
          <fieldset className="form-section config-card">
            <div className="field-heading"><legend>参考图（爆款图）</legend><span>{referenceFiles.length}/1 张 · 必须 1 张</span></div>
            <div className="upload-list">
              {referenceFiles.map((file, index) => <SelectedImageThumbnail key={`${file.name}-${file.size}-${file.lastModified}-${index}`} file={file} label={`参考 ${index + 1}`} onRemove={() => onSetReferenceFiles(referenceFiles.filter((_, fileIndex) => fileIndex !== index))} />)}
              {referenceFiles.length < 1 && <label className="add-thumb"><span className="add-thumb-icon"><Upload size={16} /></span><span>添加参考图</span><input type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => { onSetReferenceFiles(Array.from(event.target.files ?? []).slice(0, 1)); event.target.value = '' }} /></label>}
            </div>
            <div className="choice-group"><span className="choice-label">复刻程度</span><div className="recreate-options"><label className={recreateStrength === 'style' ? 'selected' : ''}><input type="radio" checked={recreateStrength === 'style'} onChange={() => onSetRecreateStrength('style')} /><span><strong>参考风格</strong><small>参考整体风格和结构，自动调整色彩和重构场景</small></span></label><label className={recreateStrength === 'high' ? 'selected' : ''}><input type="radio" checked={recreateStrength === 'high'} onChange={() => onSetRecreateStrength('high')} /><span><strong>高度复刻</strong><small>参照参考图视觉结构替换产品和文案，场景细节略有差异</small></span></label></div></div>
          </fieldset>
        )}

        {mode === 'commerce' && (
          <fieldset className={`form-section config-card two-columns compact-fields ${task === 'product-retouch' ? 'single-field' : ''}`}>
            <label>目标平台<Select value={platform} onValueChange={onSetPlatform}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{platformOptions.map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent></Select></label>
            {task !== 'product-retouch' && <label>目标语言<Select value={outputLanguage} onValueChange={onSetOutputLanguage}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{languageOptions.map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent></Select></label>}
          </fieldset>
        )}

        {mode === 'general' ? (
          <fieldset className="form-section config-card general-description">
            <label>画面描述<textarea value={prompt} onChange={(event) => onSetPrompt(event.target.value)} /></label>
            <div className="two-columns">
              <label>创作风格<Select value={style} onValueChange={(value) => onSetStyle(value as GeneralStyle)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="unspecified">不指定</SelectItem><SelectItem value="studio">摄影棚</SelectItem><SelectItem value="minimal">极简</SelectItem><SelectItem value="fresh">清新</SelectItem><SelectItem value="technology">科技</SelectItem><SelectItem value="guochao">国潮</SelectItem></SelectContent></Select></label>
              <label>参考强度<Select value={referenceStrength} onValueChange={(value) => onSetReferenceStrength(value as ReferenceStrength)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="low">低</SelectItem><SelectItem value="medium">中</SelectItem><SelectItem value="high">高</SelectItem></SelectContent></Select></label>
            </div>
          </fieldset>
        ) : (
          <>
            {(task === 'product-main' || task === 'detail-page') ? (
              <fieldset className="form-section config-card">
                <div className="field-heading"><legend>{task === 'product-main' ? '主图要求' : '详情图要求'}</legend><div className="field-heading-actions"><button type="button" className="ai-write-button" onClick={() => onSetRequirements(requirements || '请围绕产品名称、核心卖点、目标人群、视觉风格和平台规范，生成清晰统一的电商图片方案。')}><Sparkles size={14} />AI 帮写</button></div></div>
                <textarea value={requirements} onChange={(event) => onSetRequirements(event.target.value)} placeholder={requirementsPlaceholder} />
              </fieldset>
            ) : task === 'product-retouch' ? (
              <fieldset className="form-section config-card">
                <div className="field-heading"><legend>快捷优化项</legend><span>可多选</span></div>
                <div className="insight-chips">{retouchOptions.map(([value, label]) => <button key={value} type="button" aria-pressed={enhancements.includes(value)} className={enhancements.includes(value) ? 'selected' : ''} onClick={() => onSetEnhancements(enhancements.includes(value) ? enhancements.filter((item) => item !== value) : [...enhancements, value])}>{label}</button>)}</div>
                <label className="field-label-spaced">补充要求<textarea value={requirements} onChange={(event) => onSetRequirements(event.target.value)} placeholder={requirementsPlaceholder} /></label>
              </fieldset>
            ) : (
              <fieldset className="form-section config-card">
                <div className="field-heading"><legend>补充要求</legend></div>
                <textarea value={requirements} onChange={(event) => onSetRequirements(event.target.value)} placeholder={requirementsPlaceholder} />
              </fieldset>
            )}
            {mode === 'commerce' && (task === 'product-main' || task === 'detail-page') && <fieldset className="form-section config-card config-card-modules"><div className="field-heading"><legend>图片模块</legend><span>{moduleMode === 'smart' ? 'AI 自动组合' : '选择需要的模块'}</span></div><div className="module-tabs"><button type="button" aria-pressed={moduleMode === 'smart'} className={moduleMode === 'smart' ? 'selected' : ''} onClick={() => onSetModuleMode('smart')}>智能模块</button><button type="button" aria-pressed={moduleMode === 'custom'} className={moduleMode === 'custom' ? 'selected' : ''} onClick={() => onSetModuleMode('custom')}>自定义模块</button></div>{moduleMode === 'smart' ? <p className="field-helper module-helper">AI 将自动分析商品特征并选择最佳图片模块组合</p> : <div className="module-count-grid">{(task === 'product-main' ? productMainModules : detailModules).map(([value, label]) => { const isSelected = moduleCounts[value] !== undefined; return <div className={`module-choice ${isSelected ? 'selected' : ''}`} key={value}><label><input type="checkbox" checked={isSelected} onChange={(event) => onSetModuleCounts(event.target.checked ? { ...moduleCounts, [value]: 1 } : (() => { const next = { ...moduleCounts }; delete next[value]; return next })())} /><span>{label}</span></label>{isSelected && <Select value={String(moduleCounts[value])} onValueChange={(next) => onSetModuleCounts({ ...moduleCounts, [value]: Number(next) })}><SelectTrigger className="select-trigger-count" aria-label={`${label}数量`}><SelectValue /></SelectTrigger><SelectContent>{[1, 2, 3, 4].map((number) => <SelectItem key={number} value={String(number)}>{number} 张</SelectItem>)}</SelectContent></Select>}</div> })}</div>}</fieldset>}
          </>
        )}

        <fieldset className="form-section config-card config-card-output">
          <div className="field-heading"><legend>输出设置</legend>{mode === 'general' && <span>最多 16 张</span>}</div>
          <div className="settings-grid">
            <label className="settings-field"><span>尺寸比例</span><Select value={aspectRatio} onValueChange={onSetAspectRatio}><SelectTrigger aria-label="画面比例"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="1:1">1:1</SelectItem><SelectItem value="3:4">3:4</SelectItem><SelectItem value="4:3">4:3</SelectItem><SelectItem value="9:16">9:16</SelectItem><SelectItem value="16:9">16:9</SelectItem></SelectContent></Select></label>
            <label className="settings-field"><span>分辨率</span><Select value={resolution} onValueChange={onSetResolution}><SelectTrigger aria-label="清晰度"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="1K">1K</SelectItem><SelectItem value="2K">2K</SelectItem><SelectItem value="4K">4K</SelectItem></SelectContent></Select></label>
            <label className="settings-field"><span>生图模型</span><Select value={model} onValueChange={(value) => onSetModel(value as GenerationModel)}><SelectTrigger aria-label="生图模型"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="gpt-image-2">GPT Image 2</SelectItem><SelectItem value="gemini-2.5-flash-image">Gemini 2.5 Flash</SelectItem><SelectItem value="gemini-3.1-flash-image">Gemini 3.1 Flash</SelectItem><SelectItem value="gemini-3-pro-image">Gemini 3 Pro Image</SelectItem></SelectContent></Select></label>
            <label className="settings-field"><span>生成数量</span>{mode === 'general' ? <Select value={String(count)} onValueChange={(value) => onSetCount(Number(value))}><SelectTrigger aria-label="生成数量"><SelectValue /></SelectTrigger><SelectContent>{Array.from({ length: 16 }, (_, index) => <SelectItem key={index + 1} value={String(index + 1)}>{index + 1} 张</SelectItem>)}</SelectContent></Select> : <span className="settings-value">{task === 'product-main' || task === 'detail-page' ? moduleMode === 'custom' ? `${Math.max(1, Object.values(moduleCounts).reduce((total, value) => total + value, 0))} 张` : '智能生成' : '1 张'}</span>}</label>
          </div>
        </fieldset>
      </div>

      <footer className="configuration-footer">
        {notice && <p className={`form-notice ${notice.kind}`} role="status">{notice.kind === 'success' && <Check size={15} />}{notice.message}</p>}
        <Button
          size="large"
          loading={isSubmitting}
          disabled={isGenerating || aiEnabled === null}
          title={aiEnabled === null ? '正在检查 AI 服务可用性，请稍候' : isSubmitting ? '任务正在提交' : isGenerating ? '当前任务正在生成中，完成后可继续提交新任务' : undefined}
          onClick={onSubmit}
        ><Sparkles size={17} />{isSubmitting ? '正在提交…' : isGenerating ? '正在生成…' : aiEnabled === null ? '检查 AI 服务…' : `生成 ${title}`}</Button>
      </footer>
    </aside>
  )
}
