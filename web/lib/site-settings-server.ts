import 'server-only'
import { cache } from 'react'
import { apiBaseUrl } from './api'
import { defaultSiteBranding, type SiteBranding } from './site-settings'

// Metadata and the root layout share one read per request. Docker uses its API hostname.
export const getSiteBranding = cache(async (): Promise<SiteBranding> => {
  try {
    const response = await fetch(
      `${process.env.API_INTERNAL_BASE_URL ?? apiBaseUrl}/v1/site-settings`,
      {
        cache: 'no-store',
        signal: AbortSignal.timeout(2000),
      },
    )
    if (response.ok) return (await response.json()) as SiteBranding
  } catch {
    /* The workbench remains available if the API is temporarily offline. */
  }
  return defaultSiteBranding
})
