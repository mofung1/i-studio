export const apiBaseUrl = ''

export interface ApiErrorPayload {
  code?: string
  message?: string
}

export function getAdminAccessToken() {
  return window.localStorage.getItem('istudio-admin-token') ?? ''
}

export async function readApiError(response: Response, fallback: string) {
  try {
    const payload = (await response.json()) as ApiErrorPayload
    return payload.message ?? fallback
  } catch {
    return fallback
  }
}
