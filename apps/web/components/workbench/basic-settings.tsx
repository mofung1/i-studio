'use client'

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/select'

import { ratioOptions, styleOptions, type GeneralStyle, type WorkbenchMode } from './shared'

interface BasicSettingsProps {
  mode: WorkbenchMode
  style: GeneralStyle
  aspectRatio: string
  /** 电商模式下的出图量说明（由模块设置推导，只读展示） */
  outputSummary: string
  onSetStyle: (style: GeneralStyle) => void
  onSetAspectRatio: (ratio: string) => void
}

/** 默认只露出的核心参数：风格、比例，其余都收进高级设置。 */
export function BasicSettings({ mode, style, aspectRatio, outputSummary, onSetStyle, onSetAspectRatio }: BasicSettingsProps) {
  return (
    <fieldset className="form-section config-card">
      <div className="field-heading"><legend>基础参数</legend></div>
      <div className="settings-grid">
        {mode === 'general' && (
          <label className="settings-field">
            <span>创作风格</span>
            <Select value={style} onValueChange={(value) => onSetStyle(value as GeneralStyle)}>
              <SelectTrigger aria-label="创作风格"><SelectValue /></SelectTrigger>
              <SelectContent>
                {styleOptions.map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}
              </SelectContent>
            </Select>
          </label>
        )}
        <label className="settings-field">
          <span>尺寸比例</span>
          <Select value={aspectRatio} onValueChange={onSetAspectRatio}>
            <SelectTrigger aria-label="尺寸比例"><SelectValue /></SelectTrigger>
            <SelectContent>
              {ratioOptions.map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}
            </SelectContent>
          </Select>
        </label>
        {mode === 'commerce' && (
          <div className="settings-field">
            <span>预计出图</span>
            <span className="settings-value">{outputSummary}</span>
          </div>
        )}
      </div>
    </fieldset>
  )
}
