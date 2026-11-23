import { createRoot as createReactRoot } from 'react-dom/client'
import type { ReactNode } from 'react'
import {
  createMemoryHistory,
  createRootRoute,
  createRouter,
  RouterContextProvider,
} from '@tanstack/react-router'

/** Mount a single admin screen with the same router context its links use in the app. */
export function createTestRoot(container: HTMLElement) {
  const root = createReactRoot(container)
  const router = createRouter({
    routeTree: createRootRoute(),
    history: createMemoryHistory({ initialEntries: ['/admin/'] }),
  })
  return {
    render(children: ReactNode) {
      root.render(<RouterContextProvider router={router}>{children}</RouterContextProvider>)
    },
    unmount: () => root.unmount(),
  }
}
