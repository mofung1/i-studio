'use client'

import { Info } from 'lucide-react'

import { optionLabel, platformOptions } from './shared'

interface ProductPlatformSelectorProps {
  value: string
  onChange: (value: string) => void
}

/** 目标平台：把原来的下拉换成一眼能扫完的选择控件，保持原有取值不变。 */
export function ProductPlatformSelector({ value, onChange }: ProductPlatformSelectorProps) {
  return (
    <div className="platform-selector">
      <div className="chip-grid" role="group" aria-label="目标平台">
        {platformOptions.map(([optionValue, label]) => (
          <button
            key={optionValue}
            type="button"
            aria-pressed={value === optionValue}
            className={value === optionValue ? 'selected' : ''}
            onClick={() => onChange(optionValue)}
          >
            {label}
          </button>
        ))}
      </div>
      <p className="field-helper">
        {value === 'smart'
          ? '由 AI 自动判断适配方向。'
          : <><Info size={12} aria-hidden="true" />已按「{optionLabel(platformOptions, value)}」生成适配要求。</>}
      </p>
    </div>
  )
}
