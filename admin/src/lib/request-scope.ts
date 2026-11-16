const adminResources = new Set([
  'feedback',
  'inspiration-submissions',
  'inspiration-submission-settings',
  'overview',
  'monitoring',
  'models',
  'users',
  'settings',
  'storage',
  'tasks',
  'audit',
  'ai-endpoints',
  'image-measurements',
  'prompt-templates',
  'prompt-reverse-settings',
  'site-settings',
  'inspiration',
])
/** Request helpers accept resource paths, never URLs or paths from the other account realm. */
export function assertRequestScope(path: string) {
  const segments = path.split('?')[0]!.split('/')
  let valid = adminResources.has(segments[0] ?? '')
  try {
    valid &&= segments.every((segment) => {
      const decoded = decodeURIComponent(segment)
      return decoded !== '.' && decoded !== '..' && !/[\\/#]/.test(decoded)
    })
  } catch {
    valid = false
  }
  if (!valid)
    throw new Error('后台请求只能访问管理接口')
}
