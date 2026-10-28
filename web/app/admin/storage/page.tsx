'use client'

import { useCallback, useEffect, useState, type FormEvent, type ComponentProps } from 'react'
import { Save, ShieldCheck, Upload } from 'lucide-react'
import { AdminPageHeader } from '@/components/admin/page-header'
import { Alert, AlertDescription } from '@/components/admin/ui/alert'
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from '@/components/admin/ui/field'
import { Input } from '@/components/admin/ui/input'
import { Button } from '@/components/admin/ui/button'
import { LibrarySelect } from '@/components/library-controls'
import { useTransientMessage } from '@/hooks/use-transient-message'
import { adminRequest } from '@/lib/admin'

interface Profile {
  id: string
  name: string
  provider: string
  endpoint: string
  publicEndpoint: string
  region: string
  bucket: string
  prefix: string
  pathStyle: boolean
  cdnDomain: string
  cdnMode: string
  hasCredentials?: boolean
  hasCdnKey?: boolean
}
type Draft = Profile & { accessKey: string; secretKey: string; cdnKey: string }
const providers = [
  ['aliyun', '阿里云 OSS'],
  ['qiniu', '七牛云 Kodo'],
  ['tencent', '腾讯云 COS'],
  ['s3', 'S3 / MinIO'],
] as const
const fresh = (): Draft => ({
  id: '',
  name: '统一图片存储',
  provider: 'aliyun',
  endpoint: '',
  publicEndpoint: '',
  region: '',
  bucket: '',
  prefix: '',
  pathStyle: false,
  cdnDomain: '',
  cdnMode: 'public',
  accessKey: '',
  secretKey: '',
  cdnKey: '',
})
const hints: Record<string, string> = {
  aliyun: '如 cn-hangzhou；Endpoint 如 https://oss-cn-hangzhou.aliyuncs.com',
  qiniu: '使用七牛 S3 区域和服务域名，例如 cn-east-1、https://s3.cn-east-1.qiniucs.com',
  tencent: '如 ap-guangzhou；Endpoint 如 https://cos.ap-guangzhou.myqcloud.com，桶名包含 APPID',
  s3: '使用服务商提供的 S3 区域、Endpoint 和存储桶；MinIO 通常需要路径风格',
}
function StorageField({
  label,
  description,
  wide,
  ...props
}: ComponentProps<typeof Input> & {
  label: string
  description?: string
  wide?: boolean
}) {
  return (
    <Field className={wide ? 'storage-config-wide' : undefined}>
      <FieldLabel htmlFor={props.id}>{label}</FieldLabel>
      <Input {...props} aria-describedby={description ? `${props.id}-help` : undefined} />
      {description && <FieldDescription id={`${props.id}-help`}>{description}</FieldDescription>}
    </Field>
  )
}

export default function StoragePage() {
  const [draft, setDraft] = useState<Draft>(fresh)
  const [enabled, setEnabled] = useState(false)
  const [loading, setLoading] = useState(true)
  const [ready, setReady] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useTransientMessage()
  const load = useCallback(async () => {
    const data = await adminRequest<{ activeProfile: string; profiles: Profile[] }>('storage')
    const profile = data.profiles.find((p) => p.id === data.activeProfile) ?? data.profiles.at(-1)
    setDraft(profile ? { ...profile, accessKey: '', secretKey: '', cdnKey: '' } : fresh())
    setEnabled(data.activeProfile !== 'local')
    setReady(true)
  }, [])
  useEffect(() => {
    void load()
      .catch((reason) => setError(reason.message))
      .finally(() => setLoading(false))
  }, [load])
  const patch = (value: Partial<Draft>) => setDraft((previous) => ({ ...previous, ...value }))
  async function save(event: FormEvent) {
    event.preventDefault()
    setBusy(true)
    setError('')
    setMessage('')
    try {
      await adminRequest(
        'storage',
        'PUT',
        enabled ? { ...draft, enabled: true } : { enabled: false },
      )
      await load()
      setMessage('统一存储配置已保存，公共封面、上传和生成图片均使用当前配置。')
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '保存失败')
    } finally {
      setBusy(false)
    }
  }
  async function check() {
    setBusy(true)
    setError('')
    setMessage('')
    try {
      const result = await adminRequest<{ message: string }>('storage', 'POST', {
        ...draft,
        check: true,
      })
      setMessage(result.message)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '连接检查失败')
    } finally {
      setBusy(false)
    }
  }
  async function sync() {
    setBusy(true)
    setError('')
    setMessage('正在检查连接并同步本地图片…')
    try {
      let cursor = ''
      for (;;) {
        const result = await adminRequest<{
          total: number
          completed: number
          next: string
          done: boolean
        }>('storage', 'POST', { ...draft, sync: true, syncAfter: cursor })
        setMessage(`已同步 ${result.completed} / ${result.total} 张图片`)
        if (result.done) break
        cursor = result.next
      }
      setMessage('本地图片同步完成，可以保存并启用配置。原有本地文件继续保留。')
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '同步失败，可重新同步')
    } finally {
      setBusy(false)
    }
  }
  return (
    <main className="ops-page storage-admin">
      <AdminPageHeader title="图片存储" />
      {error && (
        <Alert variant="destructive">
          <AlertDescription>
            {error}
            {!ready && (
              <Button
                variant="outline"
                onClick={() =>
                  void load()
                    .then(() => setError(''))
                    .catch((reason) => setError(reason.message))
                }
              >
                重试
              </Button>
            )}
          </AlertDescription>
        </Alert>
      )}
      {message && (
        <p className="library-feedback" role="status">
          {message}
        </p>
      )}
      {loading && <p role="status">正在加载存储配置…</p>}
      <form className="ops-card storage-config-form" onSubmit={(event) => void save(event)}>
        <FieldSet disabled={busy || !ready}>
          <FieldLegend>统一 OSS / CDN 配置</FieldLegend>
          <FieldDescription>
            公共提示词库封面、用户上传、AI 生成图片和网站图片共用这一套配置。本地 uploads
            同时保留完整副本。
          </FieldDescription>
          <Field orientation="horizontal">
            <input
              id="storage-enabled"
              type="checkbox"
              checked={enabled}
              onChange={(event) => setEnabled(event.target.checked)}
            />
            <FieldLabel htmlFor="storage-enabled">启用 OSS 云存储</FieldLabel>
          </Field>
          <FieldSet disabled={!enabled}>
            <FieldGroup className="storage-config-grid">
              <Field>
                <FieldLabel>存储平台</FieldLabel>
                <LibrarySelect
                  label="存储平台"
                  value={draft.provider}
                  options={providers}
                  disabled={busy || !enabled || !ready}
                  onChange={(provider) =>
                    patch({
                      provider,
                      accessKey: '',
                      secretKey: '',
                      hasCredentials: false,
                      pathStyle: false,
                      cdnMode: 'public',
                    })
                  }
                />
              </Field>
              <StorageField
                id="storage-name"
                label="配置名称"
                required
                maxLength={100}
                value={draft.name}
                onChange={(event) => patch({ name: event.target.value })}
              />
              <StorageField
                id="storage-region"
                label="存储区域"
                required
                value={draft.region}
                onChange={(event) => patch({ region: event.target.value.trim() })}
              />
              <StorageField
                id="storage-bucket"
                label="存储桶 / 空间名称"
                required
                value={draft.bucket}
                onChange={(event) => patch({ bucket: event.target.value.trim() })}
              />
              <StorageField
                id="storage-endpoint"
                label="存储 Endpoint"
                wide
                required
                type="url"
                value={draft.endpoint}
                placeholder="https://…"
                description={hints[draft.provider]}
                onChange={(event) => patch({ endpoint: event.target.value.trim() })}
              />
              <StorageField
                id="storage-download"
                label="外网下载 Endpoint（可选）"
                wide
                type="url"
                value={draft.publicEndpoint}
                placeholder="读写使用内网时，填写对应外网 Endpoint"
                onChange={(event) => patch({ publicEndpoint: event.target.value.trim() })}
              />
              <StorageField
                id="storage-prefix"
                label="对象目录前缀（可选）"
                wide
                value={draft.prefix}
                placeholder="例如 uploads 或 istudio"
                description="将本地 uploads 目录里的内容放到此前缀下，保留 image/、user/、inspiration/ 等原目录结构。"
                onChange={(event) => patch({ prefix: event.target.value.trim() })}
              />
              {draft.provider !== 'aliyun' && (
                <Field orientation="horizontal" className="storage-config-wide">
                  <input
                    id="storage-path-style"
                    type="checkbox"
                    checked={draft.pathStyle}
                    onChange={(event) => patch({ pathStyle: event.target.checked })}
                  />
                  <FieldLabel htmlFor="storage-path-style">使用 S3 路径风格</FieldLabel>
                </Field>
              )}
              <StorageField
                id="storage-access"
                label="Access Key / SecretId"
                type="password"
                autoComplete="new-password"
                required={!draft.hasCredentials}
                value={draft.accessKey}
                placeholder={draft.hasCredentials ? '已保存，留空保留' : '填写访问密钥 ID'}
                onChange={(event) => patch({ accessKey: event.target.value.trim() })}
              />
              <StorageField
                id="storage-secret"
                label="Secret Key"
                type="password"
                autoComplete="new-password"
                required={!draft.hasCredentials}
                value={draft.secretKey}
                placeholder={draft.hasCredentials ? '已保存，留空保留' : '填写私有访问密钥'}
                onChange={(event) => patch({ secretKey: event.target.value.trim() })}
              />
            </FieldGroup>
            <details className="storage-cdn-settings" open={draft.cdnDomain ? true : undefined}>
              <summary>CDN 加速（可选）</summary>
              <FieldGroup className="storage-config-grid">
                <StorageField
                  id="storage-cdn"
                  label="CDN 域名"
                  wide
                  type="url"
                  value={draft.cdnDomain}
                  placeholder="https://img.example.com"
                  description={
                    draft.provider === 'qiniu'
                      ? '只填域名，不附加 uploads 等目录。七牛公开空间必须绑定 CDN 域名，S3 服务域名不支持匿名访问。'
                      : '只填域名，不附加 uploads 等目录；所有资源共用此域名。'
                  }
                  onChange={(event) => patch({ cdnDomain: event.target.value.trim() })}
                />
                <Field>
                  <FieldLabel>下载鉴权</FieldLabel>
                  <LibrarySelect
                    label="CDN 下载鉴权"
                    value={draft.cdnMode}
                    disabled={busy || !enabled || !ready}
                    options={
                      draft.provider === 'qiniu'
                        ? [
                            ['public', '公开直链'],
                            ['qiniu_private', '七牛私有下载凭证'],
                          ]
                        : [
                            ['public', '公开直链'],
                            ['aliyun_type_a', '阿里云 CDN 鉴权 A'],
                            ['tencent_type_a', '腾讯云 CDN 鉴权 A'],
                          ]
                    }
                    onChange={(cdnMode) => {
                      if (cdnMode) patch({ cdnMode })
                    }}
                  />
                </Field>
                {draft.cdnMode !== 'public' && draft.cdnMode !== 'qiniu_private' && (
                  <StorageField
                    id="storage-cdn-key"
                    label="CDN 鉴权密钥"
                    type="password"
                    autoComplete="new-password"
                    value={draft.cdnKey}
                    placeholder={draft.hasCdnKey ? '已保存，留空保留' : '与 CDN 控制台保持一致'}
                    onChange={(event) => patch({ cdnKey: event.target.value.trim() })}
                  />
                )}
                <FieldDescription className="storage-config-wide">
                  公开直链允许持有链接的人直接查看图片。私有下载需在云端启用相应鉴权；A 类有效期设为
                  300 秒。允许本站跨域 GET。
                </FieldDescription>
                {draft.cdnMode === 'public' && (
                  <FieldDescription className="storage-config-wide">
                    公开直链下，用户作品、上传原图和提示词封面使用同一套公开地址，任何拿到链接的人都能访问和转存；
                    已删除的图片在 CDN 缓存过期前仍可能访问，需立即下线时可在云端刷新缓存。
                  </FieldDescription>
                )}
              </FieldGroup>
            </details>
          </FieldSet>
        </FieldSet>
        <div className="dialog-actions">
          <Button
            variant="outline"
            type="button"
            disabled={busy || !enabled || !ready}
            onClick={(event) => {
              if (event.currentTarget.form?.reportValidity()) void sync()
            }}
          >
            <Upload data-icon="inline-start" />
            同步本地图片
          </Button>
          <Button
            variant="outline"
            type="button"
            disabled={busy || !enabled || !ready}
            onClick={(event) => {
              if (event.currentTarget.form?.reportValidity()) void check()
            }}
          >
            <ShieldCheck data-icon="inline-start" />
            检查连接
          </Button>
          <Button type="submit" disabled={busy || !ready}>
            <Save data-icon="inline-start" />
            {busy ? '处理中…' : '保存配置'}
          </Button>
        </div>
      </form>
      <Alert>
        <AlertDescription>
          <p>
            关闭 OSS 时，所有图片从本地 uploads 读取。启用后，新图片同时写入本地与
            OSS，图片通过同一套 OSS / CDN 配置访问。
          </p>
          <p>
            更换平台前，先将 uploads
            中的业务文件按原目录结构上传到新空间，再修改此处配置。历史图片也会切换，保存配置不会自动搬迁已有文件。密钥与内部配置文件无需上传。
          </p>
        </AlertDescription>
      </Alert>
    </main>
  )
}
