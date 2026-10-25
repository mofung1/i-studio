export interface FeedbackItem {
  id: string
  username: string
  content: string
  pagePath: string
  status: 'pending' | 'handled'
  imageCount: number
  createdAt: string
  handledAt: string | null
}
export interface FeedbackPage {
  feedback: FeedbackItem[]
  page: number
  pageSize: number
  total: number
  totalPages: number
}
export interface FeedbackDetail {
  feedback: FeedbackItem
  images: Array<{ path: string; position: number }>
}
export const feedbackImageTypes = ['image/jpeg', 'image/png', 'image/webp']
export const feedbackImageBytes = 5 * 1024 * 1024
export function feedbackFilesError(files: File[]) {
  if (files.length > 3) return '最多上传 3 张图片'
  if (files.some((file) => !feedbackImageTypes.includes(file.type)))
    return '仅支持 JPG、PNG、WebP 图片'
  if (files.some((file) => !file.size || file.size > feedbackImageBytes))
    return '每张图片不能超过 5MB，且不能为空'
  return ''
}
