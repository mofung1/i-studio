'use client'

import { Button } from '@appica/ui-react/button'
import { Textarea } from '@appica/ui-react/textarea'
import { ArrowRight, Images, Layers3, Maximize, Send, Sparkles, WandSparkles } from 'lucide-react'
import Link from 'next/link'
import { useRef, useState, type KeyboardEvent, type ReactNode } from 'react'

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/select'

const promptSuggestions = ['Luxury product shot', 'Minimal studio', 'Lifestyle campaign', 'Summer campaign']

interface ComposerSelectProps {
  label: string
  value: string
  onChange: (value: string) => void
  icon: ReactNode
  options: ReadonlyArray<readonly [string, string]>
  className?: string
}

function ComposerSelect({ label, value, onChange, icon, options, className = '' }: ComposerSelectProps) {
  return (
    <Select value={value} onValueChange={onChange} alignItemWithTrigger={false}>
      <SelectTrigger className={`ist-select ${className}`} aria-label={label} startSlot={icon}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {options.map(([optionValue, optionLabel]) => (
          <SelectItem key={optionValue} value={optionValue}>{optionLabel}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

export function CreativeCommandBar() {
  const formRef = useRef<HTMLFormElement>(null)
  const [prompt, setPrompt] = useState('为一款极简腕表生成一套高级电商视觉，包含主图、生活场景和广告素材。')
  const [model, setModel] = useState('gpt-image-2')
  const [ratio, setRatio] = useState('1:1')
  const [resolution, setResolution] = useState('2K')
  const [count, setCount] = useState('1')

  function handleShortcut(event: KeyboardEvent<HTMLTextAreaElement>) {
    if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
      event.preventDefault()
      formRef.current?.requestSubmit()
    }
  }

  return (
    <section className="ist-command-section" id="generator" aria-labelledby="generator-title">
      <div className="ist-section-heading ist-command-heading">
        <span className="ist-section-kicker">Creative Command</span>
        <h2 id="generator-title">What do you want<br />to create?</h2>
        <p>告诉 iStudio 你的商品、场景和目标，剩下的交给 Agent。</p>
      </div>

      <form className="ist-command-bar" action="/workbench" ref={formRef}>
        <input type="hidden" name="mode" value="general" />
        <input type="hidden" name="model" value={model} />
        <input type="hidden" name="aspectRatio" value={ratio} />
        <input type="hidden" name="resolution" value={resolution} />
        <input type="hidden" name="count" value={count} />

        <div className="ist-command-head">
          <span><i /><WandSparkles size={14} />创作描述</span>
          <kbd>⌘ ↵</kbd>
        </div>
        <Textarea
          aria-label="创作描述"
          className="ist-command-input"
          name="prompt"
          onChange={(event) => setPrompt(event.target.value)}
          onKeyDown={handleShortcut}
          rows={3}
          value={prompt}
          variant="soft"
        />

        <div className="ist-prompt-suggestions" aria-label="推荐提示词">
          {promptSuggestions.map((suggestion) => (
            <button type="button" key={suggestion} onClick={() => setPrompt(suggestion)}>{suggestion}</button>
          ))}
        </div>

        <div className="ist-command-footer">
          <div className="ist-command-controls">
            <ComposerSelect className="ist-model-select" label="生图模型" value={model} onChange={setModel} icon={<Sparkles size={14} />} options={[['gpt-image-2', 'GPT Image 2'], ['gemini-2.5-flash-image', 'Gemini 2.5 Flash'], ['gemini-3.1-flash-image', 'Gemini 3.1 Flash'], ['gemini-3-pro-image', 'Gemini 3 Pro Image']]} />
            <ComposerSelect label="画面比例" value={ratio} onChange={setRatio} icon={<Maximize size={15} />} options={[['1:1', '1:1'], ['3:4', '3:4'], ['4:3', '4:3'], ['9:16', '9:16'], ['16:9', '16:9']]} />
            <ComposerSelect label="清晰度" value={resolution} onChange={setResolution} icon={<Images size={15} />} options={[['1K', '1K'], ['2K', '2K'], ['4K', '4K']]} />
            <ComposerSelect label="生成数量" value={count} onChange={setCount} icon={<Layers3 size={15} />} options={Array.from({ length: 16 }, (_, index) => [String(index + 1), `${index + 1} 张`] as const)} />
          </div>
          <div className="ist-command-actions">
            <Link href="/inspire">浏览灵感 <ArrowRight size={14} /></Link>
            <Button className="ist-generate-button" type="submit"><span>生成视觉</span><Send size={16} /></Button>
          </div>
        </div>
      </form>
    </section>
  )
}

