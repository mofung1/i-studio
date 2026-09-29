'use client'

import { Check, Images, ImagePlus, Maximize, RotateCcw, Send, Sparkles, X } from 'lucide-react'
import { useEffect, useRef, useState, type ReactNode } from 'react'

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/select'
import { clearStoredHomeBackground, readStoredHomeBackground, storeHomeBackground } from '@/lib/home-background'

import { TopNavigation } from './top-navigation'
import { countOptions, modelOptions, ratioOptions, resolutionOptions } from './workbench/shared'

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

export function HomePage() {
  const [promptText, setPromptText] = useState('柔和晨光中的极简静物摄影，构图干净，材质细节清晰。')
  const [model, setModel] = useState('gpt-image-2')
  const [ratio, setRatio] = useState('1:1')
  const [resolution, setResolution] = useState('2K')
  const [count, setCount] = useState('1')
  // 背景图：空字符串表示用内置默认插画；用户自选的图只存在本机
  const [background, setBackground] = useState('')
  const [backgroundOpen, setBackgroundOpen] = useState(false)
  const [backgroundError, setBackgroundError] = useState('')
  const [backgroundBusy, setBackgroundBusy] = useState(false)
  // 用户开始输入时，slogan 淡下去给输入让位
  const [sloganDim, setSloganDim] = useState(false)
  const backgroundRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    setBackground(readStoredHomeBackground())
  }, [])

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

  async function pickBackground(file: File | undefined) {
    if (!file) return
    setBackgroundBusy(true)
    setBackgroundError('')
    try {
      const dataUrl = await storeHomeBackground(file)
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
      <ComposerSelect label="生图模型" value={model} onChange={setModel} icon={<Sparkles size={14} aria-hidden="true" />} options={modelOptions} hints={modelHints} className="model" />
      <ComposerSelect label="画面比例" value={ratio} onChange={setRatio} icon={<Maximize size={14} aria-hidden="true" />} options={ratioOptions} />
      <ComposerSelect label="清晰度" value={resolution} onChange={setResolution} icon={<Images size={14} aria-hidden="true" />} options={resolutionOptions} />
      <ComposerSelect label="生成数量" value={count} onChange={setCount} icon={<Images size={14} aria-hidden="true" />} options={countOptions} />
    </div>
  )

  return (
    <div
      className="site-shell home-shell"
      /* 背景铺满整屏（含导航区）：用户设过就用它，否则用 CSS 里的默认插画 */
      style={background ? { backgroundImage: `url(${background})` } : undefined}
    >
      <TopNavigation />
      <main>
        <section className="home-hero">
          <div className="home-hero-inner">
            {/* Slogan：打字机入场 + 之后低频的光扫（方案 C） */}
            <p className={`home-slogan${sloganDim ? ' is-dim' : ''}`}>
              <span className="home-slogan-text">让创意拥有视觉</span>
              <span className="home-slogan-caret" aria-hidden="true" />
              <span className="home-slogan-sheen" aria-hidden="true">让创意拥有视觉</span>
            </p>
            <div className="hero-composer-wrap">
              <form className="hero-composer" action="/workbench" method="get">
                {hiddenFields}
                <label className="hero-composer-input">
                  <span className="sr-only">画面描述</span>
                  <textarea
                    name="prompt"
                    aria-label="画面描述"
                    placeholder="例如：一支绿色保温杯放在森林岩石上，清晨阳光从树叶之间洒下来，高级户外产品摄影。"
                    value={promptText}
                    onChange={(event) => setPromptText(event.target.value)}
                    onFocus={() => setSloganDim(true)}
                    onBlur={() => setSloganDim(false)}
                  />
                </label>
                <div className="hero-composer-bar">
                  {configs}
                  <button type="submit" className="hero-composer-send" aria-label="进入工作台生成">
                    <Send size={18} aria-hidden="true" />
                  </button>
                </div>
              </form>
            </div>
          </div>

          {/* 背景图设置：默认内置插画，也可以换成自己的图（只存在本机浏览器） */}
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
                  恢复默认背景
                  {!background && <Check size={14} aria-hidden="true" />}
                </button>
                <p className="hero-background-hint">图片只保存在本机浏览器，不会上传到服务器。</p>
                {backgroundError && <p className="hero-background-error" role="alert">{backgroundError}</p>}
              </div>
            )}
          </div>
        </section>
      </main>
    </div>
  )
}
