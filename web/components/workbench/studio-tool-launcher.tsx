'use client'

import { useEffect, useRef } from 'react'
import { useSearchParams } from 'next/navigation'
import { usePromptReverse } from '@/components/prompt-reverse-provider'

/** A real entry into the existing dialog, including its existing login boundary. */
export function StudioToolLauncher() {
  const search = useSearchParams()
  const { openReverse } = usePromptReverse()
  const tool = search.get('tool')
  const opened = useRef(false)
  useEffect(() => {
    if (tool !== 'image-to-prompt') {
      opened.current = false
      return
    }
    if (!opened.current) {
      opened.current = true
      openReverse()
    }
  }, [tool, openReverse])
  return null
}
