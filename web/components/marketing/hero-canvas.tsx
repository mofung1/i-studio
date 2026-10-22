'use client'

import { useLayoutEffect, useRef, type ReactNode } from 'react'

const clamp = (value: number) => Math.max(0, Math.min(1, value))
const between = (value: number, start: number, end: number) =>
  clamp((value - start) / (end - start))

export function HeroCanvas({ children }: { children: ReactNode }) {
  const root = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => {
    const element = root.current!
    const stage = element.querySelector<HTMLElement>('.editorial-hero-stage')!
    const scene = element.querySelector<HTMLElement>('.editorial-hero-scene')!
    const slot = element.querySelector<HTMLElement>('[data-hero-slot]')!
    const frame = element.querySelector<HTMLElement>('[data-hero-frame]')!
    const reframe = element.querySelector<HTMLElement>('[data-hero-reframe]')!
    const contrast = element.querySelector<HTMLElement>('[data-hero-contrast]')!
    const intro = element.querySelector<HTMLElement>('.editorial-hero-intro')!
    const heading = element.querySelector<HTMLElement>('[data-hero-heading]')!
    const ink = element.querySelector<HTMLElement>('[data-hero-ink]')!
    const copy = element.querySelector<HTMLElement>('[data-hero-copy]')!
    const cue = element.querySelector<HTMLElement>('[data-hero-scroll]')!
    const header = document.querySelector<HTMLElement>('.marketing-header')
    const media = matchMedia(
      '(min-width: 1000px) and (min-height: 620px) and (hover: hover) and (pointer: fine) and (prefers-reduced-motion: no-preference)',
    )
    let scrollFrame = 0,
      visible = true,
      headerHeight = 81,
      distance = 1,
      top = 0,
      right = 0,
      bottom = 0,
      left = 0,
      translateX = 0,
      translateY = 0,
      scale = 1,
      sceneWidth = 0,
      sceneHeight = 0,
      headingLeft = 0,
      headingTop = 0,
      headingWidth = 0,
      headingHeight = 0

    function paint() {
      scrollFrame = 0
      if (!media.matches) return
      const progress = clamp((headerHeight - element.getBoundingClientRect().top) / distance)
      const expansion = between(progress, 0.3, 0.88)
      const remaining = 1 - expansion
      // Copy and title clear the frame before the artwork starts expanding over them.
      const exit = between(progress, 0.08, 0.34)
      const copyExit = between(progress, 0.02, 0.13)
      frame.style.clipPath = `inset(${top * remaining}px ${right * remaining}px ${bottom * remaining}px ${left * remaining}px)`
      reframe.style.transform = `translate3d(${translateX * expansion}px, ${translateY * expansion}px, 0) scale(${1 + (scale - 1) * expansion})`
      const headingX = -exit * 18
      const headingY = -exit * 36
      heading.style.transform = `translate3d(${headingX}px, ${headingY}px, 0)`
      heading.style.opacity = String(1 - exit)
      // Clip the light glyphs to the same rectangular picture boundary, never the picture itself.
      const insetTop = Math.max(0, top * remaining - headingTop - headingY)
      const insetLeft = Math.max(0, left * remaining - headingLeft - headingX)
      const insetRight = Math.max(
        0,
        headingLeft + headingX + headingWidth - (sceneWidth - right * remaining),
      )
      const insetBottom = Math.max(
        0,
        headingTop + headingY + headingHeight - (sceneHeight - bottom * remaining),
      )
      ink.style.clipPath = `inset(${insetTop}px ${insetRight}px ${insetBottom}px ${insetLeft}px)`
      ink.style.setProperty('--hero-ink-edge', `${insetLeft}px`)
      contrast.style.opacity = String(1 - exit)
      copy.style.transform = `translate3d(0, ${-copyExit * 16}px, 0)`
      copy.style.opacity = String(1 - copyExit)
      copy.inert = copyExit === 1
      cue.style.opacity = String(1 - between(progress, 0.03, 0.2))
      element.dataset.heroPhase =
        progress < 0.34 ? 'opening' : progress < 0.88 ? 'expand' : 'expanded'
      element.dataset.heroProgress = progress.toFixed(4)
    }
    function schedule() {
      if (visible && media.matches && !scrollFrame) scrollFrame = requestAnimationFrame(paint)
    }
    function measure() {
      if (!media.matches) return
      headerHeight = header?.getBoundingClientRect().height || 81
      element.style.setProperty('--hero-header-height', `${headerHeight}px`)
      distance = Math.max(1, element.offsetHeight - stage.offsetHeight)
      // The slot uses exactly the same CSS geometry as the server-rendered rectangle.
      // The slot never transforms; computed layout sizes retain subpixel precision.
      const sceneRect = scene.getBoundingClientRect()
      const slotRect = slot.getBoundingClientRect()
      const plane = getComputedStyle(reframe)
      const planeWidth = Number.parseFloat(plane.width)
      const planeHeight = Number.parseFloat(plane.height)
      const introRect = intro.getBoundingClientRect()
      const headingRect = heading.getBoundingClientRect()
      sceneWidth = sceneRect.width
      sceneHeight = sceneRect.height
      headingLeft = introRect.left - sceneRect.left + heading.offsetLeft
      headingTop = introRect.top - sceneRect.top + heading.offsetTop
      headingWidth = headingRect.width
      headingHeight = headingRect.height
      top = slotRect.top - sceneRect.top
      left = slotRect.left - sceneRect.left
      right = sceneRect.width - left - slotRect.width
      bottom = sceneRect.height - top - slotRect.height
      const imageRatio = planeWidth / planeHeight
      const fullWidth = Math.max(sceneRect.width, sceneRect.height * imageRatio)
      scale = fullWidth / planeWidth
      translateX = (sceneRect.width - fullWidth) / 2 - Number.parseFloat(plane.left)
      // Align the image's top edge throughout the expansion to preserve the tallest tower.
      translateY = -Number.parseFloat(plane.top)
      paint()
    }
    function configure() {
      cancelAnimationFrame(scrollFrame)
      scrollFrame = 0
      element.dataset.heroMotion = String(media.matches)
      if (media.matches) {
        measure()
      } else {
        for (const node of [frame, reframe, contrast, heading, ink, copy, cue]) {
          node.style.removeProperty('transform')
          node.style.removeProperty('opacity')
          node.style.removeProperty('clip-path')
        }
        ink.style.removeProperty('--hero-ink-edge')
        copy.inert = false
        delete element.dataset.heroProgress
        delete element.dataset.heroPhase
      }
    }
    const observer = new IntersectionObserver(([entry]) => {
      visible = Boolean(entry?.isIntersecting)
      if (visible) schedule()
      else {
        cancelAnimationFrame(scrollFrame)
        scrollFrame = 0
      }
    })
    // Refresh both the scroll distance and geometry when the sticky header or viewport changes.
    const resizeObserver = new ResizeObserver(measure)
    configure()
    observer.observe(element)
    resizeObserver.observe(scene)
    if (header) resizeObserver.observe(header)
    media.addEventListener('change', configure)
    window.addEventListener('scroll', schedule, { passive: true })
    window.addEventListener('resize', measure, { passive: true })
    window.addEventListener('pageshow', measure)
    return () => {
      observer.disconnect()
      resizeObserver.disconnect()
      cancelAnimationFrame(scrollFrame)
      media.removeEventListener('change', configure)
      window.removeEventListener('scroll', schedule)
      window.removeEventListener('resize', measure)
      window.removeEventListener('pageshow', measure)
    }
  }, [])
  return (
    <div className="editorial-hero" ref={root}>
      {children}
    </div>
  )
}
