const adminResources = new Set([
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
const frontendResources = new Set([
  'account',
  'assets',
  'projects',
  'library',
  'personal',
  'prompts',
  'generation',
  'clothing',
])

/** Request helpers accept resource paths, never URLs or paths from the other account realm. */
export function assertRequestScope(path: string, scope: 'frontend' | 'admin') {
  const segments = path.split('?')[0]!.split('/')
  const roots = scope === 'admin' ? adminResources : frontendResources
  let valid = roots.has(segments[0] ?? '')
  try {
    valid &&= segments.every((segment) => {
      const decoded = decodeURIComponent(segment)
      return decoded !== '.' && decoded !== '..' && !/[\\/#]/.test(decoded)
    })
  } catch {
    valid = false
  }
  if (!valid)
    throw new Error(scope === 'admin' ? '后台请求不能访问前台接口' : '前台请求不能访问后台配置接口')
}
