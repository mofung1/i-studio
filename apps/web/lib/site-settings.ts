import { apiBaseUrl, getAccessToken, readApiError } from './api'

export interface SiteBranding {
  name: string
  logoPath: string
}

export const defaultSiteBranding: SiteBranding = { name: 'iStudio', logoPath: '' }
export const siteTitle = (name: string) => `${name} - 个人 AI 创作工作台`
export const siteLogoUrl = (logoPath: string) => logoPath ? `${apiBaseUrl}${logoPath}` : ''

export async function readSiteBranding(signal?: AbortSignal): Promise<SiteBranding> {
  const response = await fetch(`${apiBaseUrl}/v1/site-settings`, { cache: 'no-store', signal })
  if (!response.ok) throw new Error(await readApiError(response, '网站配置读取失败'))
  return response.json() as Promise<SiteBranding>
}

export async function saveSiteBranding(name: string, logo: File | null, removeLogo: boolean): Promise<SiteBranding> {
  const body = new FormData()
  body.append('name', name.trim())
  if (logo) body.append('logo', logo)
  body.append('removeLogo', String(removeLogo))
  const response = await fetch(`${apiBaseUrl}/v1/site-settings`, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${getAccessToken()}` },
    body,
  })
  if (!response.ok) throw new Error(await readApiError(response, '网站配置保存失败'))
  return response.json() as Promise<SiteBranding>
}
