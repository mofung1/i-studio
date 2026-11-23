'use client'

import type { CreationImage } from '@/lib/creation-images'
import type { PublicImageModel } from '@/lib/generation-models'
import { ModelGuidance } from './model-guidance'

import { Shirt, Sparkles, UserRound } from 'lucide-react'
import { Fragment } from 'react'
import type { ClothingMode, ClothingShot, ClothingStyle } from '@/lib/contracts'
import noticeStyles from '../inspiration-template.module.css'
import { clothingProductModules, clothingStyles } from '@/lib/clothing'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/select'
import { ImageParameters, ImageSizeFields } from './image-parameters'
import { ReferenceUploader } from './reference-uploader'
import { ProductPlatformSelector } from './product-platform-selector'
import { languageOptions } from './shared'

export interface ClothingSettingsValue {
  mode: ClothingMode
  style: ClothingStyle
  counts: Record<string, number>
  modelCount: number
  shots?: ClothingShot[]
  garments: CreationImage[]
  models: CreationImage[]
  scenes: CreationImage[]
  requirements: string
  platform: string
  outputLanguage: string
  endpointId: string
  model: string
  aspectRatio: string
  resolution: string
}

export function ClothingSettings({
  value,
  onChange,
  endpoints,
  expectedCount,
  recipeTitle,
}: {
  value: ClothingSettingsValue
  onChange: (patch: Partial<ClothingSettingsValue>) => void
  endpoints: PublicImageModel[]
  expectedCount: number
  recipeTitle?: string
}) {
  const SettingsGroup = recipeTitle ? 'details' : Fragment
  const model = endpoints.find((endpoint) => endpoint.id === value.endpointId)
  const capabilities = model?.capabilities
  const referenceDisabledReason =
    capabilities?.referenceImages === false
      ? '服装工具需要图片输入，请选择支持参考图片的模型；已有素材仍会保留。'
      : undefined
  function count(key: string, amount: number) {
    const counts = { ...value.counts }
    if (Number.isFinite(amount) && amount > 0) counts[key] = Math.min(4, Math.floor(amount))
    else delete counts[key]
    onChange({ counts })
  }

  const generationSettings = (
    <section className="basic-settings compact-basic-settings" aria-label="生成参数">
      <div className="compact-settings-row">
        <div className="settings-model-control">
          <span className="settings-control-label">生成模型</span>
          <Select
            value={model?.id ?? ''}
            disabled={!endpoints.length}
            onValueChange={(id) => {
              const endpoint = endpoints.find((item) => item.id === id)
              if (endpoint) onChange({ endpointId: id, model: endpoint.model })
            }}
          >
            <SelectTrigger
              className="settings-chip settings-chip-model"
              aria-label="服装生图模型"
              title={model?.name}
            >
              <Sparkles size={14} aria-hidden="true" />
              <SelectValue placeholder={endpoints.length ? '请选择模型' : '暂无可用模型'}>
                {model?.name}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {endpoints.map((endpoint) => (
                <SelectItem key={endpoint.id} value={endpoint.id}>
                  {endpoint.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <ImageParameters
          context={recipeTitle ?? value.mode}
          summary={`${value.aspectRatio} · ${value.resolution} · ${expectedCount} 张`}
        >
          {(portalContainer) => (
            <>
              <label className="settings-field">
                <span>拍摄风格</span>
                <Select
                  value={value.style}
                  onValueChange={(style) => onChange({ style: style as ClothingStyle })}
                >
                  <SelectTrigger aria-label="拍摄风格">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent portalContainer={portalContainer}>
                    {clothingStyles.map(([key, label]) => (
                      <SelectItem key={key} value={key}>
                        {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </label>
              <label className="settings-field">
                <span>画面文字</span>
                <Select
                  value={value.outputLanguage}
                  onValueChange={(outputLanguage) => onChange({ outputLanguage })}
                >
                  <SelectTrigger aria-label="画面文字">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent portalContainer={portalContainer}>
                    {languageOptions.map(([key, label]) => (
                      <SelectItem key={key} value={key}>
                        {key === 'none' ? '不新增文字' : label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </label>
              <ImageSizeFields
                aspectRatio={value.aspectRatio}
                resolution={value.resolution}
                onSetAspectRatio={(aspectRatio) => onChange({ aspectRatio })}
                onSetResolution={(resolution) => onChange({ resolution })}
                capabilities={capabilities}
                portalContainer={portalContainer}
                ratioLabel="服装画面比例"
                resolutionLabel="服装清晰度"
              />
              <label className="settings-field">
                <span>目标平台</span>
                <ProductPlatformSelector
                  value={value.platform}
                  onChange={(platform) => onChange({ platform })}
                  portalContainer={portalContainer}
                />
              </label>
              {!recipeTitle && value.mode === 'model' && (
                <label className="settings-field">
                  <span>生成张数</span>
                  <Select
                    value={String(value.modelCount)}
                    onValueChange={(number) => onChange({ modelCount: Number(number) })}
                  >
                    <SelectTrigger aria-label="模特图片张数">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent portalContainer={portalContainer}>
                      {[1, 2, 3, 4].map((number) => (
                        <SelectItem key={number} value={String(number)}>
                          {number} 张
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </label>
              )}
            </>
          )}
        </ImageParameters>
      </div>
      <ModelGuidance model={model} />
    </section>
  )

  return (
    <>
      {recipeTitle ? (
        <section className={noticeStyles.notice} aria-label="同款套图配置">
          <strong>{recipeTitle}</strong>
          <p>{value.shots?.map((shot) => shot.label).join(' · ')}</p>
        </section>
      ) : (
        <div className="clothing-mode-selector" role="group" aria-label="服装创作模式">
          <button
            type="button"
            aria-pressed={value.mode === 'product'}
            onClick={() => onChange({ mode: 'product' })}
          >
            <Shirt size={16} aria-hidden="true" />
            商品组图
          </button>
          <button
            type="button"
            aria-pressed={value.mode === 'model'}
            onClick={() => onChange({ mode: 'model' })}
          >
            <UserRound size={16} aria-hidden="true" />
            模特上身
          </button>
        </div>
      )}
      <fieldset className="form-section config-card config-card-assets composer-media">
        <div className="field-heading">
          <legend>服装原图</legend>
          <span aria-live={recipeTitle ? 'polite' : undefined}>
            {recipeTitle && value.garments.length ? `已选 ${value.garments.length} 张` : '1–6 张'}
          </span>
        </div>
        <ReferenceUploader
          disabledReason={referenceDisabledReason}
          collapseAt={2}
          files={value.garments}
          max={6}
          onChange={(garments) => onChange({ garments })}
          labelFor={(index) => `服装 ${index + 1}`}
          emptyTitle="上传服装原图"
          emptyHint="拖入图片，或打开素材选择器"
          acceptedHint="JPG / PNG / WebP · 单张最多 10 MB"
        />
        {!recipeTitle && (
          <p className="clothing-field-help">
            {value.mode === 'product'
              ? '上传同一件服装的不同角度，建议包含正面、背面与细节。'
              : '上传同套搭配中的服装，模特将穿着这套搭配。'}
          </p>
        )}
      </fieldset>
      {recipeTitle && generationSettings}
      <SettingsGroup>
        {recipeTitle && <summary className="recipe-settings-summary">调整套图设置</summary>}
        {!recipeTitle && value.mode === 'model' && (
          <>
            <fieldset className="form-section config-card config-card-assets composer-media">
              <div className="field-heading">
                <legend>模特照片</legend>
                <span>必须 1 张</span>
              </div>
              <ReferenceUploader
                files={value.models}
                disabledReason={referenceDisabledReason}
                max={1}
                onChange={(models) => onChange({ models })}
                labelFor={() => '模特'}
                emptyTitle="上传模特照片"
                emptyHint="用于保持人物身份与体型"
                acceptedHint="JPG / PNG / WebP"
              />
              <p className="clothing-field-help">建议上传人物清晰、身体完整的照片。</p>
            </fieldset>
            <fieldset className="form-section config-card config-card-assets composer-media">
              <div className="field-heading">
                <legend>拍摄场景</legend>
                <span>可选 1 张</span>
              </div>
              <ReferenceUploader
                files={value.scenes}
                disabledReason={referenceDisabledReason}
                max={1}
                onChange={(scenes) => onChange({ scenes })}
                labelFor={() => '场景'}
                emptyTitle="上传场景参考"
                emptyHint="留空按拍摄风格安排背景"
                acceptedHint="只作为背景参考"
              />
            </fieldset>
          </>
        )}
        {recipeTitle ? (
          <fieldset className="form-section config-card">
            <legend>逐张拍摄要求</legend>
            {value.shots?.map((shot, index, shots) => (
              <label className="settings-field" key={shot.id}>
                <span>{shot.label}</span>
                <textarea
                  className="clothing-requirements"
                  rows={2}
                  maxLength={2000}
                  value={shot.description}
                  onChange={(event) =>
                    onChange({
                      shots: shots.map((item, i) =>
                        i === index ? { ...item, description: event.target.value } : item,
                      ),
                    })
                  }
                />
              </label>
            ))}
          </fieldset>
        ) : value.mode === 'product' ? (
          <fieldset className="form-section config-card clothing-output-settings">
            <div className="field-heading">
              <legend>选择图种</legend>
              <span>预计 {expectedCount} 张</span>
            </div>
            <div className="clothing-module-list">
              {clothingProductModules.map(([key, label, hint]) => (
                <div
                  className={`clothing-module${value.counts[key] ? ' is-selected' : ''}`}
                  key={key}
                >
                  <label>
                    <input
                      type="checkbox"
                      aria-label={`选择${label}`}
                      checked={!!value.counts[key]}
                      onChange={(event) => count(key, event.target.checked ? 1 : 0)}
                    />
                    <span>
                      <strong>{label}</strong>
                      <small>{hint}</small>
                    </span>
                  </label>
                  <input
                    type="number"
                    aria-label={`${label}张数`}
                    min={0}
                    max={4}
                    step={1}
                    value={value.counts[key] ?? 0}
                    onChange={(event) => count(key, Number(event.target.value))}
                  />
                </div>
              ))}
            </div>
            {expectedCount > 16 && (
              <p className="form-notice error" role="alert">
                一次最多生成 16 张，请减少张数。
              </p>
            )}
          </fieldset>
        ) : null}
        <fieldset className="form-section config-card">
          <div className="field-heading">
            <legend>拍摄要求</legend>
          </div>
          <label className="clothing-requirements-label" htmlFor="clothing-requirements">
            补充需求（可选）
          </label>
          <textarea
            id="clothing-requirements"
            className="clothing-requirements"
            maxLength={2000}
            rows={4}
            value={value.requirements}
            onChange={(event) => onChange({ requirements: event.target.value })}
            placeholder="例如：突出领口与袖口工艺、柔和自然光。面料成分与尺码请填写真实资料。"
          />
        </fieldset>
        {!recipeTitle && generationSettings}
      </SettingsGroup>
    </>
  )
}
