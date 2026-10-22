export interface PublicImageModel {
  id: string
  name: string
  model: string
  isDefault?: boolean
  /** Older API deployments may omit capabilities; server validation remains authoritative. */
  capabilities?: {
    referenceImages: boolean
    aspectRatios: string[]
    resolutions: string[]
  }
}

export interface ImageModelParameters {
  aspectRatio: string
  resolution: string
  hasImages: boolean
  requiresImages?: boolean
}

export function modelCompatibilityIssue(
  model: PublicImageModel | undefined,
  parameters: ImageModelParameters,
) {
  const capabilities = model?.capabilities
  if (!capabilities) return ''
  const issues: string[] = []
  if (!capabilities.aspectRatios.includes(parameters.aspectRatio))
    issues.push(`比例 ${parameters.aspectRatio}`)
  if (!capabilities.resolutions.includes(parameters.resolution))
    issues.push(`清晰度 ${parameters.resolution}`)
  if (!capabilities.referenceImages && (parameters.hasImages || parameters.requiresImages))
    issues.push(parameters.requiresImages ? '此工具所需的图片输入' : '参考图片')
  return issues.length
    ? `当前模型不支持${issues.join('、')}。已保留原配置和素材，请调整参数或选择兼容模型。`
    : ''
}

export function compatibleImageParameters(
  model: PublicImageModel | undefined,
  parameters: Pick<ImageModelParameters, 'aspectRatio' | 'resolution'>,
) {
  const capabilities = model?.capabilities
  return {
    aspectRatio: capabilities?.aspectRatios.includes(parameters.aspectRatio)
      ? parameters.aspectRatio
      : (capabilities?.aspectRatios[0] ?? parameters.aspectRatio),
    resolution: capabilities?.resolutions.includes(parameters.resolution)
      ? parameters.resolution
      : (capabilities?.resolutions[0] ?? parameters.resolution),
  }
}
