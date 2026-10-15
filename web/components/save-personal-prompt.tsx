'use client'

import { BookMarked, Check } from 'lucide-react'
import { useEffect, useState } from 'react'
import { PersonalPromptEditor, type PersonalPromptSeed } from './personal-prompt-editor'
import { AccountAccess } from './account-access'
import { useAccount } from './account-provider'
import { LibraryDialog } from './library-controls'

export function SavePersonalPrompt({
  seed,
  className = 'studio-secondary',
  iconOnly = false,
  disabled = false,
  portalContainer,
}: {
  disabled?: boolean
  portalContainer?: HTMLElement | null
  seed: PersonalPromptSeed
  className?: string
  iconOnly?: boolean
}) {
  const { account } = useAccount()
  const [open, setOpen] = useState(false)
  const [saved, setSaved] = useState(false)
  useEffect(() => setSaved(false), [seed.prompt, seed.title])
  return (
    <>
      <button
        type="button"
        className={className}
        disabled={disabled || (!seed.prompt.trim() && !seed.config)}
        aria-label={saved ? '已保存到我的提示词' : '保存到我的提示词'}
        title={saved ? '已保存到我的提示词' : '保存到我的提示词'}
        onClick={() => {
          setOpen(true)
        }}
      >
        {saved ? (
          <Check size={15} aria-hidden="true" />
        ) : (
          <BookMarked size={15} aria-hidden="true" />
        )}
        {!iconOnly && (saved ? '已保存' : '存为私有提示词')}
      </button>
      {open && !account.authenticated && (
        <LibraryDialog
          title="保存到我的提示词"
          onClose={() => setOpen(false)}
          portalContainer={portalContainer}
        >
          <AccountAccess
            compact
            title="登录后保存私有提示词"
            description="收藏当前描述，下次创作时可以直接使用。"
          />
        </LibraryDialog>
      )}
      {open && account.authenticated && (
        <PersonalPromptEditor
          portalContainer={portalContainer}
          seed={seed}
          onClose={() => setOpen(false)}
          onSaved={() => {
            setSaved(true)
            setOpen(false)
          }}
        />
      )}
    </>
  )
}
