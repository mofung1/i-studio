'use client'

import { useEffect, useRef, useState, type FormEvent } from 'react'
import { LoaderCircle, RotateCcw, Save, Upload, X } from 'lucide-react'
import {
  defaultSiteBranding,
  readSiteBranding,
  siteLogoUrl,
  type SiteBranding,
} from '@/lib/site-settings'
import { saveSiteBranding } from '@/lib/admin-site-settings'
import { BrandLogo } from './brand'
import { useSiteBranding } from './site-branding-provider'

export function SiteSettingsPanel({ onDirtyChange }: { onDirtyChange: (dirty: boolean) => void }) {
  const { updateBranding } = useSiteBranding()
  const [original, setOriginal] = useState<SiteBranding | null>(null)
  const [name, setName] = useState('')
  const [logo, setLogo] = useState<File | null>(null)
  const [preview, setPreview] = useState('')
  const [removeLogo, setRemoveLogo] = useState(false)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState('')
  const [reload, setReload] = useState(0)
  const fileRef = useRef<HTMLInputElement>(null)
  const dirty =
    !!original && (name.trim() !== original.name || !!logo || (removeLogo && !!original.logoPath))

  useEffect(() => {
    const controller = new AbortController()
    setLoading(true)
    setError('')
    readSiteBranding(controller.signal)
      .then((settings) => {
        setOriginal(settings)
        setName(settings.name)
      })
      .catch((error) => {
        if (!controller.signal.aborted)
          setError(error instanceof Error ? error.message : '网站配置读取失败')
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false)
      })
    return () => controller.abort()
  }, [reload])

  useEffect(() => {
    if (!logo) {
      setPreview('')
      return
    }
    const url = URL.createObjectURL(logo)
    setPreview(url)
    return () => URL.revokeObjectURL(url)
  }, [logo])

  useEffect(() => {
    onDirtyChange(dirty)
  }, [dirty, onDirtyChange])
  useEffect(() => {
    if (!dirty) return
    const warnOnLeave = (event: BeforeUnloadEvent) => {
      event.preventDefault()
      event.returnValue = ''
    }
    window.addEventListener('beforeunload', warnOnLeave)
    return () => window.removeEventListener('beforeunload', warnOnLeave)
  }, [dirty])

  function chooseLogo(file?: File) {
    if (!file) return
    setSaved('')
    setError('')
    if (
      !['image/png', 'image/jpeg'].includes(file.type) ||
      file.size === 0 ||
      file.size > 2 * 1024 * 1024
    ) {
      setError('请选择不超过 2 MB 的 PNG 或 JPG 图片')
      return
    }
    setLogo(file)
    setRemoveLogo(false)
  }

  function restoreLogo() {
    setLogo(null)
    setRemoveLogo(true)
    setSaved('')
    setError('')
  }

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (saving || !dirty) return
    setSaving(true)
    setError('')
    setSaved('')
    try {
      const settings = await saveSiteBranding(name, logo, removeLogo)
      setOriginal(settings)
      setName(settings.name)
      setLogo(null)
      setRemoveLogo(false)
      updateBranding(settings)
      setSaved('网站配置已保存，全站品牌已更新')
    } catch (error) {
      setError(error instanceof Error ? error.message : '网站配置保存失败')
    } finally {
      setSaving(false)
    }
  }

  const logoSource = preview || (!removeLogo && original ? siteLogoUrl(original.logoPath) : '')
  return (
    <section id="site-panel" aria-labelledby="site-brand-heading" className="site-settings-panel">
      {loading ? (
        <div className="settings-loading" role="status">
          <LoaderCircle className="settings-spinner" size={20} />
          正在读取网站配置
        </div>
      ) : !original ? (
        <div>
          <p className="settings-error" role="alert">
            {error}
          </p>
          <button className="settings-command" onClick={() => setReload((value) => value + 1)}>
            重新读取
          </button>
        </div>
      ) : (
        <form onSubmit={submit} aria-busy={saving}>
          <div className="site-settings-heading">
            <div>
              <h2 id="site-brand-heading">网站品牌</h2>
              <p>设置网站名称和 Logo，应用到全站导航、网页标题和浏览器图标。</p>
            </div>
            {dirty && <span className="prompt-dirty-status">未保存更改</span>}
          </div>
          <fieldset disabled={saving} className="site-settings-fields">
            <div className="site-settings-editor">
              <label className="site-name-field" htmlFor="site-name">
                <span>网站名称</span>
                <input
                  id="site-name"
                  name="site-name"
                  required
                  maxLength={50}
                  autoComplete="off"
                  value={name}
                  onChange={(event) => {
                    setName(event.target.value)
                    setSaved('')
                    setError('')
                  }}
                  aria-describedby="site-name-help"
                />
              </label>
              <p id="site-name-help" className="site-field-help">
                1–50 个字符
              </p>
              <div className="site-logo-field">
                <span id="site-logo-label">网站 Logo</span>
                <div className="site-logo-controls">
                  <button
                    type="button"
                    className="settings-command"
                    aria-labelledby="site-logo-label site-logo-upload"
                    onClick={() => fileRef.current?.click()}
                  >
                    <Upload size={16} aria-hidden="true" />
                    <span id="site-logo-upload">{logoSource ? '更换图片' : '上传图片'}</span>
                  </button>
                  {logoSource && (
                    <button type="button" className="settings-command" onClick={restoreLogo}>
                      <X size={16} aria-hidden="true" />
                      恢复默认 Logo
                    </button>
                  )}
                </div>
                <input
                  ref={fileRef}
                  type="file"
                  className="site-logo-input"
                  aria-label="上传网站 Logo"
                  accept="image/png,image/jpeg"
                  onChange={(event) => {
                    chooseLogo(event.target.files?.[0])
                    event.target.value = ''
                  }}
                />
                <p className="site-field-help">
                  PNG / JPG，最大 2 MB；推荐使用正方形、透明底的 PNG。
                </p>
                {logo && <p className="site-logo-filename">已选择：{logo.name}</p>}
              </div>
            </div>
            <div className="site-brand-preview">
              <span>品牌预览</span>
              <div className="site-brand-preview-content">
                <BrandLogo src={logoSource} size={44} />
                <strong>{name.trim() || '网站名称'}</strong>
              </div>
              <p>图片会按原比例显示</p>
            </div>
          </fieldset>
          {error && (
            <p className="settings-error" role="alert">
              {error}
            </p>
          )}
          {saved && (
            <p className="settings-saved" role="status">
              {saved}
            </p>
          )}
          <div className="settings-form-actions">
            <button
              type="button"
              className="settings-command"
              disabled={saving}
              onClick={() => {
                setName(defaultSiteBranding.name)
                restoreLogo()
              }}
            >
              <RotateCcw size={16} aria-hidden="true" />
              恢复默认设置
            </button>
            <button
              type="submit"
              className="settings-primary"
              disabled={saving || !dirty || !name.trim()}
            >
              {saving ? (
                <LoaderCircle className="settings-spinner" size={16} aria-hidden="true" />
              ) : (
                <Save size={16} aria-hidden="true" />
              )}
              {saving ? '保存中' : '保存设置'}
            </button>
          </div>
        </form>
      )}
    </section>
  )
}
