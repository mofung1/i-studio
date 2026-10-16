import { adminFetch } from './admin'
import type { SiteBranding } from './site-settings'

export async function saveSiteBranding(
  name: string,
  logo: File | null,
  removeLogo: boolean,
): Promise<SiteBranding> {
  const body = new FormData()
  body.append('name', name.trim())
  if (logo) body.append('logo', logo)
  body.append('removeLogo', String(removeLogo))
  const response = await adminFetch('site-settings', { method: 'PUT', body })
  return response.json() as Promise<SiteBranding>
}
