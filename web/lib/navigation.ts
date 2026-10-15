const defaultReturnPath = '/workbench?mode=general'

/** 登录只返回本站路径；反斜杠、换行等不能绕过同源限制。 */
export function safeReturnPath(value: string | null): string {
  if (!value?.startsWith('/')) return defaultReturnPath
  try {
    const origin = 'https://istudio.local'
    const target = new URL(value, origin)
    return target.origin === origin
      ? `${target.pathname}${target.search}${target.hash}`
      : defaultReturnPath
  } catch {
    return defaultReturnPath
  }
}
