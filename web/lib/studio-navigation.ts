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
