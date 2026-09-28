'use client'

import { X } from 'lucide-react'

import type { GenerationModel } from '@/lib/contracts'

import type { CommerceTaskType } from '@/lib/contracts'

import { AdvancedSettings } from './advanced-settings'
import { BasicSettings } from './basic-settings'
import { GenerateBar } from './generate-bar'
import { ProductPlatformSelector } from './product-platform-selector'
import { PromptEditor } from './prompt-editor'
import { ReferenceUploader } from './reference-uploader'
import {
  buildEnhancedPrompt,
  buildRequirementDraft,
  optionLabel,
  promptQuickTags,
  referenceLimit,
  requirementFields,
  appendRequirementField,
  modelOptions,
  togglePromptTag,
  type GeneralStyle,
  type ModuleMode,
  type ReferenceStrength,
  type WorkbenchMode,
} from './shared'
import type { GenerationNotice } from './use-generation-task'

interface CreatorSidebarProps {
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
  expectedCount: number
  aiEnabled: boolean | null
  notice: GenerationNotice | null
  isSubmitting: boolean
  isGenerating: boolean
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
  onCloseSheet: () => void
  onSubmit: () => void
}

const ASSET_LABELS: Record<CommerceTaskType, string> = {
  'product-main': '产品素材',
  'detail-page': '产品素材',
  'viral-recreate': '商品原图',
  'product-retouch': '商品原图',
}

/**
 * 左侧创作控制区：
 * 默认只露出「素材 → 描述 → 风格比例」这三步，其余参数收进高级设置，
 * 生成按钮固定在面板底部，不随滚动消失。
 */
export function CreatorSidebar(props: CreatorSidebarProps) {
  const {
    mode, task, title, requirementsPlaceholder,
    productFiles, referenceFiles, prompt, requirements,
    platform, outputLanguage, style, referenceStrength,
    moduleMode, moduleCounts, recreateStrength, enhancements,
    count, model, aspectRatio, resolution, expectedCount,
    aiEnabled, notice, isSubmitting, isGenerating,
    onSetProductFiles, onSetReferenceFiles, onSetPrompt, onSetRequirements,
    onSetPlatform, onSetOutputLanguage, onSetStyle, onSetReferenceStrength,
    onSetModuleMode, onSetModuleCounts, onSetRecreateStrength, onSetEnhancements,
    onSetCount, onSetModel, onSetAspectRatio, onSetResolution,
    onCloseSheet, onSubmit,
  } = props

  const isGeneral = mode === 'general'
  const assetLabel = isGeneral ? '参考图片' : ASSET_LABELS[task]
  const assetFiles = isGeneral ? referenceFiles : productFiles
  const maxFiles = referenceLimit(mode, task)
  const needsSingleReference = !isGeneral && task === 'viral-recreate'

  const moduleTotal = Object.values(moduleCounts).reduce((total, value) => total + value, 0)
  const outputSummary = isGeneral
    ? `${count} 张`
    : task === 'product-main' || task === 'detail-page'
      ? moduleMode === 'custom' ? (moduleTotal > 0 ? `${moduleTotal} 张` : '未选模块') : '智能生成'
      : '1 张'

  const advancedSummary = [
    `${resolution}`,
    isGeneral ? `${count} 张` : outputSummary,
    optionLabel(modelOptions, model),
  ].join(' · ')

  const requirementsLabel = task === 'product-main' ? '主图需求' : task === 'detail-page' ? '详情图需求' : '补充要求'

  return (
    <aside className="configuration-panel creator-sidebar" aria-label="创作设置">
      <div className="configuration-scroll">
        <div className="creator-sheet-head">
          <span>创作设置</span>
          <button type="button" aria-label="收起创作设置" onClick={onCloseSheet}><X size={16} /></button>
        </div>

        <fieldset className="form-section config-card config-card-assets">
          <div className="field-heading">
            <legend>{assetLabel}</legend>
            <span>{isGeneral ? `最多 ${maxFiles} 张` : needsSingleReference ? '必须 1 张' : '至少 1 张'}</span>
          </div>
          <ReferenceUploader
            files={assetFiles}
            max={maxFiles}
            onChange={isGeneral ? onSetReferenceFiles : onSetProductFiles}
            labelFor={(index) => isGeneral ? `参考 ${index + 1}` : index === 0 ? '主图' : `素材 ${index + 1}`}
            emptyTitle={isGeneral ? '添加参考图片' : '上传商品原图'}
            emptyHint="拖拽或点击上传"
            acceptedHint={`JPG / PNG · 最多 ${maxFiles} 张`}
          />
        </fieldset>

        {needsSingleReference && (
          <fieldset className="form-section config-card config-card-assets">
            <div className="field-heading"><legend>参考图（爆款图）</legend><span>必须 1 张</span></div>
            <ReferenceUploader
              files={referenceFiles}
              max={1}
              onChange={onSetReferenceFiles}
              labelFor={() => '参考图'}
              emptyTitle="添加参考爆款图"
              emptyHint="拖拽或点击上传"
              acceptedHint="JPG / PNG · 仅 1 张"
            />
          </fieldset>
        )}

        {!isGeneral && (
          <fieldset className="form-section config-card">
            <div className="field-heading"><legend>目标平台</legend></div>
            <ProductPlatformSelector value={platform} onChange={onSetPlatform} />
          </fieldset>
        )}

        <fieldset className="form-section config-card config-card-prompt">
          <div className="field-heading"><legend>{isGeneral ? '画面描述' : requirementsLabel}</legend></div>
          {isGeneral ? (
            <PromptEditor
              value={prompt}
              onChange={onSetPrompt}
              ariaLabel="画面描述"
              placeholder="例如：一支绿色保温杯放在森林岩石上，清晨阳光从树叶之间洒下来，高级户外产品摄影。"
              enhance={(value) => buildEnhancedPrompt(value, style)}
              quickTags={promptQuickTags}
              onToggleTag={(tag) => onSetPrompt(togglePromptTag(prompt, tag))}
              helper="本地结构化整理（未接入模型）"
            />
          ) : (
            <PromptEditor
              value={requirements}
              onChange={onSetRequirements}
              ariaLabel={requirementsLabel}
              placeholder={requirementsPlaceholder}
              enhance={buildRequirementDraft}
              enhanceLabel="AI 帮写"
              fieldHints={requirementFields}
              onInsertField={(field) => onSetRequirements(appendRequirementField(requirements, field))}
            />
          )}
        </fieldset>

        <BasicSettings
          mode={mode}
          style={style}
          aspectRatio={aspectRatio}
          outputSummary={outputSummary}
          onSetStyle={onSetStyle}
          onSetAspectRatio={onSetAspectRatio}
        />

        <AdvancedSettings
          mode={mode}
          task={task}
          referenceStrength={referenceStrength}
          resolution={resolution}
          count={count}
          model={model}
          outputLanguage={outputLanguage}
          moduleMode={moduleMode}
          moduleCounts={moduleCounts}
          recreateStrength={recreateStrength}
          enhancements={enhancements}
          summary={advancedSummary}
          onSetReferenceStrength={onSetReferenceStrength}
          onSetResolution={onSetResolution}
          onSetCount={onSetCount}
          onSetModel={onSetModel}
          onSetOutputLanguage={onSetOutputLanguage}
          onSetModuleMode={onSetModuleMode}
          onSetModuleCounts={onSetModuleCounts}
          onSetRecreateStrength={onSetRecreateStrength}
          onSetEnhancements={onSetEnhancements}
        />
      </div>

      <GenerateBar
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
    </aside>
  )
}
