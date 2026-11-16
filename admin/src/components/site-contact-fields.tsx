'use client'

import type { ChangeEvent } from 'react'
import type { SiteBranding } from '@/lib/site-settings'

export function SiteContactFields({
  mode,
  text,
  qrSource,
  filename,
  disabled,
  onModeChange,
  onTextChange,
  onFileChange,
}: {
  mode: NonNullable<SiteBranding['contactMode']>
  text: string
  qrSource: string
  filename: string
  disabled: boolean
  onModeChange: (mode: NonNullable<SiteBranding['contactMode']>) => void
  onTextChange: (text: string) => void
  onFileChange: (event: ChangeEvent<HTMLInputElement>) => void
}) {
  return (
    <fieldset className="site-contact-fields" disabled={disabled}>
      <legend>前台联系方式</legend>
      <div className="site-contact-modes">
        {(
          [
            ['none', '不展示'],
            ['text', '显示文本'],
            ['qrcode', '二维码图片'],
          ] as const
        ).map(([value, label]) => (
          <label key={value}>
            <input
              type="radio"
              name="site-contact-mode"
              value={value}
              checked={mode === value}
              onChange={() => onModeChange(value)}
            />
            {label}
          </label>
        ))}
      </div>
      {mode === 'text' && (
        <label className="site-name-field">
          <span>联系文本</span>
          <textarea
            required
            maxLength={500}
            rows={4}
            value={text}
            onChange={(event) => onTextChange(event.target.value)}
            placeholder="例如：微信号、邮箱或其他联系方式"
          />
        </label>
      )}
      {mode === 'qrcode' && (
        <div className="site-contact-upload">
          <label className="site-name-field">
            <span>{qrSource ? '更换联系方式二维码' : '上传联系方式二维码'}</span>
            <input
              type="file"
              accept="image/png,image/jpeg"
              required={!qrSource}
              onChange={onFileChange}
              aria-describedby="site-contact-upload-help"
            />
          </label>
          <p className="site-field-help" id="site-contact-upload-help">
            PNG / JPG，最大 2 MB，尺寸不超过 4096 × 4096；保存后显示在前台个人中心。
          </p>
          {filename && <p className="site-logo-filename">已选择：{filename}</p>}
          {qrSource && (
            <img
              className="site-contact-qr"
              src={qrSource}
              width={208}
              height={208}
              alt="联系方式二维码预览"
            />
          )}
        </div>
      )}
    </fieldset>
  )
}
