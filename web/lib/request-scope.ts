const frontendResources = new Set([
  'feedback',
  'account',
  'assets',
  'projects',
  'library',
  'personal',
  'prompts',
  'generation',
  'clothing',
  'commerce',
])

/** Request helpers accept resource paths, never URLs or paths from the other account realm. */
export function assertRequestScope(path: string) {
  const segments = path.split('?')[0]!.split('/')
  let valid = frontendResources.has(segments[0] ?? '')
  try {
    valid &&= segments.every((segment) => {
      const decoded = decodeURIComponent(segment)
      return decoded !== '.' && decoded !== '..' && !/[\\/#]/.test(decoded)
    })
  } catch {
    valid = false
  }
  if (!valid) throw new Error('前台请求不能访问后台配置接口')
}
