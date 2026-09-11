export const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://127.0.0.1:4000'

export interface ApiErrorPayload {
  code?: string
  message?: string
}

export function getAccessToken() {
  return window.localStorage.getItem('istudio-access-token') ?? ''
}

export async function readApiError(response: Response, fallback: string) {
  try {
    const payload = await response.json() as ApiErrorPayload
    return payload.message ?? fallback
  } catch {
    return fallback
  }
}

export async function uploadAsset(file: File, token: string, projectId?: string) {
  const body = new FormData()
  body.append('file', file)
  if (projectId) body.append('projectId', projectId)

  const response = await fetch(`${apiBaseUrl}/v1/assets`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body,
  })
  if (!response.ok) throw new Error(await readApiError(response, '图片上传失败'))

  const payload = await response.json() as { asset?: { id?: string } }
  if (!payload.asset?.id) throw new Error('图片上传响应不完整')
  return payload.asset.id
}
