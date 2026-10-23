import { adminFetch } from './admin'
import type { SiteBranding } from './site-settings'

export async function saveSiteBranding(
  name: string,
  logo: File | null,
  removeLogo: boolean,
  contact?: { mode: 'none' | 'text' | 'qrcode'; text: string; qr: File | null },
): Promise<SiteBranding> {
  const body = new FormData()
  body.append('name', name.trim())
  if (logo) body.append('logo', logo)
  body.append('removeLogo', String(removeLogo))
  if (contact) {
    body.append('contactMode', contact.mode)
    body.append('contactText', contact.mode === 'text' ? contact.text.trim() : '')
    if (contact.mode === 'qrcode' && contact.qr) body.append('contactQr', contact.qr)
  }
  const response = await adminFetch('site-settings', { method: 'PUT', body })
  return response.json() as Promise<SiteBranding>
}
