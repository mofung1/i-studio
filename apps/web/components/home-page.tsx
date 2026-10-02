'use client'

import { Check, ChevronDown, Images, ImagePlus, Maximize, Moon, RotateCcw, Send, Sparkles, Sun, X } from 'lucide-react'
import { useEffect, useRef, useState, type ReactNode } from 'react'

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/select'
import {
  clearStoredHomeBackground,
  readStoredHomeBackground,
  readStoredHomeTheme,
  storeHomeBackground,
  storeHomeTheme,
  type HomeTheme,
} from '@/lib/home-background'

import { TopNavigation } from './top-navigation'
import { generalCountOptions, modelOptions, ratioOptions, resolutionOptions } from './workbench/shared'

/** 配置项的补充说明，帮助第一次使用的用户理解各档差异 */
const modelHints: Record<string, string> = {
  'gpt-image-2': '商品一致性与文字还原更稳',
  'gemini-2.5-flash-image': '速度快，适合快速试稿',
  'gemini-3.1-flash-image': '速度与质量均衡',
  'gemini-3-pro-image': '细节与质感最好',
}

interface ComposerSelectProps {
  label: string
  value: string
  onChange: (value: string) => void
  icon: ReactNode
  options: ReadonlyArray<readonly [string, string]>
  hints?: Record<string, string>
  className?: string
}

function ComposerSelect({ label, value, onChange, icon, options, hints, className = '' }: ComposerSelectProps) {
  const current = options.find(([optionValue]) => optionValue === value)?.[1] ?? value
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className={`hero-select ${className}`} aria-label={label}>
        {icon}
        <span className="hero-select-value">{current}</span>
      </SelectTrigger>
      <SelectContent className="hero-select-content">
        {options.map(([optionValue, optionLabel]) => (
          <SelectItem key={optionValue} value={optionValue}>
            <span className="hero-option">
              <span>{optionLabel}</span>
              {hints?.[optionValue] && <small>{hints[optionValue]}</small>}
            </span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

/** 比例图标：按宽高比画出一个小圆角矩形，直观示意画面形状 */
function RatioIcon({ ratio }: { ratio: string }) {
  const parts = ratio.split(':').map(Number)
  const w = parts[0] ?? 1
  const h = parts[1] ?? 1
  const max = 22
  const width = w >= h ? max : max * (w / h)
  const height = h >= w ? max : max * (h / w)
  return <span className="ratio-icon" style={{ width, height }} aria-hidden="true" />
}

// 背景写在 <html> 的 --home-bg 上：首屏脚本与 React 共用同一个变量，切换时不会闪
function applyHomeBackgroundVar(dataUrl: string) {
  const root = document.documentElement
  if (dataUrl) root.style.setProperty('--home-bg', `url("${dataUrl}")`)
  else root.style.removeProperty('--home-bg')
}

// 配色模式写在 <html> 的 data-home-theme 上：CSS 变量令牌切换浅色/深色 hero
function applyHomeTheme(theme: HomeTheme) {
  document.documentElement.setAttribute('data-home-theme', theme)
}

export function HomePage() {
  const [promptText, setPromptText] = useState('')
  const [model, setModel] = useState('gpt-image-2')
  const [ratio, setRatio] = useState('1:1')
  const [resolution, setResolution] = useState('2K')
  const [count, setCount] = useState('1')
  // 背景图：空字符串表示用内置默认插画；用户自选的图只存在本机
  const [background, setBackground] = useState('')
  const [backgroundOpen, setBackgroundOpen] = useState(false)
  const [backgroundError, setBackgroundError] = useState('')
  const [backgroundBusy, setBackgroundBusy] = useState(false)
  const [configOpen, setConfigOpen] = useState(false)
  // 首页配色：默认深色；浅色/深色只影响首页 hero，不改全局主题
  const [homeTheme, setHomeTheme] = useState<HomeTheme>('dark')
  const backgroundRef = useRef<HTMLDivElement>(null)
  const configRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const stored = readStoredHomeBackground()
    setBackground(stored)
    applyHomeBackgroundVar(stored)
    const theme = readStoredHomeTheme()
    setHomeTheme(theme)
    applyHomeTheme(theme)
  }, [])

  function chooseHomeTheme(next: HomeTheme) {
    setHomeTheme(next)
    storeHomeTheme(next)
    applyHomeTheme(next)
  }

  // 点空白处 / Esc 关闭背景设置面板
  useEffect(() => {
    if (!backgroundOpen) return
    const onPointerDown = (event: MouseEvent) => {
      if (!backgroundRef.current?.contains(event.target as Node)) setBackgroundOpen(false)
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setBackgroundOpen(false)
    }
    document.addEventListener('mousedown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [backgroundOpen])

  // 点空白处 / Esc 关闭参数面板
  useEffect(() => {
    if (!configOpen) return
    const onPointerDown = (event: MouseEvent) => {
      if (!configRef.current?.contains(event.target as Node)) setConfigOpen(false)
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setConfigOpen(false)
    }
    document.addEventListener('mousedown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [configOpen])

  async function pickBackground(file: File | undefined) {
    if (!file) return
    setBackgroundBusy(true)
    setBackgroundError('')
    try {
      const dataUrl = await storeHomeBackground(file)
      applyHomeBackgroundVar(dataUrl)
      setBackground(dataUrl)
      setBackgroundOpen(false)
    } catch (reason) {
      setBackgroundError(reason instanceof Error ? reason.message : '背景图设置失败，请重试')
    } finally {
      setBackgroundBusy(false)
    }
  }

  function resetBackground() {
    clearStoredHomeBackground()
    applyHomeBackgroundVar('')
    setBackground('')
    setBackgroundError('')
    setBackgroundOpen(false)
  }

  const hiddenFields = (
    <>
      <input type="hidden" name="mode" value="general" />
      <input type="hidden" name="model" value={model} />
      <input type="hidden" name="aspectRatio" value={ratio} />
      <input type="hidden" name="resolution" value={resolution} />
      <input type="hidden" name="count" value={count} />
    </>
  )

  const configs = (
    <div className="hero-configs">
      <ComposerSelect label="生图模型" value={model} onChange={setModel} icon={null} options={modelOptions} hints={modelHints} className="model" />
      <div className="hero-param" ref={configRef}>
        <button
          type="button"
          className="hero-param-trigger"
          aria-expanded={configOpen}
          aria-haspopup="dialog"
          onClick={() => setConfigOpen((open) => !open)}
        >
          {ratio} · {resolution} · {count} 张
          <ChevronDown size={14} aria-hidden="true" className="hero-param-caret" />
        </button>
        {configOpen && (
          <div className="hero-param-panel" role="dialog" aria-label="画面参数">
            <div className="hero-param-section">
              <p className="hero-param-title">比例</p>
              <div className="ratio-grid">
                {ratioOptions.map(([value]) => (
                  <button
                    key={value}
                    type="button"
                    className={`ratio-item${ratio === value ? ' is-active' : ''}`}
                    aria-pressed={ratio === value}
                    onClick={() => setRatio(value)}
                  >
                    <RatioIcon ratio={value} />
                    <span>{value}</span>
                  </button>
                ))}
              </div>
            </div>
            <div className="hero-param-section">
              <p className="hero-param-title">清晰度</p>
              <div className="seg-group">
                {resolutionOptions.map(([value]) => (
                  <button
                    key={value}
                    type="button"
                    className={`seg-item${resolution === value ? ' is-active' : ''}`}
                    aria-pressed={resolution === value}
                    onClick={() => setResolution(value)}
                  >
                    {value}
                  </button>
                ))}
              </div>
            </div>
            <div className="hero-param-section">
              <p className="hero-param-title">生成张数</p>
              <div className="seg-group">
                {generalCountOptions.map(([value]) => (
                  <button
                    key={value}
                    type="button"
                    className={`seg-item${count === value ? ' is-active' : ''}`}
                    aria-pressed={count === value}
                    onClick={() => setCount(value)}
                  >
                    {value}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )

  return (
    <div
      className="site-shell home-shell"
    >
      {/* 背景层：默认内置插画，用户换过就用本机那张 */}
      <div className="home-backdrop" aria-hidden="true" />
      <TopNavigation />
      <main>
        <section className="home-hero">
          <div className="home-hero-inner">
            <p className="home-slogan">让创意拥有视觉</p>
            <div className="hero-composer-wrap">
              <form className="hero-composer" action="/workbench" method="get">
                {hiddenFields}
                <div className="hero-composer-input">
                  <label className="sr-only">画面描述</label>
                  <textarea
                    name="prompt"
                    aria-label="画面描述"
                    placeholder="描述画面，AI 为你生成..."
                    value={promptText}
                    onChange={(event) => setPromptText(event.target.value)}
                  />
                  <div className="hero-composer-bar">
                    {configs}
                    <button type="submit" className="hero-composer-send" aria-label="进入工作台生成">
                      <Send size={16} aria-hidden="true" />
                    </button>
                  </div>
                </div>
              </form>
            </div>
          </div>

          {/* 背景图设置：默认内置插画，也可以换成自己的图（只存在本机浏览器）；配色模式也在这里切换 */}
          <div className="hero-background" ref={backgroundRef}>
            <button
              type="button"
              className="hero-background-trigger"
              aria-expanded={backgroundOpen}
              aria-haspopup="dialog"
              onClick={() => { setBackgroundOpen((open) => !open); setBackgroundError('') }}
            >
              <ImagePlus size={15} aria-hidden="true" />
              背景
              {background && <span className="hero-background-dot" aria-hidden="true" />}
            </button>

            {backgroundOpen && (
              <div className="hero-background-panel" role="dialog" aria-label="首页背景设置">
                <header className="hero-background-head">
                  <strong>首页背景</strong>
                  <button type="button" aria-label="关闭" title="关闭" onClick={() => setBackgroundOpen(false)}><X size={15} /></button>
                </header>
                <div className="hero-background-section">
                  <p className="hero-background-title">配色</p>
                  <div className="hero-bg-theme" role="group" aria-label="首页配色">
                    <button
                      type="button"
                      className={`hero-bg-theme-item${homeTheme === 'light' ? ' is-active' : ''}`}
                      aria-pressed={homeTheme === 'light'}
                      onClick={() => chooseHomeTheme('light')}
                    >
                      <Sun size={14} aria-hidden="true" />
                      浅色
                    </button>
                    <button
                      type="button"
                      className={`hero-bg-theme-item${homeTheme === 'dark' ? ' is-active' : ''}`}
                      aria-pressed={homeTheme === 'dark'}
                      onClick={() => chooseHomeTheme('dark')}
                    >
                      <Moon size={14} aria-hidden="true" />
                      深色
                    </button>
                  </div>
                </div>
                <div className="hero-background-section">
                  <p className="hero-background-title">背景图</p>
                  <label className={`hero-background-option${backgroundBusy ? ' is-busy' : ''}`}>
                    <ImagePlus size={15} aria-hidden="true" />
                    {backgroundBusy ? '正在处理…' : '选择本地图片'}
                    <input
                      type="file"
                      accept="image/*"
                      disabled={backgroundBusy}
                      onChange={(event) => {
                        void pickBackground(event.target.files?.[0])
                        event.target.value = ''
                      }}
                    />
                  </label>
                  <button
                    type="button"
                    className="hero-background-option"
                    onClick={resetBackground}
                    disabled={!background}
                  >
                    <RotateCcw size={15} aria-hidden="true" />
                    清除背景图
                    {!background && <Check size={14} aria-hidden="true" />}
                  </button>
                </div>
                <p className="hero-background-hint">配色与图片只保存在本机浏览器，不会上传到服务器。</p>
                {backgroundError && <p className="hero-background-error" role="alert">{backgroundError}</p>}
              </div>
            )}
          </div>
        </section>
      </main>
    </div>
  )
}
