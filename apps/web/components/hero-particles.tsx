'use client'

import { useEffect, useRef } from 'react'

/**
 * 首页 hero 的漂浮粒子层（参考 RunningHub 那种星尘背景，但配色跟随本站蜡笔插画）。
 * 纯 canvas 实现、不引第三方库：
 * - 每个粒子预先渲染成一张 32px 的径向渐变贴图，逐帧只做 drawImage，性能开销很小；
 * - 页面不可见或系统开启「减弱动态效果」时完全不绘制。
 */

/** 浅色：像飘浮的蜡笔尘（石墨 + 插画里的橘 / 绿 / 黄 / 蓝 / 粉） */
const LIGHT_PALETTE: ReadonlyArray<readonly [number, number, number]> = [
  [23, 23, 23],
  [232, 168, 124],
  [126, 196, 150],
  [242, 201, 76],
  [122, 178, 232],
  [236, 160, 200],
]

/** 深色：发光星点（参考 RunningHub 那种亮色粒子） */
const DARK_PALETTE: ReadonlyArray<readonly [number, number, number]> = [
  [214, 255, 120],
  [255, 255, 255],
  [150, 220, 255],
  [255, 214, 150],
  [200, 180, 255],
]

export type ParticleTone = 'light' | 'dark'

/** 每 12000 平方像素一颗，24~90 之间（1280×656 的 hero 约 70 颗） */
const AREA_PER_PARTICLE = 12000
const MAX_PARTICLES = 90
const MIN_PARTICLES = 24

interface Particle {
  x: number
  y: number
  radius: number
  rise: number
  drift: number
  phase: number
  alpha: number
  sprite: number
}

function makeSprite([r, g, b]: readonly [number, number, number]) {
  const size = 32
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')
  if (ctx) {
    const gradient = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2)
    gradient.addColorStop(0, `rgba(${r}, ${g}, ${b}, 1)`)
    gradient.addColorStop(0.42, `rgba(${r}, ${g}, ${b}, 0.55)`)
    gradient.addColorStop(1, `rgba(${r}, ${g}, ${b}, 0)`)
    ctx.fillStyle = gradient
    ctx.beginPath()
    ctx.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2)
    ctx.fill()
  }
  return canvas
}

export function HeroParticles({ className, tone = 'light' }: { className?: string; tone?: ParticleTone }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const isDark = tone === 'dark'
    const sprites = (isDark ? DARK_PALETTE : LIGHT_PALETTE).map(makeSprite)
    let width = 0
    let height = 0
    let particles: Particle[] = []
    let frame = 0

    const reset = (particle: Particle, initial = false) => {
      particle.x = Math.random() * width
      particle.y = initial ? Math.random() * height : height + Math.random() * 60
      particle.radius = isDark ? 1.1 + Math.random() * 1.9 : 1.3 + Math.random() * 2.6
      particle.rise = 0.12 + Math.random() * 0.36
      particle.drift = 0.18 + Math.random() * 0.4
      particle.phase = Math.random() * Math.PI * 2
      particle.alpha = isDark ? 0.55 + Math.random() * 0.4 : 0.4 + Math.random() * 0.42
      particle.sprite = Math.floor(Math.random() * sprites.length)
    }

    const seed = () => {
      const target = Math.min(MAX_PARTICLES, Math.max(MIN_PARTICLES, Math.round((width * height) / AREA_PER_PARTICLE)))
      particles = Array.from({ length: target }, () => {
        const particle: Particle = { x: 0, y: 0, radius: 1, rise: 0.3, drift: 0.3, phase: 0, alpha: 0.3, sprite: 0 }
        reset(particle, true)
        return particle
      })
    }

    const resize = () => {
      const dpr = Math.min(2, window.devicePixelRatio || 1)
      width = canvas.clientWidth
      height = canvas.clientHeight
      canvas.width = Math.max(1, Math.round(width * dpr))
      canvas.height = Math.max(1, Math.round(height * dpr))
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      seed()
    }

    const draw = () => {
      ctx.clearRect(0, 0, width, height)
      for (const particle of particles) {
        particle.y -= particle.rise
        particle.x += Math.sin((particle.y + particle.phase) / 90) * particle.drift
        if (particle.y < -24) {
          reset(particle)
          continue
        }
        const size = particle.radius * 7.8
        const sprite = sprites[particle.sprite]
        if (!sprite) continue
        // 轻微的闪烁，让粒子有呼吸感
        const twinkle = 0.82 + Math.sin((particle.y + particle.phase * 30) / 46) * 0.18
        ctx.globalAlpha = Math.min(1, particle.alpha * twinkle)
        ctx.drawImage(sprite, particle.x - size / 2, particle.y - size / 2, size, size)
      }
      ctx.globalAlpha = 1
    }

    const tick = () => {
      draw()
      frame = window.requestAnimationFrame(tick)
    }

    const start = () => {
      if (frame) return
      frame = window.requestAnimationFrame(tick)
    }
    const stop = () => {
      if (!frame) return
      window.cancelAnimationFrame(frame)
      frame = 0
    }
    const onVisibility = () => {
      if (document.hidden) stop()
      else start()
    }

    resize()
    start()
    window.addEventListener('resize', resize)
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      stop()
      window.removeEventListener('resize', resize)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [tone])

  return <canvas ref={canvasRef} className={className} aria-hidden="true" />
}
