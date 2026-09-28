'use client'

import { AlertCircle, Check, ChevronDown, Sparkles, Upload, Wand2 } from 'lucide-react'
import { useState, type DragEvent, type ReactNode } from 'react'

import { Button, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui'
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

/** 界面只展示契约接受的比例，主推 1:1 / 3:4 / 16:9 三种常用构图。 */
const ratioOptions = (['1:1', '3:4', '16:9'] as const).filter((ratio) => aspectRatioOptions.includes(ratio))

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

const modelLabels: Record<GenerationModel, string> = {
  'gpt-image-2': 'GPT Image 2',
  'gemini-2.5-flash-image': 'Gemini 2.5 Flash',
  'gemini-3.1-flash-image': 'Gemini 3.1 Flash',
  'gemini-3-pro-image': 'Gemini 3 Pro Image',
}

function imagesFromDrop(event: DragEvent<HTMLLabelElement>) {
  return Array.from(event.dataTransfer.files).filter((file) => file.type.startsWith('image/'))
}

function Card({
  step,
  title,
  tone,
  aside,
  hint,
  children,
}: {
  step: string
  title: string
  tone?: 'mint' | 'lime' | 'peach'
  aside?: ReactNode
  hint?: string
  children: ReactNode
}) {
  return (
    <section className="card">
      <div className="card-head">
        <span className="card-step" data-tone={tone} aria-hidden="true">
          {step}
        </span>
        <h3 className="grow">{title}</h3>
        {aside}
      </div>
      {hint && <p className="card-hint">{hint}</p>}
      {children}
    </section>
  )
}

export function SpecPanel(props: SpecPanelProps) {
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

  const [advanced, setAdvanced] = useState(false)

  const isGeneral = mode === 'general'
  const isModuleTask = task === 'product-main' || task === 'detail-page'
  const maxProductFiles = task === 'product-retouch' ? 1 : task === 'viral-recreate' ? 3 : 6
  const sourceFiles = isGeneral ? referenceFiles : productFiles
  const sourceLimit = isGeneral ? 6 : maxProductFiles
  const promptValue = isGeneral ? prompt : requirements
  const promptPlaceholder = isGeneral
    ? '描述你想要的画面，例如：为这款绿色护肤瓶生成一张干净、自然的电商主图。'
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
    setPromptValue(
      isGeneral
        ? '极简棚拍，柔和侧光，突出商品材质与真实细节，画面干净，适合高端电商投放。'
        : requirementsPlaceholder || '请围绕产品名称、核心卖点、目标人群和平台规范，生成统一、清晰、真实的商业视觉。',
    )
  }

  const moduleTotal = Object.values(moduleCounts).reduce((sum, value) => sum + value, 0)
  const moduleKeys = task === 'product-main' ? productMainModules : detailModules
  const outputCount = isGeneral ? `${count} 张` : isModuleTask ? (moduleMode === 'custom' ? `${Math.max(1, moduleTotal)} 张` : '智能生成') : '1 张'
  const sceneLabel = isGeneral
    ? '视觉风格'
    : task === 'product-retouch'
      ? '快捷优化'
      : task === 'viral-recreate'
        ? '复刻程度'
        : '构图方式'

  const submitLabel = isSubmitting
    ? '正在提交…'
    : isGenerating
      ? '正在生成…'
      : aiEnabled === null
        ? '检测 AI 服务…'
        : `生成 ${title}`

  return (
    <aside className="setup" aria-label="生成设置">
      <div className="composer-tabs" role="tablist" aria-label="创作类型">
        <button className="composer-tab is-active" type="button" role="tab" aria-selected="true">
          <Sparkles size={15} aria-hidden="true" /> 图片生成
        </button>
        <button className="composer-tab" type="button" role="tab" aria-selected="false" disabled title="视频生成将在后续版本开放">
          视频生成
        </button>
        <button className="composer-tab" type="button" role="tab" aria-selected="false" disabled title="数字人将在后续版本开放">
          数字人
        </button>
        <button className="composer-tab" type="button" role="tab" aria-selected="false" disabled title="动作模仿将在后续版本开放">
          动作模仿
        </button>
      </div>
      <p className="composer-helper">可直接文字生图，也可以上传图片后输入指令进行编辑</p>
      <div className="setup-stack">
        <Card
          step="01"
          tone="mint"
          title={isGeneral ? '参考素材' : '商品素材'}
          hint={
            isGeneral
              ? '可不传；上传后会作为构图与色调的参考。'
              : task === 'product-retouch'
                ? '精修只需要 1 张原图，AI 会保留商品本身。'
                : '最多 6 张，建议包含正面、侧面与细节。'
          }
          aside={
            <span className="chip-count">
              {sourceFiles.length} / {sourceLimit}
            </span>
          }
        >
          {sourceFiles.length === 0 ? (
            <label
              className="drop is-wide"
              onDragOver={(event) => event.preventDefault()}
              onDrop={(event) => {
                event.preventDefault()
                addFiles(imagesFromDrop(event))
              }}
            >
              <span>
                <Upload size={17} aria-hidden="true" />
              </span>
              <span>
                <strong>{isGeneral ? '添加参考图' : '添加商品图'}</strong>
                <small>拖拽或点击上传 · JPG / PNG / WEBP</small>
              </span>
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
          ) : (
            <div className="shot-grid">
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
                  className="drop"
                  onDragOver={(event) => event.preventDefault()}
                  onDrop={(event) => {
                    event.preventDefault()
                    addFiles(imagesFromDrop(event))
                  }}
                >
                  <Upload size={16} aria-hidden="true" />
                  <strong>添加</strong>
                  <input
                    multiple={isGeneral || maxProductFiles > 1}
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    aria-label={isGeneral ? '继续添加参考图' : '继续添加商品图'}
                    onChange={(event) => {
                      addFiles(Array.from(event.target.files ?? []))
                      event.target.value = ''
                    }}
                  />
                </label>
              )}
            </div>
          )}
        </Card>

        {task === 'viral-recreate' && (
          <Card
            step="02"
            tone="mint"
            title="参考爆款图"
            hint="上传 1 张要参考的爆款视觉，AI 会拆解它的构图与节奏。"
            aside={<span className="chip-count">{referenceFiles.length} / 1</span>}
          >
            {referenceFiles.length === 0 ? (
              <label className="drop is-wide">
                <span>
                  <Upload size={17} aria-hidden="true" />
                </span>
                <span>
                  <strong>添加爆款图</strong>
                  <small>仅 1 张，用来分析构图与风格</small>
                </span>
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
            ) : (
              <div className="shot-grid">
                {referenceFiles.map((file, index) => (
                  <SelectedImageThumbnail
                    key={`${file.name}-${file.size}-${file.lastModified}-${index}`}
                    file={file}
                    label="爆款参考"
                    onRemove={() => onSetReferenceFiles([])}
                  />
                ))}
              </div>
            )}
          </Card>
        )}

        <Card
          step={task === 'viral-recreate' ? '03' : '02'}
          tone="lime"
          title="生成描述"
          hint={isGeneral ? '说清楚主体、光线和用途就够了。' : '产品名称、核心卖点、目标人群、平台规范都可以写进来。'}
        >
          <div className="prompt-wrap">
            <textarea
              className="soft-input"
              id="istudio-prompt"
              value={promptValue}
              onChange={(event) => setPromptValue(event.target.value)}
              placeholder={promptPlaceholder}
              aria-label="生成描述"
            />
            <button className="assist" type="button" onClick={optimizePrompt}>
              <Wand2 size={12} aria-hidden="true" />
              帮我写一句
            </button>
          </div>
          <p className="field-note">
            <Sparkles size={12} aria-hidden="true" />
            构图、背景、光影与平台规范由 AI 处理，你只需要描述目标。
          </p>
        </Card>

        <Card
          step={task === 'viral-recreate' ? '04' : '03'}
          tone="peach"
          title="画面"
          hint="比例决定出图尺寸与平台展示方式；风格留空也可以交给 AI。"
        >
          <div className="stack">
            <span>画面比例</span>
            <div className="opt-grid cols-3">
              {ratioOptions.map((ratio) => (
                <button
                  className="opt"
                  key={ratio}
                  type="button"
                  aria-pressed={aspectRatio === ratio}
                  onClick={() => onSetAspectRatio(ratio)}
                >
                  <span className={`ratio-shape r-${ratio.replace(':', '-')}`} aria-hidden="true" />
                  <span className="num">{ratio}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="stack" style={{ marginTop: 14 }}>
            <span>{sceneLabel}</span>
            {isGeneral && (
              <div className="opt-grid cols-3">
                {styleOptions.map(([value, label]) => (
                  <button className="opt" key={value} type="button" aria-pressed={style === value} onClick={() => onSetStyle(value)}>
                    {label}
                  </button>
                ))}
              </div>
            )}
            {task === 'product-retouch' && (
              <div className="opt-grid cols-3">
                {retouchOptions.map(([value, label]) => (
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
            )}
            {task === 'viral-recreate' && (
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
            )}
            {isModuleTask && (
              <p className="muted" style={{ fontSize: 12, lineHeight: 1.7 }}>
                商品主图与详情页的构图由 AI 按平台规范自动排布，无需在这里选择。
              </p>
            )}
          </div>
        </Card>

        {/* 更多设置：卡片右上角的圆形箭头按钮负责展开，和参考图一致 */}
        <section className="card">
          <div className="card-head">
            <span className="card-step" aria-hidden="true">
              ✦
            </span>
            <h3 className="grow">更多设置</h3>
            <button
              className="card-corner"
              type="button"
              aria-expanded={advanced}
              aria-label={advanced ? '收起更多设置' : '展开更多设置'}
              title={advanced ? '收起' : '展开'}
              onClick={() => setAdvanced((value) => !value)}
            >
              <ChevronDown size={15} />
            </button>
          </div>
          <p className="card-hint" style={{ marginBottom: advanced ? 14 : 0 }}>
            平台、语言、模块、模型与输出规格
          </p>
          {advanced && (
            <div className="acc-body is-flat">
              {mode === 'commerce' && (
                <div className="row2">
                  <label className="stack">
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
                    <label className="stack">
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
                <label className="stack">
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

              {isModuleTask && (
                <div className="stack">
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
                    <div className="check-list">
                      {moduleKeys.map(([value, label]) => {
                        const selected = moduleCounts[value] !== undefined
                        return (
                          <div className="check-row" data-on={selected} key={value}>
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
                                <SelectTrigger compact aria-label={`${label}数量`}>
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  {[1, 2, 3, 4].map((number) => (
                                    <SelectItem
                                      key={number}
                                      value={String(number)}
                                      disabled={number > (moduleCounts[value] ?? 0) + (16 - moduleTotal)}
                                    >
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

              <div className="stack">
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

              <div className="row2">
                <label className="stack">
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
                <div className="stack">
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
                    <span className="static-val num">{outputCount}</span>
                  )}
                </div>
              </div>
            </div>
          )}
        </section>

        <div className="setup-foot">
          {notice && (
            <p className={`toast ${notice.kind === 'success' ? 'toast-success' : 'toast-error'}`} role="status">
              {notice.kind === 'success' ? <Check size={13} aria-hidden="true" /> : <AlertCircle size={13} aria-hidden="true" />}
              {notice.message}
            </p>
          )}
          <Button
            variant="dark"
            size="lg"
            block
            loading={isSubmitting}
            disabled={isGenerating || aiEnabled === null}
            onClick={onSubmit}
            title={
              aiEnabled === null
                ? '正在检测 AI 服务可用性'
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
          {/* 模型是唯一没在别处出现的参数；⌘/Ctrl + Enter 与点按钮等价 */}
          <p className="foot-meta">
            <span>{modelLabels[model]}</span>
            <kbd className="kbd" title="按 ⌘ / Ctrl + Enter 直接生成">
              ⌘/Ctrl + Enter
            </kbd>
          </p>
        </div>
      </div>
    </aside>
  )
}
