import type { MetadataRoute } from 'next'
import { getSeoEnvironment } from '@/lib/seo'

export const dynamic = 'force-dynamic'
export default function robots(): MetadataRoute.Robots {
  const { origin } = getSeoEnvironment()
  if (!origin) return { rules: { userAgent: '*', disallow: '/' } }
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: [
        '/admin',
        '/api/',
        '/v1/',
        '/login',
        '/studio',
        '/workbench',
        '/account',
        '/assets',
        '/tasks',
        '/prompts',
        '/settings',
        '/inspire/manage',
        '/inspire/categories',
      ],
    },
    sitemap: `${origin}/sitemap.xml`,
  }
}
