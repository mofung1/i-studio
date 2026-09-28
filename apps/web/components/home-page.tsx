'use client'

import { ArrowRight, Box, Images, Layers, Maximize, Send, Sparkles } from 'lucide-react'
import Link from 'next/link'
import { useEffect, useRef, useState, type ReactNode } from 'react'

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/select'

import { TopNavigation } from './top-navigation'
import { countOptions, modelOptions, ratioOptions, resolutionOptions } from './workbench/shared'

const commerceTools = [
  { task: 'product-main', title: '商品主图', description: '生成适配平台规范的商品主视觉', image: 'https://images.unsplash.com/photo-1602143407151-7111542de6e8?auto=format&fit=crop&w=900&q=85' },
  { task: 'detail-page', title: '详情页', description: '围绕商品信息生成详情页素材', image: 'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?auto=format&fit=crop&w=900&q=85' },
  { task: 'viral-recreate', title: '爆款复刻', description: '参考爆款视觉重构商品画面', image: 'https://images.unsplash.com/photo-1542291026-7eec264c27ff?auto=format&fit=crop&w=900&q=85' },
  { task: 'product-retouch', title: '产品精修', description: '修复和提升商品原图质量', image: 'https://images.unsplash.com/photo-1556228578-8c89e6adf883?auto=format&fit=crop&w=900&q=85' },
]

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
  const [docked, setDocked] = useState(false)
  const composerRef = useRef<HTMLDivElement>(null)

  // 首屏输入框滑到视口上方约 1/3 之后，在页面底部吸出一条同样的输入条
  useEffect(() => {
    const node = composerRef.current
    if (!node) return
    let frame = 0
    const update = () => {
      frame = 0
      setDocked(node.getBoundingClientRect().bottom < window.innerHeight * 0.35)
    }
    const onScroll = () => {
      if (!frame) frame = window.requestAnimationFrame(update)
    }
    update()
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onScroll)
    return () => {
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onScroll)
      if (frame) window.cancelAnimationFrame(frame)
    }
  }, [])

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
    <div className={`site-shell ${docked ? 'has-dock' : ''}`}>
      <TopNavigation />
      <main>
        <section className="home-hero">
          <div className="home-hero-inner">
            <h1>把想法，变成画面</h1>

            <div className="hero-composer-wrap" ref={composerRef}>
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
        </section>

        <section className="content-section">
          <div className="section-heading"><Box size={20} /><div><h2>电商创作工具</h2><p>选择创作目标，加载对应的商品图参数。</p></div></div>
          <Link className="full-set-banner" href="/workbench?mode=commerce&task=product-main">
            <div className="full-set-banner-left">
              <span className="full-set-badge"><Layers size={13} />一键全套</span>
              <h3>上传商品图，生成完整上架素材</h3>
              <p>商品主图 · 详情页 · 爆款复刻 · 产品精修，一站式完成商品视觉</p>
            </div>
            <span className="full-set-arrow"><ArrowRight size={20} /></span>
          </Link>
          <div className="commerce-grid">
            {commerceTools.map((tool) => (
              <Link key={tool.task} className="commerce-card" href={`/workbench?mode=commerce&task=${tool.task}`}>
                <div><h3>{tool.title}</h3><p>{tool.description}</p><span className="tool-arrow"><ArrowRight size={18} /></span></div>
                <img src={tool.image} alt={`${tool.title}示例`} loading="lazy" />
              </Link>
            ))}
          </div>
        </section>
      </main>

      {docked && (
        <form className="dock-composer" action="/workbench" method="get" aria-label="快速开始生成">
          {hiddenFields}
          <input
            className="dock-composer-input"
            type="text"
            name="prompt"
            aria-label="画面描述"
            placeholder="描述你想生成的画面…"
            value={promptText}
            onChange={(event) => setPromptText(event.target.value)}
          />
          {configs}
          <button type="submit" className="hero-composer-send" aria-label="进入工作台生成">
            <Send size={17} aria-hidden="true" />
          </button>
        </form>
      )}
    </div>
  )
}
