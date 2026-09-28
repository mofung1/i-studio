'use client'

import { AlertCircle, Check, ChevronDown, Sparkles, Upload } from 'lucide-react'
import type { DragEvent } from 'react'
import type { ReactNode } from 'react'

import { Button } from '@/components/ui'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui'
import { aspectRatioOptions, type CommerceTaskType, type GenerationModel } from '@/lib/contracts'

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

interface SpecPanelProps {
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

/** 界面只展示契约接受的比值，主推 1:1 / 3:4 / 16:9 三种常用构图。 */
const ratioOptions = (['1:1', '3:4', '16:9'] as const).filter((ratio) =>
  aspectRatioOptions.includes(ratio),
)

const styleOptions: ReadonlyArray<readonly [GeneralStyle, string]> = [
  ['minimal', '极简'],
  ['studio', '高级'],
  ['fresh', '生活方式'],
  ['technology', '科技'],
  ['guochao', '自然'],
]

const recreateOptions: ReadonlyArray<readonly ['style' | 'high', string]> = [
  ['style', '参考风格'],
  ['high', '高度复刻'],
]

function imagesFromDrop(event: DragEvent<HTMLLabelElement>) {
  return Array.from(event.dataTransfer.files).filter((file) => file.type.startsWith('image/'))
}

/** 一个工单条目：左侧是条款序号栏，像一份规格书的编号栏目。 */
function Clause({
  index,
  title,
  counter,
  hint,
  action,
  children,
}: {
  index: number
  title: string
  counter?: string
  hint?: string
  action?: ReactNode
  children: ReactNode
}) {
  return (
    <section className="clause">
      <span className="clause-index" aria-hidden="true">
        {String(index).padStart(2, '0')}
      </span>
      <div className="clause-body">
        <div className="clause-head">
          <h3>{title}</h3>
          {counter && <span>{counter}</span>}
        </div>
        {hint && <p className="clause-hint">{hint}</p>}
        {children}
        {action}
      </div>
    </section>
  )
}

export function SpecPanel(props: SpecPanelProps) {
  const {
    mode,
    task,
    title,
    requirementsPlaceholder,
    productFiles,
    referenceFiles,
    prompt,
    requirements,
    platform,
    outputLanguage,
    style,
    referenceStrength,
    moduleMode,
    moduleCounts,
    recreateStrength,
    enhancements,
    count,
    model,
    aspectRatio,
    resolution,
    aiEnabled,
    notice,
    isSubmitting,
    isGenerating,
    onSetProductFiles,
    onSetReferenceFiles,
    onSetPrompt,
    onSetRequirements,
    onSetPlatform,
    onSetOutputLanguage,
    onSetStyle,
    onSetReferenceStrength,
    onSetModuleMode,
    onSetModuleCounts,
    onSetRecreateStrength,
    onSetEnhancements,
    onSetCount,
    onSetModel,
    onSetAspectRatio,
    onSetResolution,
    onSubmit,
  } = props

  const isGeneral = mode === 'general'
  const isModuleTask = task === 'product-main' || task === 'detail-page'
  const maxProductFiles = task === 'product-retouch' ? 1 : task === 'viral-recreate' ? 3 : 6
  const sourceFiles = isGeneral ? referenceFiles : productFiles
  const sourceLimit = isGeneral ? 6 : maxProductFiles
  const promptValue = isGeneral ? prompt : requirements
  const promptPlaceholder = isGeneral
    ? '描述你想要的画面，例如：为这款绿色护肤瓶生成一张干净、自然的电商主图。'
    : requirementsPlaceholder

  // 条款编号按真实填写顺序递增，只给真正的步骤编号
  let step = 0
  const nextStep = () => ++step
  const sourceStep = nextStep()
  const referenceStep = task === 'viral-recreate' ? nextStep() : null
  const promptStep = nextStep()
  const ratioStep = nextStep()
  const extraStep = isGeneral || task === 'product-retouch' ? nextStep() : null

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
    setPromptValue(
      isGeneral
        ? '极简棚拍，柔和侧光，突出商品材质与真实细节，画面干净，适合高端电商投放。'
        : requirementsPlaceholder || '请围绕产品名称、核心卖点、目标人群和平台规范，生成统一、清晰、真实的商业视觉。',
    )
  }

  const moduleTotal = Object.values(moduleCounts).reduce((sum, value) => sum + value, 0)
  const moduleKeys = task === 'product-main' ? productMainModules : detailModules

  const submitLabel = isSubmitting
    ? '正在提交…'
    : isGenerating
      ? '正在生成…'
      : aiEnabled === null
        ? '检查 AI 服务…'
        : `生成 ${title}`

  return (
    <aside className="spec-panel" aria-label="生成工单">
      <div className="spec-head">
        <div className="spec-head-left">
          <span className="spec-kicker">
            {isGeneral ? 'image / general' : `commerce / ${task}`}
          </span>
          <h2 className="spec-title">{title}</h2>
          <p className="spec-caption">
            {isGeneral ? '用文字或参考图构建画面' : '上传商品原图，其余交给 AI'}
          </p>
        </div>
      </div>

      <div className="spec-scroll">
        <Clause
          index={sourceStep}
          title={isGeneral ? '参考素材' : '商品素材'}
          counter={`${sourceFiles.length} / ${sourceLimit}`}
          hint={
            isGeneral
              ? '可不传；上传后会作为构图与色调的参考。'
              : task === 'product-retouch'
                ? '精修只需要 1 张原图，AI 会保留商品本身。'
                : '最多 6 张，建议包含正面、侧面与细节。'
          }
        >
          <div className="plate-grid">
            {sourceFiles.map((file, index) => (
              <SelectedImageThumbnail
                key={`${file.name}-${file.size}-${file.lastModified}-${index}`}
                file={file}
                label={isGeneral ? `参考 ${index + 1}` : index === 0 ? '原图' : `素材 ${index + 1}`}
                onRemove={() =>
                  isGeneral
                    ? onSetReferenceFiles(referenceFiles.filter((_, fileIndex) => fileIndex !== index))
                    : onSetProductFiles(productFiles.filter((_, fileIndex) => fileIndex !== index))
                }
              />
            ))}
            {sourceFiles.length < sourceLimit && (
              <label
                className="plate-drop"
                onDragOver={(event) => event.preventDefault()}
                onDrop={(event) => {
                  event.preventDefault()
                  addFiles(imagesFromDrop(event))
                }}
              >
                <Upload size={17} aria-hidden="true" />
                <strong>{isGeneral ? '添加参考图' : '添加商品图'}</strong>
                <small>JPG · PNG · WEBP</small>
                <input
                  multiple={isGeneral || maxProductFiles > 1}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  aria-label={isGeneral ? '添加参考图' : '添加商品图'}
                  onChange={(event) => {
                    addFiles(Array.from(event.target.files ?? []))
                    event.target.value = ''
                  }}
                />
              </label>
            )}
          </div>
        </Clause>

        {referenceStep !== null && (
          <Clause
            index={referenceStep}
            title="参考爆款图"
            counter={`${referenceFiles.length} / 1`}
            hint="上传 1 张要参考的爆款视觉，AI 会拆解它的构图与节奏。"
          >
            <div className="plate-grid">
              {referenceFiles.map((file, index) => (
                <SelectedImageThumbnail
                  key={`${file.name}-${file.size}-${file.lastModified}-${index}`}
                  file={file}
                  label="爆款参考"
                  onRemove={() => onSetReferenceFiles([])}
                />
              ))}
              {referenceFiles.length === 0 && (
                <label className="plate-drop">
                  <Upload size={17} aria-hidden="true" />
                  <strong>添加爆款图</strong>
                  <small>仅 1 张</small>
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    aria-label="添加爆款参考图"
                    onChange={(event) => {
                      onSetReferenceFiles(Array.from(event.target.files ?? []).slice(0, 1))
                      event.target.value = ''
                    }}
                  />
                </label>
              )}
            </div>
          </Clause>
        )}

        <Clause
          index={promptStep}
          title="生成描述"
          hint={isGeneral ? '说清楚主体、光线和用途就够了。' : '产品名称、核心卖点、目标人群、平台规范都可以写进来。'}
        >
          <div className="prompt-field">
            <textarea
              id="istudio-prompt"
              value={promptValue}
              onChange={(event) => setPromptValue(event.target.value)}
              placeholder={promptPlaceholder}
              aria-label="生成描述"
            />
            <button className="prompt-assist" type="button" onClick={optimizePrompt}>
              <Sparkles size={12} aria-hidden="true" />
              帮我写一句
            </button>
          </div>
          <p className="field-note">
            <Sparkles size={12} aria-hidden="true" />
            构图、背景、光影与平台规范由 AI 处理，你只需要描述目标。
          </p>
        </Clause>

        <Clause index={ratioStep} title="画面比例" hint="决定最终出图尺寸，也决定它在平台上的展示方式。">
          <div className="opt-grid cols-3">
            {ratioOptions.map((ratio) => (
              <button
                className="opt"
                key={ratio}
                type="button"
                aria-pressed={aspectRatio === ratio}
                onClick={() => onSetAspectRatio(ratio)}
              >
                <span className={`ratio-shape ratio-${ratio.replace(':', '-')}`} aria-hidden="true" />
                <span className="mono">{ratio}</span>
              </button>
            ))}
          </div>
        </Clause>

        {extraStep !== null && (
          <Clause
            index={extraStep}
            title={isGeneral ? '视觉风格' : '快捷优化'}
            hint={isGeneral ? '选一个方向，也可以留白交给 AI。' : '可多选，也可以完全交给 AI。'}
          >
            <div className="opt-grid cols-3">
              {isGeneral
                ? styleOptions.map(([value, label]) => (
                    <button
                      className="opt"
                      key={value}
                      type="button"
                      aria-pressed={style === value}
                      onClick={() => onSetStyle(value)}
                    >
                      {label}
                    </button>
                  ))
                : retouchOptions.map(([value, label]) => (
                    <button
                      className="opt"
                      key={value}
                      type="button"
                      aria-pressed={enhancements.includes(value)}
                      onClick={() =>
                        onSetEnhancements(
                          enhancements.includes(value)
                            ? enhancements.filter((item) => item !== value)
                            : [...enhancements, value],
                        )
                      }
                    >
                      {label}
                    </button>
                  ))}
            </div>
          </Clause>
        )}

        <section className="clause">
          <span className="clause-index" aria-hidden="true">
            ✳
          </span>
          <div className="clause-body">
            <details className="advanced">
              <summary>
                <span>
                  <strong>附录 · 更多设置</strong>
                  <span>平台、语言、模块、模型与输出规格</span>
                </span>
                <ChevronDown size={16} />
              </summary>
              <div className="advanced-body">
                {mode === 'commerce' && (
                  <div className="field-row">
                    <label className="field">
                      <span>目标平台</span>
                      <Select value={platform} onValueChange={onSetPlatform}>
                        <SelectTrigger aria-label="目标平台">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {platformOptions.map(([value, label]) => (
                            <SelectItem key={value} value={value}>
                              {label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </label>
                    {task !== 'product-retouch' && (
                      <label className="field">
                        <span>目标语言</span>
                        <Select value={outputLanguage} onValueChange={onSetOutputLanguage}>
                          <SelectTrigger aria-label="目标语言">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {languageOptions.map(([value, label]) => (
                              <SelectItem key={value} value={value}>
                                {label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </label>
                    )}
                  </div>
                )}

                {isGeneral && (
                  <label className="field">
                    <span>参考强度</span>
                    <Select value={referenceStrength} onValueChange={(value) => onSetReferenceStrength(value as ReferenceStrength)}>
                      <SelectTrigger aria-label="参考强度">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="low">低</SelectItem>
                        <SelectItem value="medium">中</SelectItem>
                        <SelectItem value="high">高</SelectItem>
                      </SelectContent>
                    </Select>
                  </label>
                )}

                {task === 'viral-recreate' && (
                  <div className="field">
                    <span>复刻程度</span>
                    <div className="opt-grid cols-2">
                      {recreateOptions.map(([value, label]) => (
                        <button
                          className="opt"
                          key={value}
                          type="button"
                          aria-pressed={recreateStrength === value}
                          onClick={() => onSetRecreateStrength(value)}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {isModuleTask && (
                  <div className="field">
                    <span>图片模块</span>
                    <div className="opt-grid cols-2">
                      <button className="opt" type="button" aria-pressed={moduleMode === 'smart'} onClick={() => onSetModuleMode('smart')}>
                        智能模块
                      </button>
                      <button className="opt" type="button" aria-pressed={moduleMode === 'custom'} onClick={() => onSetModuleMode('custom')}>
                        自定义模块
                      </button>
                    </div>
                    {moduleMode === 'custom' && (
                      <div className="module-grid">
                        {moduleKeys.map(([value, label]) => {
                          const selected = moduleCounts[value] !== undefined
                          return (
                            <div className="module-row" data-on={selected} key={value}>
                              <label>
                                <input
                                  type="checkbox"
                                  checked={selected}
                                  disabled={!selected && moduleTotal >= 16}
                                  onChange={(event) =>
                                    onSetModuleCounts(
                                      event.target.checked
                                        ? { ...moduleCounts, [value]: 1 }
                                        : (() => {
                                            const next = { ...moduleCounts }
                                            delete next[value]
                                            return next
                                          })(),
                                    )
                                  }
                                />
                                <span>{label}</span>
                              </label>
                              {selected && (
                                <Select
                                  value={String(moduleCounts[value])}
                                  onValueChange={(next) => onSetModuleCounts({ ...moduleCounts, [value]: Number(next) })}
                                >
                                  <SelectTrigger isCount aria-label={`${label}数量`}>
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {[1, 2, 3, 4].map((number) => (
                                      <SelectItem key={number} value={String(number)} disabled={number > (moduleCounts[value] ?? 0) + (16 - moduleTotal)}>
                                        {number} 张
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              )}
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </div>
                )}

                <div className="field">
                  <span>生图模型</span>
                  <Select value={model} onValueChange={(value) => onSetModel(value as GenerationModel)}>
                    <SelectTrigger aria-label="生图模型">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="gpt-image-2">GPT Image 2</SelectItem>
                      <SelectItem value="gemini-2.5-flash-image">Gemini 2.5 Flash</SelectItem>
                      <SelectItem value="gemini-3.1-flash-image">Gemini 3.1 Flash</SelectItem>
                      <SelectItem value="gemini-3-pro-image">Gemini 3 Pro Image</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="field-row">
                  <label className="field">
                    <span>分辨率</span>
                    <Select value={resolution} onValueChange={onSetResolution}>
                      <SelectTrigger aria-label="分辨率">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="1K">1K</SelectItem>
                        <SelectItem value="2K">2K</SelectItem>
                        <SelectItem value="4K">4K</SelectItem>
                      </SelectContent>
                    </Select>
                  </label>
                  <div className="field">
                    <span>生成数量</span>
                    {isGeneral ? (
                      <Select value={String(count)} onValueChange={(value) => onSetCount(Number(value))}>
                        <SelectTrigger aria-label="生成数量">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {Array.from({ length: 16 }, (_, index) => (
                            <SelectItem key={index + 1} value={String(index + 1)}>
                              {index + 1} 张
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : (
                      <span className="static-value mono">
                        {isModuleTask ? (moduleMode === 'custom' ? `${Math.max(1, moduleTotal)} 张` : '智能生成') : '1 张'}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </details>
          </div>
        </section>
      </div>

      <footer className="spec-foot">
        {notice && (
          <p className={`notice ${notice.kind === 'success' ? 'notice-success' : 'notice-error'}`} role="status">
            {notice.kind === 'success' ? <Check size={13} aria-hidden="true" /> : <AlertCircle size={13} aria-hidden="true" />}
            {notice.message}
          </p>
        )}
        <Button
          size="lg"
          block
          variant="signal"
          loading={isSubmitting}
          disabled={isGenerating || aiEnabled === null}
          onClick={onSubmit}
          title={
            aiEnabled === null
              ? '正在检查 AI 服务可用性，请稍候'
              : isSubmitting
                ? '任务正在提交'
                : isGenerating
                  ? '当前任务生成中，完成后可继续提交'
                  : undefined
          }
        >
          {!isSubmitting && <Sparkles size={16} aria-hidden="true" />}
          {submitLabel}
        </Button>
      </footer>
    </aside>
  )
}
