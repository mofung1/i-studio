'use client'

import { createContext, useContext, useState, type ComponentProps, type ReactNode } from 'react'
import dynamic from 'next/dynamic'
import { MessageSquare } from 'lucide-react'
import { useAccount } from './account-provider'

const FeedbackDialog = dynamic(() => import('./feedback-dialog').then((m) => m.FeedbackDialog), {
  ssr: false,
})
const FeedbackContext = createContext<() => void>(() => {})

export function FeedbackProvider({ children }: { children: ReactNode }) {
  const [pagePath, setPagePath] = useState<string | null>(null)
  const { account } = useAccount()
  return (
    <FeedbackContext.Provider value={() => setPagePath(window.location.pathname)}>
      {children}
      {pagePath !== null && (
        <FeedbackDialog
          key={account.user?.id ?? 'guest'}
          pagePath={pagePath}
          onClose={() => setPagePath(null)}
        />
      )}
    </FeedbackContext.Provider>
  )
}

export function FeedbackButton({ onClick, ...props }: ComponentProps<'button'>) {
  const open = useContext(FeedbackContext)
  return (
    <button
      {...props}
      type="button"
      aria-label="意见反馈"
      title="意见反馈"
      onClick={(event) => {
        onClick?.(event)
        open()
      }}
    >
      <MessageSquare size={18} aria-hidden="true" />
      <span>意见反馈</span>
    </button>
  )
}
