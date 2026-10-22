// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, expect, it, vi } from 'vitest'
import { HeroCanvas } from './hero-canvas'

afterEach(() => vi.unstubAllGlobals())

it('restores readable content and keyboard actions when enhanced motion is disabled', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  let mediaChanged = () => {}
  const media = {
    matches: true,
    addEventListener: (_: string, listener: () => void) => {
      mediaChanged = listener
    },
    removeEventListener: vi.fn(),
  }
  vi.stubGlobal('matchMedia', () => media)
  class Observer {
    observe() {}
    disconnect() {}
  }
  vi.stubGlobal('IntersectionObserver', Observer)
  vi.stubGlobal('ResizeObserver', Observer)
  const container = document.createElement('div')
  document.body.append(container)
  const root = createRoot(container)
  try {
    await act(async () =>
      root.render(
        <HeroCanvas>
          <div className="editorial-hero-stage">
            <div className="editorial-hero-scene">
              <div data-hero-slot />
              <div data-hero-frame />
              <div data-hero-reframe style={{ width: 800, height: 450, left: 0, top: 0 }} />
              <div data-hero-contrast />
              <div className="editorial-hero-intro">
                <h1 data-hero-heading>AI 图片生成</h1>
                <div data-hero-ink />
                <div data-hero-copy>
                  <a href="/studio">开始创作</a>
                </div>
              </div>
              <div data-hero-scroll />
            </div>
          </div>
        </HeroCanvas>,
      ),
    )
    const hero = container.querySelector<HTMLElement>('.editorial-hero')!
    const copy = container.querySelector<HTMLElement>('[data-hero-copy]')!
    const frame = container.querySelector<HTMLElement>('[data-hero-frame]')!
    // The zero-height test geometry places the enhanced canvas at its expanded endpoint.
    expect(hero.dataset.heroMotion).toBe('true')
    expect(copy.inert).toBe(true)
    expect(copy.style.opacity).toBe('0')
    await act(async () => {
      media.matches = false
      mediaChanged()
    })
    expect(hero.dataset.heroMotion).toBe('false')
    expect(hero.dataset.heroPhase).toBeUndefined()
    expect(copy.inert).toBe(false)
    expect(copy.style.opacity).toBe('')
    expect(copy.style.transform).toBe('')
    expect(frame.style.clipPath).toBe('')
    copy.querySelector('a')!.focus()
    expect(document.activeElement).toBe(copy.querySelector('a'))
  } finally {
    await act(async () => root.unmount())
    container.remove()
  }
})
