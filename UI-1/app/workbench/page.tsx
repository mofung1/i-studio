import { redirect } from 'next/navigation'

interface WorkbenchRedirectProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

/** 旧链接兼容：/workbench?… 直接落到工作台首页。 */
export default async function WorkbenchRedirect({ searchParams }: WorkbenchRedirectProps) {
  const params = await searchParams
  const query = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (typeof value === 'string') query.set(key, value)
  }
  const suffix = query.toString()
  redirect(suffix ? `/?${suffix}` : '/')
}
