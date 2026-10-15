'use client'

import Link from 'next/link'
import { usePathname, useSearchParams } from 'next/navigation'
import { Suspense, type ComponentProps } from 'react'

type LoginLinkProps = Omit<ComponentProps<typeof Link>, 'href'> & { returnTo?: string }

function CurrentPageLoginLink(props: Omit<LoginLinkProps, 'returnTo'>) {
  const pathname = usePathname() ?? '/'
  const search = useSearchParams()?.toString()
  const next = pathname + (search ? `?${search}` : '')
  return <Link {...props} href={`/login?next=${encodeURIComponent(next)}`} />
}

export function LoginLink({ returnTo, ...props }: LoginLinkProps) {
  if (returnTo) return <Link {...props} href={`/login?next=${encodeURIComponent(returnTo)}`} />
  return (
    <Suspense fallback={<Link {...props} href="/login?next=%2F" />}>
      <CurrentPageLoginLink {...props} />
    </Suspense>
  )
}
