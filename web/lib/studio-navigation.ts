export type StudioQuery = Pick<URLSearchParams, 'get'>

/** Keep project ownership across tools without replaying the source URL's handoffs. */
export function preserveStudioProject(target: string, source?: StudioQuery | null): string {
  const projectId = source?.get('projectId')?.trim()
  if (!projectId) return target
  const url = new URL(target, 'https://istudio.local')
  if (url.origin !== 'https://istudio.local' || url.searchParams.has('projectId')) return target
  url.searchParams.set('projectId', projectId)
  return `${url.pathname}${url.search}${url.hash}`
}

export function studioToolUrl(
  mode: 'general' | 'commerce',
  task = 'product-main',
  source?: StudioQuery | null,
): string {
  const query = new URLSearchParams({ mode })
  if (mode === 'commerce') query.set('task', task)
  return preserveStudioProject(`/studio?${query}`, source)
}

/** Preserve actionable links from when / rendered the workbench, without redirecting marketing queries. */
export function legacyStudioQuery(params: Record<string, string | string[] | undefined>) {
  const keys = [
    'mode',
    'task',
    'view',
    'prompt',
    'model',
    'aspectRatio',
    'resolution',
    'count',
    'resumeTask',
    'referenceAsset',
    'reversePrompt',
    'collectionId',
    'collectionHandoff',
    'inspirationId',
    'tool',
  ]
  if (!keys.some((key) => params[key] !== undefined)) return null
  const query = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    for (const part of Array.isArray(value) ? value : value === undefined ? [] : [value])
      query.append(key, part)
  }
  return `/studio?${query}`
}
