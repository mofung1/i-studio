'use client'

import { BookMarked, Check } from 'lucide-react'
import { useEffect, useState } from 'react'
import { PersonalPromptEditor, type PersonalPromptSeed } from './personal-prompt-editor'
import { getAccessToken } from '@/lib/api'

export function SavePersonalPrompt({ seed, className = 'studio-secondary', iconOnly = false, disabled = false, portalContainer }: { disabled?: boolean; portalContainer?: HTMLElement | null; seed: PersonalPromptSeed; className?: string; iconOnly?: boolean }) {
  const [open, setOpen] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')
  useEffect(() => setSaved(false), [seed.prompt, seed.title])
  return <>
    <button type="button" className={className} disabled={disabled || (!seed.prompt.trim() && !seed.config)} aria-label={saved ? '已保存到我的提示词' : '保存到我的提示词'} title={saved ? '已保存到我的提示词' : '保存到我的提示词'} onClick={() => { if (!getAccessToken()) { setError('登录后可保存到自己的提示词库'); return }; setError(''); setOpen(true) }}>{saved ? <Check size={15} aria-hidden="true" /> : <BookMarked size={15} aria-hidden="true" />}{!iconOnly && (saved ? '已保存' : '存为私有提示词')}</button>
    {error && <span className="personal-inline-error" role="alert">{error}</span>}
    {open && <PersonalPromptEditor portalContainer={portalContainer} seed={seed} onClose={() => setOpen(false)} onSaved={() => { setSaved(true); setOpen(false) }} />}
  </>
}
