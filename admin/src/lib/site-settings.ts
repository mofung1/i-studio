import { apiBaseUrl, readApiError } from './api'

export interface SiteBranding {
  name: string
  logoPath: string
  contactMode?: 'none' | 'text' | 'qrcode'
  contactText?: string
  contactQrPath?: string
}

export const defaultSiteBranding: SiteBranding = { name: 'iStudio', logoPath: '' }
export const siteTitle = (name: string) => `${name} - 个人 AI 创作工作台`
export const siteLogoUrl = (logoPath: string) => (logoPath ? `${apiBaseUrl}${logoPath}` : '')

export async function readSiteBranding(signal?: AbortSignal): Promise<SiteBranding> {
  const response = await fetch(`${apiBaseUrl}/v1/site-settings`, { cache: 'no-store', signal })
  if (!response.ok) throw new Error(await readApiError(response, '网站配置读取失败'))
  return response.json() as Promise<SiteBranding>
}
