'use client'

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
  type CSSProperties,
} from 'react'

type DisplayMode = 'pending' | 'desktop' | 'static'
type PreviewContext = {
  mode: DisplayMode
  requested: number
  displayed: number
  select: (index: number, input: 'pointer' | 'keyboard') => void
  ready: (index: number) => void
}
const Context = createContext<PreviewContext | null>(null)
function usePreview() {
  const value = useContext(Context)
  if (!value) throw new Error('Tool previews require ToolShowcaseInteraction')
  return value
}

export function ToolShowcaseInteraction({
  children,
  count,
  anchors,
}: {
  children: ReactNode
  count: number
  anchors: readonly { hash: string; index: number }[]
}) {
  const [mode, setMode] = useState<DisplayMode>('pending')
  const [requested, setRequested] = useState(0)
  const [displayed, setDisplayed] = useState(0)
  const [input, setInput] = useState('pointer')
  const requestedRef = useRef(0)
  const readyItems = useRef(new Set<number>())
  const select = useCallback((index: number, method: 'pointer' | 'keyboard') => {
    requestedRef.current = index
    setRequested(index)
    setInput(method)
    if (readyItems.current.has(index)) setDisplayed(index)
  }, [])
  const ready = useCallback((index: number) => {
    readyItems.current.add(index)
    // A late response for an abandoned hover must not replace the current request.
    if (requestedRef.current === index) setDisplayed(index)
  }, [])

  useEffect(() => {
    const media = matchMedia('(min-width: 1000px) and (hover: hover) and (pointer: fine)')
    const configure = () => setMode(media.matches ? 'desktop' : 'static')
    const selectAnchor = (hash: string, method: 'pointer' | 'keyboard') => {
      const anchor = anchors.find((item) => item.hash === hash)
      if (anchor) select(anchor.index, method)
    }
    const hashChanged = () => selectAnchor(location.hash, 'keyboard')
    const anchorClicked = (event: MouseEvent) => {
      const link = event.target instanceof Element ? event.target.closest('a[href]') : null
      if (!link) return
      const url = new URL(link.getAttribute('href')!, location.href)
      if (url.origin === location.origin && url.pathname === '/')
        selectAnchor(url.hash, event.detail === 0 ? 'keyboard' : 'pointer')
    }
    configure()
    hashChanged()
    media.addEventListener('change', configure)
    window.addEventListener('hashchange', hashChanged)
    document.addEventListener('click', anchorClicked)
    return () => {
      media.removeEventListener('change', configure)
      window.removeEventListener('hashchange', hashChanged)
      document.removeEventListener('click', anchorClicked)
    }
  }, [select, anchors])

  return (
    <Context.Provider value={{ mode, requested, displayed, select, ready }}>
      <div
        className="tool-showcase-grid"
        data-mode={mode}
        data-input={input}
        data-loading={requested !== displayed}
        style={{ '--tool-count': count } as CSSProperties}
      >
        {children}
      </div>
    </Context.Provider>
  )
}

export function ToolShowcaseAnchors() {
  const { mode } = usePreview()
  return mode === 'desktop' ? (
    <>
      <span id="ai-tools" className="tool-showcase-anchor" aria-hidden="true" />
      <span id="commerce-tools" className="tool-showcase-anchor" aria-hidden="true" />
    </>
  ) : null
}

export function ToolShowcaseChoice({
  index,
  anchor,
  children,
}: {
  index: number
  anchor?: string
  children: ReactNode
}) {
  const { mode, requested, select } = usePreview()
  return (
    <div
      className="tool-showcase-choice"
      id={mode === 'desktop' ? undefined : anchor}
      style={{ gridRow: index + 1 }}
      data-selected={requested === index}
      onPointerEnter={(event) => {
        if (mode === 'desktop' && event.pointerType !== 'touch') select(index, 'pointer')
      }}
      onFocusCapture={() => {
        if (mode === 'desktop') select(index, 'keyboard')
      }}
    >
      {children}
    </div>
  )
}

export function ToolShowcasePanel({ index, children }: { index: number; children: ReactNode }) {
  const { mode, requested, displayed } = usePreview()
  const hidden = mode === 'desktop' && requested !== index
  return (
    <div
      className="tool-showcase-panel"
      data-preview={displayed === index}
      data-selected={requested === index}
      aria-hidden={hidden || undefined}
      inert={hidden || undefined}
    >
      {children}
    </div>
  )
}

export function ToolShowcaseVisual({ index, children }: { index: number; children: ReactNode }) {
  const { mode, requested, ready } = usePreview()
  const [loaded, setLoaded] = useState(index === 0)
  const [failed, setFailed] = useState(false)
  const root = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (mode === 'pending') return
    if (mode === 'desktop') {
      if (requested === index) setLoaded(true)
      return
    }
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          setLoaded(true)
          observer.disconnect()
        }
      },
      { rootMargin: '220px' },
    )
    observer.observe(root.current!)
    return () => observer.disconnect()
  }, [mode, requested, index])

  useEffect(() => {
    if (!loaded) return
    const element = root.current!
    const images = [...element.querySelectorAll<HTMLImageElement>('.tool-showcase-artwork img')]
    const check = () => {
      if (images.some((image) => image.complete && image.naturalWidth === 0)) {
        error()
        return
      }
      if (images.length && images.every((image) => image.complete && image.naturalWidth > 0))
        ready(index)
    }
    const error = () => {
      setFailed(true)
      ready(index)
    }
    element.addEventListener('load', check, true)
    element.addEventListener('error', error, true)
    check()
    return () => {
      element.removeEventListener('load', check, true)
      element.removeEventListener('error', error, true)
    }
  }, [loaded, index, ready])

  return (
    <div className="tool-showcase-visual" ref={root}>
      <span className="tool-showcase-placeholder" aria-hidden="true" />
      {loaded && <div className="tool-showcase-artwork">{children}</div>}
      {index !== 0 && (
        <noscript>
          <div className="tool-showcase-artwork">{children}</div>
        </noscript>
      )}
      {failed && <span className="tool-showcase-placeholder is-error">图片暂时无法加载</span>}
    </div>
  )
}
