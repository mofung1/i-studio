'use client'

import { DialogActions } from '@/components/dialog-actions'
import { useTransientMessage } from '@/hooks/use-transient-message'
import { useEffect, useRef, useState, type FormEvent } from 'react'
import { useRouter } from '@/routing/navigation'
import { LoaderCircle, RotateCcw, Save, Upload, X } from 'lucide-react'
import {
  defaultSiteBranding,
  readSiteBranding,
  siteLogoUrl,
  type SiteBranding,
} from '@/lib/site-settings'
import { saveSiteBranding } from '@/lib/admin-site-settings'
import { Alert, AlertDescription } from './admin/ui/alert'
import { Button } from './admin/ui/button'
import { Input } from './admin/ui/input'
import { BrandLogo } from './brand'
import { SiteContactFields } from './site-contact-fields'
import { useSiteBranding } from './site-branding-provider'
import styles from './admin/settings-forms.module.css'

export function SiteSettingsPanel({
  onDirtyChange,
}: { onDirtyChange?: (dirty: boolean) => void } = {}) {
  const router = useRouter()
  const { updateBranding } = useSiteBranding()
  const [original, setOriginal] = useState<SiteBranding | null>(null)
  const [name, setName] = useState('')
  const [logo, setLogo] = useState<File | null>(null)
  const [preview, setPreview] = useState('')
  const [removeLogo, setRemoveLogo] = useState(false)
  const [contactMode, setContactMode] = useState<NonNullable<SiteBranding['contactMode']>>('none')
  const [contactText, setContactText] = useState('')
  const [contactQr, setContactQr] = useState<File | null>(null)
  const [contactPreview, setContactPreview] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [saved, setSaved] = useTransientMessage()
  const [reload, setReload] = useState(0)
  const fileRef = useRef<HTMLInputElement>(null)
  const dirty =
    !!original &&
    (name.trim() !== original.name ||
      !!logo ||
      (removeLogo && !!original.logoPath) ||
      contactMode !== (original.contactMode ?? 'none') ||
      (contactMode === 'text' && contactText.trim() !== (original.contactText ?? '')) ||
      (contactMode === 'qrcode' && !!contactQr))

  useEffect(() => {
    const controller = new AbortController()
    setLoading(true)
    setError('')
    readSiteBranding(controller.signal)
      .then((settings) => {
        setOriginal(settings)
        setName(settings.name)
        setContactMode(settings.contactMode ?? 'none')
        setContactText(settings.contactText ?? '')
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
    if (!contactQr) {
      setContactPreview('')
      return
    }
    const url = URL.createObjectURL(contactQr)
    setContactPreview(url)
    return () => URL.revokeObjectURL(url)
  }, [contactQr])

  useEffect(() => {
    onDirtyChange?.(dirty)
  }, [dirty, onDirtyChange])

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
      const settings = await saveSiteBranding(name, logo, removeLogo, {
        mode: contactMode,
        text: contactText,
        qr: contactQr,
      })
      setOriginal(settings)
      setName(settings.name)
      setLogo(null)
      setRemoveLogo(false)
      setContactMode(settings.contactMode ?? 'none')
      setContactText(settings.contactText ?? '')
      setContactQr(null)
      updateBranding(settings)
      router.refresh()
      setSaved('网站配置已保存')
    } catch (error) {
      setError(error instanceof Error ? error.message : '网站配置保存失败')
    } finally {
      setSaving(false)
    }
  }

  const contactSource =
    contactPreview || (original ? siteLogoUrl(original.contactQrPath ?? '') : '')
  const logoSource = preview || (!removeLogo && original ? siteLogoUrl(original.logoPath) : '')
  return (
    <section
      id="site-panel"
      aria-labelledby="site-brand-heading"
      className={`site-settings-panel ${styles.sitePanel}`}
    >
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
          <Button variant="outline" onClick={() => setReload((value) => value + 1)}>
            重新读取
          </Button>
        </div>
      ) : (
        <form onSubmit={submit} aria-busy={saving} className={styles.siteForm}>
          <section className={styles.siteSection} aria-labelledby="site-brand-heading">
            <div className="site-settings-heading">
              <div>
                <h2 id="site-brand-heading">网站品牌</h2>
                <p>名称与 Logo 用于全站导航、网页标题和浏览器图标。</p>
              </div>
              {dirty && <span className="prompt-dirty-status">未保存更改</span>}
            </div>
            <fieldset disabled={saving} className="site-settings-fields">
              <div className="site-settings-editor">
                <label className="site-name-field" htmlFor="site-name">
                  <span>网站名称</span>
                  <Input
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
                    <Button
                      type="button"
                      variant="outline"
                      aria-labelledby="site-logo-label site-logo-upload"
                      onClick={() => fileRef.current?.click()}
                    >
                      <Upload size={16} aria-hidden="true" />
                      <span id="site-logo-upload">{logoSource ? '更换图片' : '上传图片'}</span>
                    </Button>
                    {logoSource && (
                      <Button type="button" variant="outline" onClick={restoreLogo}>
                        <X size={16} aria-hidden="true" />
                        恢复默认 Logo
                      </Button>
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
              </div>
            </fieldset>
          </section>
          <section className={styles.siteSection} aria-labelledby="site-contact-heading">
            <h2 id="site-contact-heading">联系方式</h2>
            <p>联系方式显示在前台个人中心。</p>
            <SiteContactFields
              mode={contactMode}
              text={contactText}
              qrSource={contactSource}
              filename={contactQr?.name ?? ''}
              disabled={saving}
              onModeChange={(value) => {
                setContactMode(value)
                setSaved('')
                setError('')
              }}
              onTextChange={(value) => {
                setContactText(value)
                setSaved('')
                setError('')
              }}
              onFileChange={(event) => {
                const file = event.target.files?.[0]
                event.target.value = ''
                if (!file) return
                setSaved('')
                if (
                  !['image/png', 'image/jpeg'].includes(file.type) ||
                  file.size === 0 ||
                  file.size > 2 * 1024 * 1024
                ) {
                  setError('请选择不超过 2 MB 的 PNG 或 JPG 二维码图片')
                  return
                }
                setError('')
                setContactQr(file)
              }}
            />
          </section>
          {error && (
            <Alert variant="destructive" className="settings-error" role="alert">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          {saved && (
            <Alert className="settings-saved" role="status">
              <AlertDescription>{saved}</AlertDescription>
            </Alert>
          )}
          <footer className={styles.siteFooter}>
            <p role="status">{dirty ? '有未保存更改，保存后应用到全站。' : '当前设置已同步。'}</p>
            <DialogActions className="settings-form-actions">
              <Button
                type="button"
                variant="outline"
                disabled={saving}
                onClick={() => {
                  setName(defaultSiteBranding.name)
                  restoreLogo()
                  setContactMode('none')
                  setContactText('')
                  setContactQr(null)
                }}
              >
                <RotateCcw size={16} aria-hidden="true" />
                恢复默认设置
              </Button>
              <Button
                type="submit"
                disabled={
                  saving ||
                  !dirty ||
                  !name.trim() ||
                  (contactMode === 'text' && !contactText.trim()) ||
                  (contactMode === 'qrcode' && !contactSource)
                }
              >
                {saving ? (
                  <LoaderCircle className="settings-spinner" size={16} aria-hidden="true" />
                ) : (
                  <Save size={16} aria-hidden="true" />
                )}
                {saving ? '保存中' : '保存设置'}
              </Button>
            </DialogActions>
          </footer>
        </form>
      )}
    </section>
  )
}
