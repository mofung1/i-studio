'use client'

import { isStoredImage, sameCreationImage, type CreationImage } from '@/lib/creation-images'

import {
  ChevronDown,
  ChevronUp,
  Loader2,
  RotateCcw,
  ScanText,
  SlidersHorizontal,
  X,
} from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { usePromptReverse } from '@/components/prompt-reverse-provider'
import { applyReverseText } from '@/lib/prompt-reverse'

import type { GenerationModel } from '@/lib/contracts'

import type { CommerceTaskType } from '@/lib/contracts'

import { enhancePrompt, formatPrompt } from '@/lib/api'
import { downscaleImageFiles } from '@/lib/image-file'

import { AdvancedSettings } from './advanced-settings'
import { BasicSettings } from './basic-settings'
import { GenerateBar } from './generate-bar'
import { ProductPlatformSelector } from './product-platform-selector'
import { PromptEditor } from './prompt-editor'
import { ReferenceUploader } from './reference-uploader'
import {
  detailModules,
  optionLabel,
  productMainModules,
  referenceLimit,
  modelOptions,
  type GeneralStyle,
  type ModuleMode,
  type ReferenceStrength,
  type WorkbenchMode,
} from './shared'
import type { GenerationNotice } from './use-generation-task'

interface CreatorSidebarProps {
  mode: WorkbenchMode
  generalConfigCollapsed?: boolean
  onToggleGeneralConfig?: () => void
  task: CommerceTaskType
  title: string
  requirementsPlaceholder: string
  productFiles: CreationImage[]
  referenceFiles: CreationImage[]
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
  expectedCount: number
  aiEnabled: boolean | null
  /** 后端是否配置了提示词模型 */
  promptEnhanceEnabled: boolean
  promptVision: boolean
  imageEndpoints: { id: string; name: string; model: string }[]
  modelsLoading?: boolean
  modelsError?: string
  onReloadModels?: () => void
  endpointId: string
  onSetEndpoint: (id: string) => void
  notice: GenerationNotice | null
  isSubmitting: boolean
  isGenerating: boolean
  generationStatus: string | null
  onSetProductFiles: (files: CreationImage[]) => void
  onSetReferenceFiles: (files: CreationImage[]) => void
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
  onCloseSheet: () => void
  onSubmit: () => void
}

const ASSET_LABELS: Record<CommerceTaskType, string> = {
  'product-main': '产品素材',
  'detail-page': '产品素材',
  'viral-recreate': '商品原图',
  'product-retouch': '商品原图',
  'clothing-set': '服装原图',
}

const COMPACT_STATUS_LABELS: Record<string, string> = {
  queued: '排队中',
  processing: '正在生成',
  waiting_provider: '等待出图',
  succeeded: '生成完成',
  failed: '生成失败',
  cancelled: '已取消',
  expired: '已超时',
}

/**
 * 左侧创作控制区：
 * 默认只露出「素材 → 描述 → 风格比例」这三步，其余参数收进高级设置，
 * 生成按钮固定在面板底部，不随滚动消失。
 */
export function CreatorSidebar(props: CreatorSidebarProps) {
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
    expectedCount,
    aiEnabled,
    promptEnhanceEnabled,
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
    onCloseSheet,
    onSubmit,
  } = props

  const isGeneral = mode === 'general'
  const { openReverse } = usePromptReverse()
  const [reverseUndo, setReverseUndo] = useState<{
    before: string
    after: string
    beforeFiles: CreationImage[]
    afterFiles: CreationImage[]
  } | null>(null)
  useEffect(() => {
    if (
      reverseUndo &&
      (props.prompt !== reverseUndo.after || props.referenceFiles !== reverseUndo.afterFiles)
    )
      setReverseUndo(null)
  }, [props.prompt, props.referenceFiles, reverseUndo])
  const configToggleRef = useRef<HTMLButtonElement>(null)
  const wasCollapsed = useRef(Boolean(props.generalConfigCollapsed))

  useEffect(() => {
    if (!isGeneral) return
    const body = document.getElementById('creation-settings-body')
    if (
      props.generalConfigCollapsed &&
      (document.activeElement === document.body || body?.contains(document.activeElement))
    ) {
      configToggleRef.current?.focus()
    } else if (!props.generalConfigCollapsed && wasCollapsed.current) {
      body?.querySelector<HTMLTextAreaElement>('.prompt-input')?.focus({ preventScroll: true })
    }
    wasCollapsed.current = Boolean(props.generalConfigCollapsed)
  }, [isGeneral, props.generalConfigCollapsed])
  const currentModel =
    props.imageEndpoints.find((endpoint) => endpoint.id === props.endpointId)?.name ??
    optionLabel(modelOptions, model)
  const generationStatus = isSubmitting
    ? '正在提交'
    : (COMPACT_STATUS_LABELS[props.generationStatus ?? ''] ??
      (isGenerating ? '正在生成' : '待生成'))
  const assetLabel = isGeneral ? '参考图片' : ASSET_LABELS[task]
  const assetFiles = isGeneral ? referenceFiles : productFiles
  const maxFiles = referenceLimit(mode, task)
  const needsSingleReference = !isGeneral && task === 'viral-recreate'

  const moduleTotal = Object.values(moduleCounts).reduce((total, value) => total + value, 0)
  const outputSummary = isGeneral
    ? `${count} 张`
    : task === 'product-main' || task === 'detail-page'
      ? moduleMode === 'custom'
        ? moduleTotal > 0
          ? `${moduleTotal} 张`
          : '未选模块'
        : '智能生成'
      : '1 张'

  // 主图 / 详情页是按模块成套产出的，把用户选中的模块（含张数）交给 AI，
  // 否则详情页只能拿到一段与详情页无关的通用商品图描述。
  // modules 传可读的「中文名×张数」，moduleKeys 并行传「key×张数」，
  // 由服务端补上该模块的表达要点（与真正出图时的 moduleHint 同源）。
  const usesModules = !isGeneral && (task === 'product-main' || task === 'detail-page')
  const selectedModules = usesModules
    ? (task === 'detail-page' ? detailModules : productMainModules)
        .filter(([key]) => (moduleCounts[key] ?? 0) > 0)
        .map(([key, label]) => ({ key, label, count: moduleCounts[key] }))
    : []

  const advancedSummary = [
    `${resolution}`,
    isGeneral ? `${count} 张` : outputSummary,
    optionLabel(modelOptions, model),
  ].join(' · ')

  const requirementsLabel =
    task === 'product-main' ? '主图需求' : task === 'detail-page' ? '详情图需求' : '补充要求'

  // AI 改写的输入：图片或文字至少有一个（图片按目标类型取对应的素材）
  const enhanceImages = isGeneral
    ? referenceFiles
    : task === 'viral-recreate'
      ? [...productFiles, ...referenceFiles]
      : productFiles
  // 不向用户暴露用了哪个模型；只有未接入 AI 时才说明当前是本地规则
  const enhanceHelper = !promptEnhanceEnabled
    ? '未配置 Prompt AI，将仅整理输入文字，不分析图片。'
    : !props.promptVision
      ? '当前提示词模型不支持图片识别，请先输入大概的生图内容，再提交给 AI 优化提示词。'
      : undefined
  // 空输入时点按钮给出的具体指引（比“请先上传图片或输入文字”更好照做）
  const enhanceBlockedReason = isGeneral
    ? '请先上传参考图片，或输入画面描述'
    : task === 'viral-recreate'
      ? '请先上传商品原图与爆款参考图，或输入补充要求'
      : task === 'product-retouch'
        ? '请先上传商品原图，或输入补充要求'
        : `请先上传商品原图，或输入${requirementsLabel}`

  /** 通过服务端协议客户端改写提示词。 */
  async function runEnhance(target: 'prompt' | 'requirements', text: string) {
    if (!promptEnhanceEnabled) throw new Error('请先在设置中配置提示词 AI 服务')
    if (!props.promptVision && !text.trim())
      throw new Error(
        '当前提示词模型不支持图片识别，请先输入大概的生图内容，再提交给 AI 优化提示词。',
      )
    const files = props.promptVision
      ? await Promise.all(
          enhanceImages
            .slice(0, 4)
            .map(async (image) =>
              isStoredImage(image) ? image : ((await downscaleImageFiles([image]))[0] ?? image),
            ),
        )
      : []
    const result = await enhancePrompt({
      target,
      text,
      files,
      context: {
        taskType: isGeneral ? undefined : task,
        platform: isGeneral ? undefined : platform,
        style,
        moduleMode: usesModules ? moduleMode : undefined,
        modules: usesModules
          ? selectedModules.map(({ label, count }) => `${label}×${count}`)
          : undefined,
        moduleKeys: usesModules
          ? selectedModules.map(({ key, count }) => `${key}×${count}`)
          : undefined,
        outputLanguage: isGeneral ? undefined : outputLanguage,
        recreateStrength: task === 'viral-recreate' ? recreateStrength : undefined,
        enhancements: task === 'product-retouch' ? enhancements : undefined,
      },
    })
    return result.text
  }

  return (
    <aside
      id="creation-settings"
      className={`configuration-panel creator-sidebar ${isGeneral ? 'general-composer' : 'commerce-settings'}`}
      aria-label="创作设置"
    >
      {isGeneral && props.generalConfigCollapsed && (
        <div className="general-config-head">
          <button
            ref={configToggleRef}
            type="button"
            className="general-config-summary"
            aria-label={props.generalConfigCollapsed ? '展开创作配置' : '收起创作配置'}
            aria-controls="creation-settings-body"
            aria-expanded={!props.generalConfigCollapsed}
            onClick={props.onToggleGeneralConfig}
          >
            <SlidersHorizontal size={16} aria-hidden="true" />
            <span>{props.generalConfigCollapsed ? '展开创作配置' : '收起创作配置'}</span>
            <small className="general-config-model" title={`当前模型：${currentModel}`}>
              当前模型：{currentModel}
            </small>
            <small className="general-config-status" role="status" aria-atomic="true">
              {(isSubmitting || isGenerating) && (
                <Loader2 size={12} className="animate-spin" aria-hidden="true" />
              )}
              {generationStatus}
            </small>
            {props.generalConfigCollapsed ? (
              <ChevronUp size={16} aria-hidden="true" />
            ) : (
              <ChevronDown size={16} aria-hidden="true" />
            )}
          </button>
        </div>
      )}
      <div
        id="creation-settings-body"
        className="configuration-scroll"
        hidden={Boolean(isGeneral && props.generalConfigCollapsed)}
      >
        <div className="composer-surface">
          <div className="creator-sheet-head">
            <span>创作设置</span>
            <button type="button" aria-label="收起创作设置" onClick={onCloseSheet}>
              <X size={16} />
            </button>
          </div>

          {isGeneral ? (
            <div className="composer-input-grid">
              <div className="composer-media" aria-label="参考图片">
                <ReferenceUploader
                  files={assetFiles}
                  max={maxFiles}
                  onChange={onSetReferenceFiles}
                  labelFor={(index) => `参考 ${index + 1}`}
                  emptyTitle="添加参考图片"
                  emptyHint="选择本地图片或素材库"
                  acceptedHint={`JPG / PNG / WebP · 最多 ${maxFiles} 张`}
                  collapseAt={2}
                />
              </div>
              <fieldset className="form-section config-card config-card-prompt">
                <PromptEditor
                  value={prompt}
                  onChange={onSetPrompt}
                  ariaLabel="画面描述"
                  placeholder="输入文字或上传参考图，描述你想生成的内容。"
                  enhance={async (value) =>
                    promptEnhanceEnabled
                      ? runEnhance('prompt', value)
                      : (await formatPrompt(value, style)).text
                  }
                  enhanceDisabledReason={
                    !prompt.trim() && (!promptEnhanceEnabled || enhanceImages.length === 0)
                      ? promptEnhanceEnabled
                        ? enhanceBlockedReason
                        : '请先输入画面描述'
                      : undefined
                  }
                  helper={enhanceHelper}
                  enhanceLabel="AI 优化"
                  actions={
                    <>
                      {reverseUndo && (
                        <button
                          type="button"
                          className="prompt-undo"
                          onClick={() => {
                            onSetPrompt(reverseUndo.before)
                            onSetReferenceFiles(reverseUndo.beforeFiles)
                            setReverseUndo(null)
                          }}
                        >
                          <RotateCcw size={13} aria-hidden="true" />
                          撤销反推
                        </button>
                      )}
                      <button
                        type="button"
                        className="prompt-enhance"
                        onClick={() =>
                          openReverse({
                            ...(referenceFiles[0] && isStoredImage(referenceFiles[0])
                              ? {
                                  assetId: referenceFiles[0].assetId,
                                  imageName: referenceFiles[0].name,
                                }
                              : {
                                  files: referenceFiles.filter(
                                    (image): image is File => !isStoredImage(image),
                                  ),
                                }),
                            currentPrompt: prompt,
                            onApply: ({ text, referenceFile, action }) => {
                              const alreadyIncluded =
                                referenceFile &&
                                referenceFiles.some((image) =>
                                  sameCreationImage(image, referenceFile),
                                )
                              if (
                                referenceFile &&
                                !alreadyIncluded &&
                                referenceFiles.length >= maxFiles
                              )
                                throw new Error('参考图已达上限，请先移除一张再应用')
                              const nextPrompt = applyReverseText(prompt, text, action)
                              if (nextPrompt.length > 10000)
                                throw new Error(
                                  '追加后的描述超过 10000 字，请选择替换或精简后再应用',
                                )
                              const nextFiles =
                                referenceFile && !alreadyIncluded
                                  ? [...referenceFiles, referenceFile]
                                  : referenceFiles
                              setReverseUndo({
                                before: prompt,
                                after: nextPrompt,
                                beforeFiles: referenceFiles,
                                afterFiles: nextFiles,
                              })
                              onSetPrompt(nextPrompt)
                              onSetReferenceFiles(nextFiles)
                            },
                          })
                        }
                      >
                        <ScanText size={14} aria-hidden="true" />
                        图片反推
                      </button>
                    </>
                  }
                  compact
                  collapsed={props.generalConfigCollapsed}
                />
              </fieldset>
            </div>
          ) : null}

          {!isGeneral && (
            <fieldset className="form-section config-card config-card-assets">
              <div className="field-heading">
                <legend>{assetLabel}</legend>
                <span>{maxFiles === 1 ? '必须 1 张' : `1–${maxFiles} 张`}</span>
              </div>
              <p className="field-helper">
                {task === 'product-retouch'
                  ? '以原图为基础做局部精修；需要换底或调整角度时，请在补充要求中说明。'
                  : '多张素材请使用同一商品的不同角度，外观、包装与文字以这些原图为准。'}
              </p>
              <ReferenceUploader
                files={productFiles}
                max={maxFiles}
                onChange={onSetProductFiles}
                labelFor={(index) => (index === 0 ? '主图' : `素材 ${index + 1}`)}
                emptyTitle="上传商品原图"
                emptyHint="拖入图片，或打开素材选择器"
                acceptedHint={`JPG / PNG / WebP · 最多 ${maxFiles} 张`}
              />
            </fieldset>
          )}

          {needsSingleReference && (
            <fieldset className="form-section config-card config-card-assets">
              <div className="field-heading">
                <legend>参考图（爆款图）</legend>
                <span>必须 1 张</span>
              </div>
              <p className="field-helper">只参考构图、背景与光影；最终商品和包装来自商品原图。</p>
              <ReferenceUploader
                files={referenceFiles}
                max={1}
                onChange={onSetReferenceFiles}
                labelFor={() => '参考图'}
                emptyTitle="添加参考爆款图"
                emptyHint="选择本地图片或素材库"
                acceptedHint="JPG / PNG / WebP · 仅 1 张"
              />
            </fieldset>
          )}

          {!isGeneral && (
            <fieldset className="form-section config-card">
              <div className="field-heading">
                <legend>目标平台</legend>
              </div>
              <ProductPlatformSelector value={platform} onChange={onSetPlatform} />
            </fieldset>
          )}

          {!isGeneral && (
            <fieldset className="form-section config-card config-card-prompt">
              <div className="field-heading">
                <legend>{requirementsLabel}</legend>
              </div>
              <PromptEditor
                value={requirements}
                onChange={onSetRequirements}
                ariaLabel={requirementsLabel}
                maxLength={task === 'product-main' || task === 'detail-page' ? 2000 : 1000}
                placeholder={requirementsPlaceholder}
                enhance={async (value) =>
                  promptEnhanceEnabled
                    ? runEnhance('requirements', value)
                    : (await formatPrompt(value, style)).text
                }
                enhanceLabel="AI 帮写"
                enhanceDisabledReason={
                  !requirements.trim() && (!promptEnhanceEnabled || enhanceImages.length === 0)
                    ? promptEnhanceEnabled
                      ? enhanceBlockedReason
                      : '请先输入补充需求'
                    : undefined
                }
                helper={enhanceHelper}
              />
            </fieldset>
          )}

          <div className="composer-control-row">
            <BasicSettings
              mode={mode}
              task={task}
              resolution={resolution}
              count={count}
              imageEndpoints={props.imageEndpoints}
              modelsLoading={props.modelsLoading}
              modelsError={props.modelsError}
              onReloadModels={props.onReloadModels}
              endpointId={props.endpointId}
              onSetEndpoint={props.onSetEndpoint}
              onSetResolution={onSetResolution}
              onSetCount={onSetCount}
              aspectRatio={aspectRatio}
              outputSummary={outputSummary}
              outputLanguage={outputLanguage}
              onSetOutputLanguage={onSetOutputLanguage}
              onSetAspectRatio={onSetAspectRatio}
              style={style}
              referenceStrength={referenceStrength}
              onSetStyle={onSetStyle}
              onSetReferenceStrength={onSetReferenceStrength}
            />

            {!isGeneral && (
              <AdvancedSettings
                style={style}
                onSetStyle={onSetStyle}
                imageEndpoints={props.imageEndpoints}
                endpointId={props.endpointId}
                onSetEndpoint={props.onSetEndpoint}
                mode={mode}
                task={task}
                referenceStrength={referenceStrength}
                resolution={resolution}
                count={count}
                model={model}
                moduleMode={moduleMode}
                moduleCounts={moduleCounts}
                recreateStrength={recreateStrength}
                enhancements={enhancements}
                summary={advancedSummary}
                onSetReferenceStrength={onSetReferenceStrength}
                onSetResolution={onSetResolution}
                onSetCount={onSetCount}
                onSetModel={onSetModel}
                onSetModuleMode={onSetModuleMode}
                onSetModuleCounts={onSetModuleCounts}
                onSetRecreateStrength={onSetRecreateStrength}
                onSetEnhancements={onSetEnhancements}
              />
            )}
            {isGeneral && !props.generalConfigCollapsed && (
              <button
                ref={configToggleRef}
                type="button"
                className="general-config-fold"
                aria-label="收起创作配置"
                aria-expanded="true"
                aria-controls="creation-settings-body"
                onClick={props.onToggleGeneralConfig}
              >
                <ChevronDown size={16} aria-hidden="true" />
                收起
              </button>
            )}
            {isGeneral && (
              <GenerateBar
                modelId={props.endpointId}
                title={title}
                expectedCount={expectedCount}
                aspectRatio={aspectRatio}
                resolution={resolution}
                notice={null}
                isSubmitting={isSubmitting}
                isGenerating={isGenerating}
                aiEnabled={aiEnabled}
                onSubmit={onSubmit}
              />
            )}
          </div>
          {isGeneral && notice && (
            <p className={`form-notice ${notice.kind}`} role="status">
              {notice.message}
            </p>
          )}
        </div>
      </div>
      {!isGeneral && (
        <GenerateBar
          modelId={props.endpointId}
          title={title}
          expectedCount={expectedCount}
          aspectRatio={aspectRatio}
          resolution={resolution}
          notice={notice}
          isSubmitting={isSubmitting}
          isGenerating={isGenerating}
          aiEnabled={aiEnabled}
          onSubmit={onSubmit}
        />
      )}
    </aside>
  )
}
