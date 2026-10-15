import { appendCreationImages, type CreationImage } from '@/lib/creation-images'
import { apiBaseUrl, getAccessToken, readApiError } from './api'
import {
  clothingShotSchema,
  type ClothingMode,
  type ClothingPlan,
  type ClothingStyle,
} from './contracts'

export const clothingProductModules = [
  ['clothing-front', '正面精修', '干净背景，完整展示正面'],
  ['clothing-back', '背面精修', '展示背面结构与细节'],
  ['clothing-3d', '立体展示', '白底静态立体效果图'],
  ['clothing-mannequin', '人台展示', '展示衣服版型与垂坠'],
  ['clothing-detail', '细节特写', '面料纹理、领口与工艺'],
  ['clothing-selling', '卖点图', '围绕已知特点进行展示'],
] as const
export const clothingStyles = [
  ['studio', '摄影棚'],
  ['natural', '自然生活'],
  ['street', '街拍'],
  ['editorial', '品牌画报'],
] as const
export const defaultClothingCounts = { 'clothing-front': 1, 'clothing-3d': 1, 'clothing-detail': 1 }

export interface ClothingPlanDefaults {
  modules: Record<string, string>
  poses: string[]
  footer: string
}

export function makeClothingPlan(
  mode: ClothingMode,
  counts: Record<string, number>,
  requirements: string,
  defaults?: ClothingPlanDefaults,
): ClothingPlan {
  const shots: ClothingPlan['shots'] = []
  const modelDirections = [
    '正面自然站姿，完整展示所选服装，取景与模特照片可见范围匹配',
    '侧面站姿，展示服装廓形与垂坠',
    '自然行走姿态，服装清晰完整',
    '场景全身照，保持同一模特与穿搭',
  ]
  for (const key of [...clothingProductModules.map(([value]) => value), 'clothing-model']) {
    const count = counts[key] ?? 0
    const module = clothingProductModules.find(([value]) => value === key)
    for (let index = 0; index < count; index++) {
      const direction = defaults ? defaults.modules[key] : mode === 'model' ? '' : module?.[2]
      const pose = mode === 'model' ? (defaults?.poses[index] ?? modelDirections[index]) : ''
      const footer = defaults?.footer ?? '保留原图服装颜色、款式、印花与 Logo，采用统一光线与背景。'
      const description = [
        direction,
        pose,
        requirements.trim() ? '结合已填写的补充需求' : '',
        footer,
      ]
        .filter(Boolean)
        .join('。')
        .slice(0, 2000)
      shots.push({
        id: `${key}-${index + 1}`,
        moduleKey: key as ClothingPlan['shots'][number]['moduleKey'],
        label: `${mode === 'model' ? '模特上身' : (module?.[1] ?? '服装图')} ${index + 1}`,
        description,
      })
    }
  }
  return {
    summary:
      mode === 'model'
        ? '以服装原图和上传模特为依据，保持同一人物、服装与拍摄风格。'
        : '以同一件服装的多角度原图为依据，按所选图种生成独立成片。',
    warnings:
      mode === 'product' && counts['clothing-back']
        ? ['背面图请提供背面参考；不可见结构可能需要推测，请核对规划。']
        : [],
    shots,
  }
}

export interface ClothingAnalysisInput {
  mode: ClothingMode
  style: ClothingStyle
  counts: Record<string, number>
  requirements: string
  aspectRatio: string
  platform: string
  outputLanguage: string
  garmentFiles: CreationImage[]
  modelFiles: CreationImage[]
  sceneFiles: CreationImage[]
}
export async function analyzeClothing(
  input: ClothingAnalysisInput,
  signal: AbortSignal,
): Promise<ClothingPlan> {
  const body = new FormData()
  body.append('clothingMode', input.mode)
  body.append('clothingStyle', input.style)
  body.append('moduleCounts', JSON.stringify(input.counts))
  body.append('requirements', input.requirements)
  body.append('aspectRatio', input.aspectRatio)
  body.append('platform', input.platform)
  body.append('outputLanguage', input.outputLanguage)
  appendCreationImages(body, 'garmentImages', input.garmentFiles)
  if (input.mode === 'model') {
    appendCreationImages(body, 'modelImage', input.modelFiles)
    appendCreationImages(body, 'sceneImage', input.sceneFiles)
  }
  const response = await fetch(`${apiBaseUrl}/v1/clothing/plan`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${getAccessToken()}` },
    body,
    signal,
  })
  if (!response.ok)
    throw new Error(await readApiError(response, '服装分析失败，请重试或使用手动规划'))
  const plan = (await response.json()) as ClothingPlan
  const expected = makeClothingPlan(input.mode, input.counts, input.requirements)
  if (
    !Array.isArray(plan.shots) ||
    plan.shots.length !== expected.shots.length ||
    plan.shots.some((shot, index) => {
      const expectedShot = expected.shots[index]
      return (
        !expectedShot ||
        !clothingShotSchema.safeParse(shot).success ||
        shot.id !== expectedShot.id ||
        shot.moduleKey !== expectedShot.moduleKey
      )
    })
  )
    throw new Error('AI 返回的规划与所选图种不一致，请使用手动规划或重试')
  return {
    summary: typeof plan.summary === 'string' ? plan.summary : '',
    warnings: Array.isArray(plan.warnings)
      ? plan.warnings.filter((value) => typeof value === 'string')
      : [],
    shots: plan.shots,
  }
}
