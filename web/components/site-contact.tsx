'use client'

import { siteLogoUrl } from '@/lib/site-settings'
import { useSiteBranding } from './site-branding-provider'

export function SiteContact() {
  const { branding } = useSiteBranding()
  const text = branding.contactMode === 'text' ? branding.contactText?.trim() : ''
  const qr = branding.contactMode === 'qrcode' ? branding.contactQrPath : ''
  if (!text && !qr) return null
  return (
    <section id="contact" className="ops-card site-contact" aria-labelledby="site-contact-title">
      <div className="ops-card-heading">
        <h2 id="site-contact-title">联系我们</h2>
      </div>
      <div className="site-contact-content">
        {text && <p className="site-contact-text">{text}</p>}
        {qr && (
          <img
            className="site-contact-qr"
            src={siteLogoUrl(qr)}
            alt="联系网站管理员的二维码"
            width={208}
            height={208}
          />
        )}
      </div>
    </section>
  )
}
