/**
 * API 响应类型定义
 *
 * 定义所有 API 端点的请求和响应类型，提供完整的类型安全保障
 */

import type { GenerationInput } from './generation'

/**
 * API 响应基础结构
 *
 * 所有 API 响应都遵循这个基础结构
 */
export interface ApiResponse<T = unknown> {
  /** 响应状态码 */
  code: number
  /** 响应消息 */
  message: string
  /** 响应数据 */
  data: T
}

/**
 * API 错误响应
 */
export interface ApiError {
  code: number
  message: string
  details?: unknown
}

// ============================================================================
// 生成相关 API
// ============================================================================

/**
 * 创建生成任务请求
 */
export interface CreateGenerationTaskRequest {
  input: GenerationInput
}

/**
 * 创建生成任务响应
 */
export interface CreateGenerationTaskResponse {
  /** 任务 ID */
  taskId: string
  /** 预计生成时间（秒） */
  estimatedTime: number
  /** 冻结的积分 */
  creditsHeld: number
  /** 任务状态 */
  status: 'queued' | 'processing'
}

/**
 * 查询生成任务响应
 */
export interface GetGenerationTaskResponse {
  /** 任务 ID */
  id: string
  /** 任务状态 */
  status: 'queued' | 'processing' | 'waiting_provider' | 'succeeded' | 'failed' | 'cancelled' | 'expired'
  /** 生成输入参数 */
  input?: GenerationInput
  /** 生成结果图片路径 */
  resultImages?: string[]
  /** 结果详情 */
  resultDetails?: Array<{
    contentPath: string
    width: number
    height: number
    sizeBytes: number
    elapsedMs: number | null
  }>
  /** 结果模块标识（custom 模块化生成时） */
  resultModules?: string[]
  /** 错误消息 */
  errorMessage?: string
  /** 创建时间 */
  createdAt?: string
  /** 完成时间 */
  completedAt?: string
}

/**
 * 重做图片请求
 */
export interface RedoImageRequest {
  /** 源资产 ID */
  assetId: string
  /** 修改要求 */
  requirements: string
}

/**
 * 重做图片响应
 */
export type RedoImageResponse = CreateGenerationTaskResponse

// ============================================================================
// 资产相关 API
// ============================================================================

/**
 * 上传资产响应
 */
export interface UploadAssetResponse {
  /** 资产 ID */
  assetId: string
  /** 资产路径 */
  path: string
  /** 文件大小（字节） */
  size: number
  /** 图片尺寸 */
  dimensions?: {
    width: number
    height: number
  }
}

/**
 * 资产列表项
 */
export interface AssetListItem {
  /** 资产 ID */
  id: string
  /** 资产路径 */
  path: string
  /** 文件名 */
  filename: string
  /** 文件大小（字节） */
  size: number
  /** MIME 类型 */
  mimeType: string
  /** 创建时间 */
  createdAt: string
  /** 图片尺寸 */
  dimensions?: {
    width: number
    height: number
  }
}

/**
 * 获取资产列表响应
 */
export interface GetAssetsResponse {
  /** 资产列表 */
  assets: AssetListItem[]
  /** 总数 */
  total: number
  /** 分页偏移 */
  offset: number
  /** 分页限制 */
  limit: number
}

// ============================================================================
// 账户相关 API
// ============================================================================

/**
 * 用户信息
 */
export interface UserInfo {
  /** 用户 ID */
  id: string
  /** 用户名 */
  username: string
  /** 角色 */
  role: 'user' | 'admin'
  /** 创建时间 */
  createdAt: string
}

/**
 * 账户余额信息
 */
export interface AccountBalance {
  /** 可用积分 */
  available: number
  /** 冻结积分（生成中） */
  held: number
  /** 总积分 */
  total: number
}

/**
 * 获取账户信息响应
 */
export interface GetAccountResponse {
  /** 用户信息 */
  user: UserInfo
  /** 余额信息 */
  balance: AccountBalance
}

// ============================================================================
// 模型相关 API
// ============================================================================

/**
 * 图片模型信息
 */
export interface ImageModel {
  /** 模型 ID */
  id: string
  /** 模型名称 */
  name: string
  /** 模型提供商 */
  provider: string
  /** 是否可用 */
  enabled: boolean
  /** 单价（积分/张） */
  unitPrice: number
  /** 支持的功能 */
  capabilities: {
    textToImage: boolean
    imageToImage: boolean
    inpainting: boolean
    outpainting: boolean
  }
  /** 支持的分辨率 */
  resolutions: string[]
  /** 支持的宽高比 */
  aspectRatios: string[]
}

/**
 * 获取模型列表响应
 */
export interface GetModelsResponse {
  /** 模型列表 */
  models: ImageModel[]
}

// ============================================================================
// 费用相关 API
// ============================================================================

/**
 * 生成费用报价
 */
export interface GenerationQuote {
  /** 预估单价（积分/张） */
  unitPrice: number
  /** 生成数量 */
  count: number
  /** 预估总价 */
  totalPrice: number
  /** 模型 ID */
  modelId: string
}

/**
 * 获取生成费用报价响应
 */
export type GetQuoteResponse = GenerationQuote

// ============================================================================
// 提示词相关 API
// ============================================================================

/**
 * 优化提示词请求
 */
export interface EnhancePromptRequest {
  /** 原始提示词 */
  prompt: string
  /** 目标语言 */
  language?: string
}

/**
 * 优化提示词响应
 */
export interface EnhancePromptResponse {
  /** 优化后的提示词 */
  enhanced: string
  /** 原始提示词 */
  original: string
}

/**
 * 格式化提示词请求
 */
export interface FormatPromptRequest {
  /** 原始文本 */
  text: string
  /** 风格 */
  style?: string
}

/**
 * 格式化提示词响应
 */
export interface FormatPromptResponse {
  /** 格式化后的提示词 */
  formatted: string
}

// ============================================================================
// 类型工具
// ============================================================================

/**
 * 从 ApiResponse 中提取数据类型
 *
 * @example
 * ```ts
 * type TaskData = ExtractData<ApiResponse<CreateGenerationTaskResponse>>
 * // TaskData = CreateGenerationTaskResponse
 * ```
 */
export type ExtractData<T> = T extends ApiResponse<infer D> ? D : never

/**
 * 分页请求参数
 */
export interface PaginationParams {
  /** 偏移量 */
  offset?: number
  /** 每页数量 */
  limit?: number
}

/**
 * 分页响应结构
 */
export interface PaginatedResponse<T> {
  /** 数据列表 */
  items: T[]
  /** 总数 */
  total: number
  /** 当前偏移 */
  offset: number
  /** 每页数量 */
  limit: number
  /** 是否有下一页 */
  hasMore: boolean
}
