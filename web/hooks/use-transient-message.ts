'use client'

import { useCallback, useEffect, useState } from 'react'

export function useTransientMessage() {
  // Each action gets a new notice so identical messages also restart the timeout.
  const [notice, setNotice] = useState({ message: '' })
  const showMessage = useCallback((message: string) => setNotice({ message }), [])

  useEffect(() => {
    if (!notice.message) return
    const timer = window.setTimeout(() => {
      setNotice((current) => (current === notice ? { message: '' } : current))
    }, 4000)
    return () => window.clearTimeout(timer)
  }, [notice])

  return [notice.message, showMessage] as const
}
