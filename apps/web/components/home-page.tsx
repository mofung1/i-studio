'use client'

import { Check, Images, ImagePlus, Maximize, RotateCcw, Send, Sparkles, X } from 'lucide-react'
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

// 背景写在 <html> 的 --home-bg 上：首屏脚本与 React 共用同一个变量，切换时不会闪
function applyHomeBackgroundVar(dataUrl: string) {
  const root = document.documentElement
  if (dataUrl) root.style.setProperty('--home-bg', `url("${dataUrl}")`)
  else root.style.removeProperty('--home-bg')
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
  const [theme, setTheme] = useState<HomeTheme>('light')
  const backgroundRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const stored = readStoredHomeBackground()
    setBackground(stored)
    applyHomeBackgroundVar(stored)
    setTheme(readStoredHomeTheme())
  }, [])

  // 主题只在首页生效：挂载时加在 <html> 上（让下拉菜单这类 portal 也能跟着变），离开时移除
  useEffect(() => {
    const root = document.documentElement
    root.classList.toggle('theme-dark', theme === 'dark')
    return () => root.classList.remove('theme-dark')
  }, [theme])

  function changeTheme(next: HomeTheme) {
    setTheme(next)
    storeHomeTheme(next)
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
      <ComposerSelect label="生图模型" value={model} onChange={setModel} icon={<Sparkles size={14} aria-hidden="true" />} options={modelOptions} hints={modelHints} className="model" />
      <ComposerSelect label="画面比例" value={ratio} onChange={setRatio} icon={<Maximize size={14} aria-hidden="true" />} options={ratioOptions} />
      <ComposerSelect label="清晰度" value={resolution} onChange={setResolution} icon={<Images size={14} aria-hidden="true" />} options={resolutionOptions} />
      <ComposerSelect label="生成数量" value={count} onChange={setCount} icon={<Images size={14} aria-hidden="true" />} options={countOptions} />
    </div>
  )

  return (
    <div
      className="site-shell home-shell"
    >
      {/* 背景层：默认内置插画，换过就用用户本机那张；深色主题下自动压一层暗色蒙版 */}
      <div className={`home-backdrop${background ? ' has-image' : ''}`} aria-hidden="true" />
      <TopNavigation />
      <main>
        <section className="home-hero">
          <div className="home-hero-inner">
            <p className="home-slogan">让创意拥有视觉</p>
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
                <div className="hero-background-theme" role="group" aria-label="首页主题">
                  <button type="button" aria-pressed={theme === 'light'} className={theme === 'light' ? 'is-active' : ''} onClick={() => changeTheme('light')}>浅色</button>
                  <button type="button" aria-pressed={theme === 'dark'} className={theme === 'dark' ? 'is-active' : ''} onClick={() => changeTheme('dark')}>深色</button>
                </div>
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
