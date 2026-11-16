'use client'

import { createContext, useContext, useState, type ReactNode } from 'react'

const OverlayContainer = createContext<HTMLElement | null>(null)

/** Keep portals in the owning workspace so its palette and component styles apply. */
export function OverlayRoot({ className, children }: { className: string; children: ReactNode }) {
  const [container, setContainer] = useState<HTMLDivElement | null>(null)
  return (
    <div className={className} ref={setContainer}>
      <OverlayContainer.Provider value={container}>{children}</OverlayContainer.Provider>
    </div>
  )
}

export function useOverlayContainer() {
  return useContext(OverlayContainer)
}
