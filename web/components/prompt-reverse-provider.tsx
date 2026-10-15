'use client'

import dynamic from 'next/dynamic'
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'
import { ScanText } from 'lucide-react'
import type { ReverseOpenOptions } from '@/lib/prompt-reverse'

const PromptReverseDialog = dynamic(
  () => import('./prompt-reverse-dialog').then((module) => module.PromptReverseDialog),
  { ssr: false },
)
const ReverseContext = createContext({ openReverse: (_options?: ReverseOpenOptions) => {} })

export function PromptReverseProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false)
  const [request, setRequest] = useState<(ReverseOpenOptions & { revision: number }) | null>(null)
  const openReverse = useCallback((options: ReverseOpenOptions = {}) => {
    setRequest({ ...options, revision: Date.now() })
    setOpen(true)
  }, [])
  const context = useMemo(() => ({ openReverse }), [openReverse])
  return (
    <ReverseContext.Provider value={context}>
      {children}
      {request && (
        <PromptReverseDialog open={open} request={request} onClose={() => setOpen(false)} />
      )}
    </ReverseContext.Provider>
  )
}
export const usePromptReverse = () => useContext(ReverseContext)
export function PromptReverseButton({
  className = 'studio-secondary',
  options,
  label = '图片反推',
}: {
  className?: string
  options?: ReverseOpenOptions
  label?: string
}) {
  const { openReverse } = usePromptReverse()
  return (
    <button type="button" className={className} onClick={() => openReverse(options)}>
      <ScanText size={16} aria-hidden="true" />
      {label}
    </button>
  )
}
