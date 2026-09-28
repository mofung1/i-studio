'use client'

import { Check, ChevronDown, Sparkles, Upload } from 'lucide-react'
import type { DragEvent } from 'react'

import { Button } from '@/components/ui'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/select'
import type { CommerceTaskType, GenerationModel } from '@/lib/contracts'

import { SelectedImageThumbnail } from './selected-image-thumbnail'
import {
  detailModules,
  languageOptions,
  platformOptions,
  productMainModules,
  retouchOptions,
  type GeneralStyle,
  type ModuleMode,
  type ReferenceStrength,
  type WorkbenchMode,
} from './shared'
import type { GenerationNotice, InlineGenerationTask } from './use-generation-task'

interface CreationPanelProps {
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

const ratioOptions = ['1:1', '4:5', '16:9'] as const
const styleOptions: ReadonlyArray<readonly [GeneralStyle, string]> = [
  ['minimal', '极简'],
  ['studio', '高级'],
  ['fresh', '生活方式'],
  ['technology', '科技'],
  ['guochao', '自然'],
]

function filesFromDrop(event: DragEvent<HTMLLabelElement>) {
  return Array.from(event.dataTransfer.files).filter((file) => file.type.startsWith('image/'))
}

export function CreationPanel(props: CreationPanelProps) {
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

  const isGeneral = mode === 'general'
  const isModuleTask = task === 'product-main' || task === 'detail-page'
  const maxProductFiles = task === 'product-retouch' ? 1 : task === 'viral-recreate' ? 3 : 6
  const sourceFiles = isGeneral ? referenceFiles : productFiles
  const promptValue = isGeneral ? prompt : requirements
  const promptPlaceholder = isGeneral
    ? '描述你想要的视觉，例如：为这款绿色护肤瓶生成一张高级、干净、自然的电商主图。'
    : requirementsPlaceholder

  function setPromptValue(next: string) {
    if (isGeneral) onSetPrompt(next)
    else onSetRequirements(next)
  }

  function addFiles(files: File[]) {
    if (isGeneral) {
      onSetReferenceFiles([...referenceFiles, ...files].slice(0, 6))
      return
    }
    onSetProductFiles([...productFiles, ...files].slice(0, maxProductFiles))
  }

  function optimizePrompt() {
    setPromptValue(isGeneral
      ? '极简棚拍，柔和侧光，突出商品材质与真实细节，画面干净，适合高端电商投放。'
      : requirementsPlaceholder || '请围绕产品名称、核心卖点、目标人群和平台规范，生成统一、清晰、真实的商业视觉。')
  }

  return (
    <aside className="configuration-panel creation-panel">
      <div className="creation-panel-heading">
        <div><span>AI Creation</span><h2>{title}</h2></div>
        <span className="creation-ai-state"><i />AI 自动</span>
      </div>

      <div className="configuration-scroll creation-panel-scroll">
        <section className="creation-section creation-upload-section">
          <div className="creation-section-heading">
            <span className="creation-step">01</span>
            <div><h3>{isGeneral ? '参考素材' : '商品素材'}</h3><p>点击或拖拽上传图片</p></div>
            <small>{sourceFiles.length}/{isGeneral ? 6 : maxProductFiles}</small>
          </div>
          <div className="upload-list creation-upload-list">
            {sourceFiles.map((file, index) => (
              <SelectedImageThumbnail
                key={`${file.name}-${file.size}-${file.lastModified}-${index}`}
                file={file}
                label={isGeneral ? `参考 ${index + 1}` : index === 0 ? '主图' : `素材 ${index + 1}`}
                onRemove={() => isGeneral
                  ? onSetReferenceFiles(referenceFiles.filter((_, fileIndex) => fileIndex !== index))
                  : onSetProductFiles(productFiles.filter((_, fileIndex) => fileIndex !== index))}
              />
            ))}
            {sourceFiles.length < (isGeneral ? 6 : maxProductFiles) && (
              <label
                className="creation-dropzone"
                onDragOver={(event) => event.preventDefault()}
                onDrop={(event) => {
                  event.preventDefault()
                  addFiles(filesFromDrop(event))
                }}
              >
                <span><Upload size={18} /></span>
                <strong>添加商品图片</strong>
                <small>JPG、PNG、WEBP</small>
                <input
                  multiple={isGeneral || maxProductFiles > 1}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  onChange={(event) => {
                    addFiles(Array.from(event.target.files ?? []))
                    event.target.value = ''
                  }}
                />
              </label>
            )}
          </div>
        </section>

        {task === 'viral-recreate' && (
          <section className="creation-section">
            <div className="creation-section-heading">
              <span className="creation-step">02</span>
              <div><h3>参考爆款图</h3><p>上传 1 张要参考的视觉</p></div>
              <small>{referenceFiles.length}/1</small>
            </div>
            <div className="upload-list creation-upload-list">
              {referenceFiles.map((file, index) => (
                <SelectedImageThumbnail
                  key={`${file.name}-${file.size}-${file.lastModified}-${index}`}
                  file={file}
                  label={`参考 ${index + 1}`}
                  onRemove={() => onSetReferenceFiles([])}
                />
              ))}
              {referenceFiles.length === 0 && (
                <label className="creation-dropzone">
                  <span><Upload size={18} /></span>
                  <strong>添加参考图</strong>
                  <small>用于分析构图与风格</small>
                  <input type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => {
                    onSetReferenceFiles(Array.from(event.target.files ?? []).slice(0, 1))
                    event.target.value = ''
                  }} />
                </label>
              )}
            </div>
          </section>
        )}

        <section className="creation-section">
          <div className="creation-section-heading">
            <span className="creation-step">02</span>
            <div><h3>生成描述</h3><p>描述你想要的画面</p></div>
            <button className="creation-ai-button" type="button" onClick={optimizePrompt}><Sparkles size={14} />AI 优化</button>
          </div>
          <textarea
            className="creation-prompt"
            value={promptValue}
            onChange={(event) => setPromptValue(event.target.value)}
            placeholder={promptPlaceholder}
          />
          <p className="creation-ai-note"><Sparkles size={13} />AI 将自动处理构图、背景、光影与平台规范，你只需要描述目标。</p>
        </section>

        <section className="creation-section creation-choice-section">
          <div className="creation-section-heading">
            <span className="creation-step">03</span>
            <div><h3>画面比例</h3><p>选择最终输出尺寸</p></div>
          </div>
          <div className="creation-choice-grid">
            {ratioOptions.map((ratio) => (
              <button
                className={aspectRatio === ratio ? 'selected' : ''}
                key={ratio}
                type="button"
                aria-pressed={aspectRatio === ratio}
                onClick={() => onSetAspectRatio(ratio)}
              >
                <span className={`ratio-shape ratio-${ratio.replace(':', '-')}`} />
                {ratio}
              </button>
            ))}
          </div>
        </section>

        {isGeneral && (
          <section className="creation-section creation-choice-section">
            <div className="creation-section-heading">
              <span className="creation-step">04</span>
              <div><h3>视觉风格</h3><p>选择一个方向，也可以交给 AI</p></div>
            </div>
            <div className="creation-style-grid">
              {styleOptions.map(([value, label]) => (
                <button
                  className={style === value ? 'selected' : ''}
                  key={value}
                  type="button"
                  aria-pressed={style === value}
                  onClick={() => onSetStyle(value)}
                >
                  {label}
                </button>
              ))}
            </div>
          </section>
        )}

        {task === 'product-retouch' && (
          <section className="creation-section creation-choice-section">
            <div className="creation-section-heading">
              <span className="creation-step">04</span>
              <div><h3>快捷优化</h3><p>可多选，也可以完全交给 AI</p></div>
            </div>
            <div className="creation-style-grid">
              {retouchOptions.map(([value, label]) => (
                <button
                  className={enhancements.includes(value) ? 'selected' : ''}
                  key={value}
                  type="button"
                  aria-pressed={enhancements.includes(value)}
                  onClick={() => onSetEnhancements(enhancements.includes(value)
                    ? enhancements.filter((item) => item !== value)
                    : [...enhancements, value])}
                >
                  {label}
                </button>
              ))}
            </div>
          </section>
        )}

        <details className="creation-advanced">
          <summary>
            <div><strong>更多设置</strong><span>平台、语言、模块、模型与输出规格</span></div>
            <ChevronDown size={17} />
          </summary>
          <div className="creation-advanced-body">
            {mode === 'commerce' && (
              <div className="creation-advanced-grid two-columns">
                <label>目标平台<Select value={platform} onValueChange={onSetPlatform}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{platformOptions.map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent></Select></label>
                {task !== 'product-retouch' && <label>目标语言<Select value={outputLanguage} onValueChange={onSetOutputLanguage}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{languageOptions.map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent></Select></label>}
              </div>
            )}

            {isGeneral && (
              <div className="creation-advanced-grid two-columns">
                <label>参考强度<Select value={referenceStrength} onValueChange={(value) => onSetReferenceStrength(value as ReferenceStrength)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="low">低</SelectItem><SelectItem value="medium">中</SelectItem><SelectItem value="high">高</SelectItem></SelectContent></Select></label>
              </div>
            )}

            {task === 'viral-recreate' && (
              <div className="creation-segment">
                <span>复刻程度</span>
                <div className="module-tabs"><button type="button" className={recreateStrength === 'style' ? 'selected' : ''} onClick={() => onSetRecreateStrength('style')}>参考风格</button><button type="button" className={recreateStrength === 'high' ? 'selected' : ''} onClick={() => onSetRecreateStrength('high')}>高度复刻</button></div>
              </div>
            )}

            {isModuleTask && (
              <div className="creation-segment">
                <span>图片模块</span>
                <div className="module-tabs"><button type="button" className={moduleMode === 'smart' ? 'selected' : ''} onClick={() => onSetModuleMode('smart')}>智能模块</button><button type="button" className={moduleMode === 'custom' ? 'selected' : ''} onClick={() => onSetModuleMode('custom')}>自定义模块</button></div>
                {moduleMode === 'custom' && <div className="module-count-grid">{(task === 'product-main' ? productMainModules : detailModules).map(([value, label]) => {
                  const selected = moduleCounts[value] !== undefined
                  const total = Object.values(moduleCounts).reduce((sum, current) => sum + current, 0)
                  return <div className={`module-choice ${selected ? 'selected' : ''}`} key={value}><label><input type="checkbox" checked={selected} disabled={!selected && total >= 16} onChange={(event) => onSetModuleCounts(event.target.checked ? { ...moduleCounts, [value]: 1 } : (() => { const next = { ...moduleCounts }; delete next[value]; return next })())} /><span>{label}</span></label>{selected && <Select value={String(moduleCounts[value])} onValueChange={(next) => onSetModuleCounts({ ...moduleCounts, [value]: Number(next) })}><SelectTrigger className="select-trigger-count" aria-label={`${label}数量`}><SelectValue /></SelectTrigger><SelectContent>{[1, 2, 3, 4].map((number) => <SelectItem key={number} value={String(number)} disabled={number > (moduleCounts[value] ?? 0) + (16 - total)}>{number} 张</SelectItem>)}</SelectContent></Select>}</div>
                })}</div>}
              </div>
            )}

            <div className="creation-advanced-grid">
              <label>生图模型<Select value={model} onValueChange={(value) => onSetModel(value as GenerationModel)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="gpt-image-2">GPT Image 2</SelectItem><SelectItem value="gemini-2.5-flash-image">Gemini 2.5 Flash</SelectItem><SelectItem value="gemini-3.1-flash-image">Gemini 3.1 Flash</SelectItem><SelectItem value="gemini-3-pro-image">Gemini 3 Pro Image</SelectItem></SelectContent></Select></label>
              <label>分辨率<Select value={resolution} onValueChange={onSetResolution}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="1K">1K</SelectItem><SelectItem value="2K">2K</SelectItem><SelectItem value="4K">4K</SelectItem></SelectContent></Select></label>
              <label>生成数量{isGeneral ? <Select value={String(count)} onValueChange={(value) => onSetCount(Number(value))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{Array.from({ length: 16 }, (_, index) => <SelectItem key={index + 1} value={String(index + 1)}>{index + 1} 张</SelectItem>)}</SelectContent></Select> : <span className="settings-value">{isModuleTask ? moduleMode === 'custom' ? `${Math.max(1, Object.values(moduleCounts).reduce((sum, value) => sum + value, 0))} 张` : '智能生成' : '1 张'}</span>}</label>
            </div>
          </div>
        </details>
      </div>

      <footer className="configuration-footer creation-panel-footer">
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
