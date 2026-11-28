'use client'

import Link from 'next/link'
import { usePathname, useSearchParams } from 'next/navigation'
import { Suspense, useRef, type ComponentProps } from 'react'
import { prepareGuestDraftLogin } from '@/lib/creation-drafts'
import { useActionConfirmation } from './use-action-confirmation'

type LoginLinkProps = Omit<ComponentProps<typeof Link>, 'href'> & { returnTo?: string }

function DraftLoginLink({
  next,
  onClick,
  ...props
}: Omit<LoginLinkProps, 'returnTo'> & { next: string }) {
  const replaying = useRef(false)
  const { ask, confirmation } = useActionConfirmation()
  const href = `/login?next=${encodeURIComponent(next)}`
  return (
    <>
      <Link
        {...props}
        href={href}
        onClick={(event) => {
          if (replaying.current) {
            replaying.current = false
            // Dialog callers may unmount this link; run their close callback only
            // when Link can continue navigation in the same click dispatch.
            onClick?.(event)
            return
          }
          if (
            event.defaultPrevented ||
            event.metaKey ||
            event.ctrlKey ||
            event.shiftKey ||
            event.altKey ||
            event.button !== 0 ||
            props.target === '_blank'
          ) {
            onClick?.(event)
            return
          }
          event.preventDefault()
          const anchor = event.currentTarget
          void (async () => {
            try {
              await prepareGuestDraftLogin(next)
            } catch {
              const proceed = await ask({
                title: '草稿尚未保存',
                description:
                  '本地草稿保存失败，继续登录可能丢失当前描述和素材。可以取消并重试保存。',
                confirmLabel: '仍然登录',
                intent: 'warning',
              })
              if (!proceed) return
            }
            if (anchor.isConnected) {
              replaying.current = true
              anchor.click()
            }
          })()
        }}
      />
      {confirmation}
    </>
  )
}

function CurrentPageLoginLink(props: Omit<LoginLinkProps, 'returnTo'>) {
  const pathname = usePathname() ?? '/home'
  const search = useSearchParams()?.toString()
  const next = pathname + (search ? `?${search}` : '')
  return <DraftLoginLink {...props} next={next} />
}

export function LoginLink({ returnTo, ...props }: LoginLinkProps) {
  if (returnTo) return <DraftLoginLink {...props} next={returnTo} />
  return (
    <Suspense fallback={<Link {...props} href="/login?next=%2Fhome" />}>
      <CurrentPageLoginLink {...props} />
    </Suspense>
  )
}
