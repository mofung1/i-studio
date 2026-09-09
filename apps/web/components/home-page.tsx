'use client'

import { ArrowRight, Box, ChevronDown, Clock3, Images, Maximize, Palette, Send, Sparkles } from 'lucide-react'
import Link from 'next/link'
import { useState, type ReactNode } from 'react'

import { TopNavigation } from './top-navigation'

const commerceTools = [
  { task: 'white-background', accent: 'mint', title: '白底精修', description: '干净规范的上架主图', image: 'https://images.unsplash.com/photo-1602143407151-7111542de6e8?auto=format&fit=crop&w=900&q=85' },
  { task: 'scene', accent: 'yellow', title: '商品场景图', description: '把商品自然放入真实场景', image: 'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?auto=format&fit=crop&w=900&q=85' },
  { task: 'selling-point', accent: 'coral', title: '卖点主图', description: '生成有信息留白的主视觉', image: 'https://images.unsplash.com/photo-1542291026-7eec264c27ff?auto=format&fit=crop&w=900&q=85' },
  { task: 'detail-page', accent: 'blue', title: '详情页单页', description: '围绕单一主题表达商品信息', image: 'https://images.unsplash.com/photo-1556228578-8c89e6adf883?auto=format&fit=crop&w=900&q=85' },
]

const inspiration = [
  ['晨光下的护肤仪式', '美妆', 'https://images.unsplash.com/photo-1556228578-8c89e6adf883?auto=format&fit=crop&w=900&q=85'],
  ['安静的居家办公', '数码', 'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?auto=format&fit=crop&w=900&q=85'],
  ['现代主义客厅', '家居', 'https://images.unsplash.com/photo-1586023492125-27b2c045efd7?auto=format&fit=crop&w=900&q=85'],
]

interface ComposerSelectProps {
  label: string
  value: string
  onChange: (value: string) => void
  icon: ReactNode
  children: ReactNode
  className?: string
}

function ComposerSelect({ label, value, onChange, icon, children, className = '' }: ComposerSelectProps) {
  return (
    <label className={`composer-select ${className}`}>
      {icon}
      <select aria-label={label} value={value} onChange={(event) => onChange(event.target.value)}>{children}</select>
      <ChevronDown size={14} aria-hidden="true" />
    </label>
  )
}

export function HomePage() {
  const [model, setModel] = useState('gpt-image-2')
  const [ratio, setRatio] = useState('1:1')
  const [resolution, setResolution] = useState('2K')
  const [count, setCount] = useState('1')
  return (
    <div className="site-shell">
      <TopNavigation />
      <main>
        <section className="home-hero">
          <span className="eyebrow"><Sparkles size={16} />通用生图</span>
          <h1>描述你的想法，生成一张好图</h1>
          <p>输入画面描述，可选参考图，再选择模型、比例和生成数量。</p>
          <form className="prompt-composer" action="/workbench">
            <input type="hidden" name="mode" value="general" />
            <input type="hidden" name="model" value={model} />
            <input type="hidden" name="aspectRatio" value={ratio} />
            <input type="hidden" name="resolution" value={resolution} />
            <input type="hidden" name="count" value={count} />
            <textarea name="prompt" aria-label="创作描述" defaultValue="柔和晨光中的极简静物摄影，构图干净，材质细节清晰。" />
            <div className="composer-footer">
              <div className="composer-controls">
                <ComposerSelect className="model-select" label="生图模型" value={model} onChange={setModel} icon={<Sparkles size={15} />}><option value="gpt-image-2">GPT Image 2</option><option value="gemini-2.5-flash-image">Gemini 2.5 Flash</option><option value="gemini-3.1-flash-image">Gemini 3.1 Flash</option><option value="gemini-3-pro-image">Gemini 3 Pro Image</option></ComposerSelect>
                <ComposerSelect label="画面比例" value={ratio} onChange={setRatio} icon={<Maximize size={15} />}><option>1:1</option><option>3:4</option><option>4:3</option><option>9:16</option><option>16:9</option></ComposerSelect>
                <ComposerSelect label="清晰度" value={resolution} onChange={setResolution} icon={<Images size={15} />}><option>1K</option><option>2K</option><option>4K</option></ComposerSelect>
                <ComposerSelect label="生成数量" value={count} onChange={setCount} icon={<Images size={15} />}>{[1, 2, 3, 4].map((item) => <option key={item} value={item}>{item} 张</option>)}</ComposerSelect>
              </div>
              <button type="submit" aria-label="开始生成配置"><Send size={19} /></button>
            </div>
          </form>
        </section>

        <section className="content-section">
          <div className="section-heading"><Box size={20} /><div><h2>电商创作工具</h2><p>选择创作目标，加载对应的商品图参数。</p></div></div>
          <div className="commerce-grid">
            {commerceTools.map((tool) => (
              <Link key={tool.task} className={`commerce-card accent-${tool.accent}`} href={`/workbench?mode=commerce&task=${tool.task}`}>
                <div><h3>{tool.title}</h3><p>{tool.description}</p><span className="tool-arrow"><ArrowRight size={18} /></span></div>
                <img src={tool.image} alt={`${tool.title}示例`} />
              </Link>
            ))}
          </div>
        </section>

        <section className="content-section" id="projects">
          <div className="section-heading"><Clock3 size={20} /><div><h2>最近项目</h2><p>继续上次未完成的创作。</p></div></div>
          <article className="recent-project">
            <img src={commerceTools[1]?.image} alt="Aero H1 秋季上新" />
            <div><strong>Aero H1 秋季上新</strong><span>场景图 · 12 个资产</span></div>
            <time>刚刚</time>
            <Link href="/workbench?mode=commerce&task=scene">继续创作</Link>
          </article>
        </section>

        <section className="content-section" id="inspiration">
          <div className="section-heading"><Palette size={20} /><div><h2>发现灵感</h2><p>精选可复用的构图和视觉方向。</p></div></div>
          <div className="inspiration-grid">
            {inspiration.map(([title, category, image]) => (
              <article key={title}><img src={image} alt={title} /><strong>{title}</strong><span>{category}</span></article>
            ))}
          </div>
        </section>
        <div id="assets" />
      </main>
    </div>
  )
}
