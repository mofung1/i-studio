'use client'

import { RefreshCw, Sparkles } from 'lucide-react'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/select'
import type { CommerceTaskType } from '@/lib/contracts'
import type { PublicImageModel } from '@/lib/generation-models'
import { ImageParameters, ImageSizeFields } from './image-parameters'
import { ModelGuidance } from './model-guidance'
import { ProductPlatformSelector } from './product-platform-selector'
import {
  generalCountOptions,
  languageOptions,
  styleOptions,
  type GeneralStyle,
  type ReferenceStrength,
  type WorkbenchMode,
} from './shared'

interface BasicSettingsProps {
  mode: WorkbenchMode
  task: CommerceTaskType
  aspectRatio: string
  resolution: string
  count: number
  imageEndpoints: PublicImageModel[]
  modelsLoading?: boolean
  modelsError?: string
  onReloadModels?: () => void
  endpointId: string
  onSetEndpoint: (id: string) => void
  onSetResolution: (resolution: string) => void
  onSetCount: (count: number) => void
  outputSummary: string
  platform: string
  onSetPlatform: (platform: string) => void
  outputLanguage: string
  onSetOutputLanguage: (language: string) => void
  onSetAspectRatio: (ratio: string) => void
  style: GeneralStyle
  referenceStrength: ReferenceStrength
  onSetStyle: (style: GeneralStyle) => void
  onSetReferenceStrength: (strength: ReferenceStrength) => void
}

export function BasicSettings(props: BasicSettingsProps) {
  const {
    mode,
    task,
    aspectRatio,
    resolution,
    count,
    imageEndpoints,
    endpointId,
    onSetEndpoint,
    onSetResolution,
    onSetCount,
    outputSummary,
    platform,
    onSetPlatform,
    outputLanguage,
    onSetOutputLanguage,
    onSetAspectRatio,
    style,
    referenceStrength,
    onSetStyle,
    onSetReferenceStrength,
    modelsLoading = false,
    modelsError = '',
    onReloadModels,
  } = props
  const isGeneral = mode === 'general'
  const selected = imageEndpoints.find((endpoint) => endpoint.id === endpointId)
  const modelPlaceholder = modelsLoading
    ? '正在读取模型…'
    : !imageEndpoints.length
      ? '暂无可用模型'
      : '请选择模型'

  return (
    <section className="basic-settings compact-basic-settings" aria-label="生成参数">
      <div className="compact-settings-row">
        <div className="settings-model-control">
          <span className="settings-control-label">生成模型</span>
          <Select
            value={selected?.id ?? ''}
            onValueChange={onSetEndpoint}
            disabled={modelsLoading || !imageEndpoints.length}
          >
            <SelectTrigger
              className="settings-chip settings-chip-model"
              aria-label={isGeneral ? '模型选择' : '生图模型'}
              title={selected?.name ?? modelPlaceholder}
            >
              <Sparkles size={14} aria-hidden="true" />
              <SelectValue placeholder={modelPlaceholder}>{selected?.name}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              {imageEndpoints.map((endpoint) => (
                <SelectItem key={endpoint.id} value={endpoint.id}>
                  {endpoint.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {onReloadModels && (modelsError || (!modelsLoading && !imageEndpoints.length)) && (
          <button
            type="button"
            className="settings-chip model-reload studio-secondary"
            aria-label="重新加载模型列表"
            title="重新加载模型列表"
            disabled={modelsLoading}
            onClick={onReloadModels}
          >
            <RefreshCw size={15} aria-hidden="true" />
            重新加载
          </button>
        )}
        <ImageParameters
          summary={`${aspectRatio} · ${resolution} · ${outputSummary}`}
          context={isGeneral ? mode : task}
        >
          {(portalContainer) => (
            <>
              {isGeneral && (
                <>
                  <label className="settings-field">
                    <span>创作风格</span>
                    <Select
                      value={style}
                      onValueChange={(value) => onSetStyle(value as GeneralStyle)}
                    >
                      <SelectTrigger aria-label="创作风格">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent portalContainer={portalContainer}>
                        {styleOptions.map(([value, label]) => (
                          <SelectItem key={value} value={value}>
                            {label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </label>
                  <label className="settings-field">
                    <span>参考强度</span>
                    <Select
                      value={referenceStrength}
                      onValueChange={(value) => onSetReferenceStrength(value as ReferenceStrength)}
                    >
                      <SelectTrigger aria-label="参考强度">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent portalContainer={portalContainer}>
                        <SelectItem value="low">低</SelectItem>
                        <SelectItem value="medium">中</SelectItem>
                        <SelectItem value="high">高</SelectItem>
                      </SelectContent>
                    </Select>
                  </label>
                </>
              )}
              <ImageSizeFields
                aspectRatio={aspectRatio}
                resolution={resolution}
                onSetAspectRatio={onSetAspectRatio}
                onSetResolution={onSetResolution}
                portalContainer={portalContainer}
                capabilities={selected?.capabilities}
              />
              {!isGeneral && (
                <label className="settings-field image-parameters-wide">
                  <span>目标平台</span>
                  <ProductPlatformSelector
                    value={platform}
                    onChange={onSetPlatform}
                    portalContainer={portalContainer}
                  />
                </label>
              )}
              {isGeneral ? (
                <label className="settings-field image-parameters-wide">
                  <span>生成数量</span>
                  <Select
                    value={String(count)}
                    onValueChange={(value) => onSetCount(Number(value))}
                  >
                    <SelectTrigger aria-label="生成数量">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent portalContainer={portalContainer}>
                      {generalCountOptions.map(([value, label]) => (
                        <SelectItem key={value} value={value}>
                          {label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </label>
              ) : (
                task !== 'product-retouch' && (
                  <label className="settings-field image-parameters-wide">
                    <span>目标语言</span>
                    <Select value={outputLanguage} onValueChange={onSetOutputLanguage}>
                      <SelectTrigger aria-label="目标语言">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent portalContainer={portalContainer}>
                        {languageOptions.map(([value, label]) => (
                          <SelectItem key={value} value={value} title={label}>
                            {label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </label>
                )
              )}
            </>
          )}
        </ImageParameters>
      </div>
      <ModelGuidance model={selected} />
      {!modelsLoading && (modelsError || !imageEndpoints.length) && (
        <p className="model-availability-note" role={modelsError ? 'alert' : 'status'}>
          {modelsError || '暂无可用生图模型，请联系网站管理员启用。'}
        </p>
      )}
    </section>
  )
}
