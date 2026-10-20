import type { Metadata, MetadataRoute } from 'next'

type SeoEnvironment = Record<string, string | undefined>

/** Indexing is opt-in: a production build alone can also be a local/preview build. */
export function getSeoEnvironment(env: SeoEnvironment = process.env) {
  let origin: string | undefined
  try {
    const url = new URL(env.NEXT_PUBLIC_SITE_URL || '')
    const host = url.hostname.toLowerCase()
    const reserved =
      /(^|\.)(localhost|local|test|invalid|example|example\.com|example\.org|example\.net|your-domain\.com)$/.test(
        host,
      )
    const privateHost =
      /^(127\.|10\.|0\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.)/.test(host) ||
      host.includes(':')
    if (
      url.protocol === 'https:' &&
      !url.username &&
      !url.password &&
      !url.port &&
      url.pathname === '/' &&
      !url.search &&
      !url.hash &&
      host.includes('.') &&
      !reserved &&
      !privateHost
    )
      origin = url.origin
  } catch {
    // Missing/invalid deployment configuration must never produce a made-up canonical.
  }
  const indexable = Boolean(
    origin &&
      env.NODE_ENV === 'production' &&
      env.SITE_ENV === 'production' &&
      (!env.VERCEL_ENV || env.VERCEL_ENV === 'production') &&
      (!env.CONTEXT || env.CONTEXT === 'production'),
  )
  return { indexable, origin: indexable ? origin : undefined }
}

export const privateRobots: Metadata['robots'] = { index: false, follow: false }

export function marketingMetadata({
  title,
  description,
  path,
  name,
}: {
  title: string
  description: string
  path: string
  name: string
}): Metadata {
  const { indexable, origin } = getSeoEnvironment()
  const url = origin ? new URL(path, origin).href : undefined
  const images = origin
    ? [
        {
          url: `${origin}/images/marketing/share.png`,
          width: 1200,
          height: 630,
          alt: `${name} AI 图片创作平台`,
        },
      ]
    : undefined
  return {
    title: { absolute: `${title} | ${name}` },
    description,
    alternates: url ? { canonical: url } : undefined,
    robots: { index: indexable, follow: indexable },
    openGraph: {
      title: `${title} | ${name}`,
      description,
      type: 'website',
      locale: 'zh_CN',
      siteName: name,
      ...(url ? { url } : {}),
      ...(images ? { images } : {}),
    },
    twitter: {
      card: 'summary_large_image',
      title: `${title} | ${name}`,
      description,
      ...(images ? { images } : {}),
    },
  }
}

export function marketingSitemap(paths: readonly string[]): MetadataRoute.Sitemap {
  const { origin } = getSeoEnvironment()
  return origin
    ? paths.map((path) => ({
        url: new URL(path, origin).href,
        changeFrequency: 'monthly',
        priority: path === '/' ? 1 : 0.8,
      }))
    : []
}

export function siteStructuredData(name: string) {
  const { origin } = getSeoEnvironment()
  // URL-bearing structured data only describes a configured public production site.
  return origin
    ? {
        '@context': 'https://schema.org',
        '@graph': [
          { '@type': 'Organization', '@id': `${origin}/#organization`, name, url: origin },
          {
            '@type': 'WebSite',
            '@id': `${origin}/#website`,
            name,
            url: origin,
            inLanguage: 'zh-CN',
            publisher: { '@id': `${origin}/#organization` },
          },
        ],
      }
    : null
}

export function serializeJsonLd(value: unknown) {
  return JSON.stringify(value).replace(/</g, '\\u003c')
}
