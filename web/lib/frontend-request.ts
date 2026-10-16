import { apiBaseUrl, getAccessToken, readApiError } from './api'
import { assertRequestScope } from './request-scope'

export class FrontendRequestError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message)
  }
}

export async function frontendRequest<T>(
  path: string,
  options: RequestInit = {},
  fallback = '操作失败，请重试',
): Promise<T> {
  assertRequestScope(path, 'frontend')
  const token = getAccessToken()
  if (!token) throw new FrontendRequestError('请先登录', 401)
  const headers = new Headers(options.headers)
  headers.set('Authorization', `Bearer ${token}`)
  const response = await fetch(`${apiBaseUrl}/v1/${path}`, {
    ...options,
    cache: 'no-store',
    headers,
  })
  if (!response.ok)
    throw new FrontendRequestError(await readApiError(response, fallback), response.status)
  return response.json() as Promise<T>
}
