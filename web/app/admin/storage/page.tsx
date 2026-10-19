'use client'
import { AdminPageHeader } from '@/components/admin/page-header'
import { Input } from '@/components/admin/ui/input'
import { Button } from '@/components/admin/ui/button'

import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { Cloud, HardDrive, Pencil, Plus, X } from 'lucide-react'
import { LibrarySelect } from '@/components/library-controls'
import { AdminEditorDialog as LibraryDialog } from '@/components/admin/editor-dialog'
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
  name: '',
  provider: 'aliyun',
  endpoint: '',
  publicEndpoint: '',
  region: '',
  bucket: '',
  prefix: '',
  pathStyle: false,
  cdnDomain: '',
  cdnMode: 'aliyun_type_a',
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
export default function StoragePage() {
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [active, setActive] = useState('local')
  const [draft, setDraft] = useState<Draft | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [editorError, setEditorError] = useState('')
  const [message, setMessage] = useState('')
  const load = useCallback(async () => {
    const data = await adminRequest<{ activeProfile: string; profiles: Profile[] }>('storage')
    setProfiles(data.profiles)
    setActive(data.activeProfile)
  }, [])
  useEffect(() => {
    void load()
      .catch((reason) => setError(reason.message))
      .finally(() => setLoading(false))
  }, [load])
  async function activate(id: string) {
    setBusy(true)
    setError('')
    setMessage('')
    try {
      await adminRequest('storage', 'PUT', { activeProfile: id })
      await load()
      setMessage('已切换新图片的存储位置，旧图片继续从原位置读取。')
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '切换失败')
    } finally {
      setBusy(false)
    }
  }
  async function save(event: FormEvent) {
    event.preventDefault()
    setBusy(true)
    setEditorError('')
    try {
      await adminRequest('storage', 'POST', draft)
      setDraft(null)
      await load()
      setMessage('存储配置已加密保存。确认云端访问权限和跨域设置后，可切换为默认存储。')
    } catch (reason) {
      setEditorError(reason instanceof Error ? reason.message : '保存失败')
    } finally {
      setBusy(false)
    }
  }
  const patch = (value: Partial<Draft>) =>
    setDraft((previous) => (previous ? { ...previous, ...value } : null))
  return (
    <main className="ops-page storage-admin">
      <AdminPageHeader
        title="图片存储"
        description="上传素材、生成作品和反推临时图共用存储配置，可随上线环境切换。"
        actions={
          <Button
            type="button"
            disabled={busy || loading}
            onClick={() => {
              setDraft(fresh())
              setEditorError('')
            }}
          >
            <Plus data-icon="inline-start" />
            添加存储
          </Button>
        }
      />
      {error && (
        <p className="settings-error" role="alert">
          {error}
          <Button
            variant="outline"
            type="button"
            onClick={() =>
              void load()
                .then(() => setError(''))
                .catch((reason) => setError(reason.message))
            }
          >
            重试
          </Button>
        </p>
      )}
      {message && (
        <p className="library-feedback" role="status">
          {message}
        </p>
      )}
      {loading ? (
        <p role="status">正在加载存储配置…</p>
      ) : (
        <div className="storage-profile-list">
          {[
            {
              id: 'local',
              name: '本地存储',
              provider: 'local',
              bucket: '服务器挂载卷',
              endpoint: '',
              region: '',
            },
            ...profiles,
          ].map((profile) => (
            <article
              key={profile.id}
              className={`storage-profile ${profile.id === active ? 'is-active' : ''}`}
            >
              <div className="storage-profile-icon">
                {profile.provider === 'local' ? <HardDrive size={23} /> : <Cloud size={23} />}
              </div>
              <div className="storage-profile-copy">
                <h2>
                  {profile.name}
                  {profile.id === active && <span>当前默认</span>}
                </h2>
                <p>
                  {profile.provider === 'local'
                    ? '无需云配置，原有本地图片始终保留访问。'
                    : `${providers.find(([id]) => id === profile.provider)?.[1]} · ${profile.bucket} · ${profile.region}`}
                </p>
                {profile.endpoint && <small>{profile.endpoint}</small>}
              </div>
              <div className="storage-profile-actions">
                {profile.id !== 'local' && (
                  <Button
                    variant="outline"
                    type="button"
                    className="studio-secondary"
                    disabled={busy}
                    onClick={() => {
                      setDraft({
                        ...(profile as Profile),
                        accessKey: '',
                        secretKey: '',
                        cdnKey: '',
                      })
                      setEditorError('')
                    }}
                  >
                    <Pencil data-icon="inline-start" />
                    编辑
                  </Button>
                )}
                <Button
                  variant="outline"
                  type="button"
                  className="studio-secondary"
                  disabled={busy || profile.id === active}
                  onClick={() => void activate(profile.id)}
                >
                  {profile.id === active ? '正在使用' : '设为默认'}
                </Button>
              </div>
            </article>
          ))}
        </div>
      )}
      <div className="storage-admin-note">
        <strong>切换与访问</strong>
        <p>
          默认存储只影响新文件。旧存储配置需保留，历史图片不会自动搬迁。配置保存不会连接云平台，也不会开通云服务。
        </p>
        <p>
          云端存储桶请设为私有；配置浏览器可访问的下载 Endpoint，并允许网站域名跨域 GET。CDN
          还需在云控制台配置私有回源及 URL 鉴权。
        </p>
      </div>
      {draft && (
        <LibraryDialog
          title={draft.id ? '编辑存储配置' : '添加存储配置'}
          onClose={() => {
            if (!busy) setDraft(null)
          }}
        >
          <form className="storage-config-form" onSubmit={(event) => void save(event)}>
            {editorError && (
              <p className="settings-error" role="alert">
                {editorError}
              </p>
            )}
            <div className="storage-config-grid">
              <label>
                配置名称
                <Input
                  required
                  maxLength={100}
                  value={draft.name}
                  onChange={(event) => patch({ name: event.target.value })}
                  placeholder="例如：生产图片存储"
                />
              </label>
              <label>
                存储平台
                <LibrarySelect
                  label="存储平台"
                  value={draft.provider}
                  disabled={!!draft.id}
                  options={providers}
                  onChange={(provider) =>
                    patch({
                      provider,
                      pathStyle: false,
                      cdnMode:
                        provider === 'qiniu'
                          ? 'qiniu_private'
                          : provider === 'tencent'
                            ? 'tencent_type_a'
                            : 'aliyun_type_a',
                    })
                  }
                />
              </label>
              <label>
                存储区域
                <Input
                  required
                  disabled={!!draft.id}
                  value={draft.region}
                  onChange={(event) => patch({ region: event.target.value.trim() })}
                />
              </label>
              <label>
                存储桶 / 空间名称
                <Input
                  required
                  disabled={!!draft.id}
                  value={draft.bucket}
                  onChange={(event) => patch({ bucket: event.target.value.trim() })}
                />
              </label>
              <label className="storage-config-wide">
                存储 Endpoint
                <Input
                  type="url"
                  required
                  disabled={!!draft.id}
                  value={draft.endpoint}
                  placeholder="https://…"
                  onChange={(event) => patch({ endpoint: event.target.value.trim() })}
                />
                <small>{hints[draft.provider]}</small>
              </label>
              <label className="storage-config-wide">
                外网下载 Endpoint <span>可选</span>
                <Input
                  type="url"
                  value={draft.publicEndpoint}
                  placeholder="内网读写时，请在这里填写同一存储的外网 Endpoint"
                  onChange={(event) => patch({ publicEndpoint: event.target.value.trim() })}
                />
              </label>
              <label>
                对象目录前缀 <span>可选</span>
                <Input
                  disabled={!!draft.id}
                  value={draft.prefix}
                  placeholder="例如 istudio"
                  onChange={(event) => patch({ prefix: event.target.value.trim() })}
                />
              </label>
              {draft.provider !== 'aliyun' && (
                <label className="storage-config-checkbox">
                  <input
                    type="checkbox"
                    disabled={!!draft.id}
                    checked={draft.pathStyle}
                    onChange={(event) => patch({ pathStyle: event.target.checked })}
                  />
                  使用 S3 路径风格
                </label>
              )}
              <label>
                Access Key / SecretId
                <Input
                  type="password"
                  autoComplete="new-password"
                  required={!draft.id}
                  value={draft.accessKey}
                  placeholder={draft.hasCredentials ? '已保存，留空保留' : '填写访问密钥 ID'}
                  onChange={(event) => patch({ accessKey: event.target.value.trim() })}
                />
              </label>
              <label>
                Secret Key
                <Input
                  type="password"
                  autoComplete="new-password"
                  required={!draft.id}
                  value={draft.secretKey}
                  placeholder={draft.hasCredentials ? '已保存，留空保留' : '填写私有访问密钥'}
                  onChange={(event) => patch({ secretKey: event.target.value.trim() })}
                />
              </label>
            </div>
            <details className="storage-cdn-settings">
              <summary>
                CDN 加速 <span>可选</span>
              </summary>
              <div className="storage-config-grid">
                <label className="storage-config-wide">
                  CDN 域名
                  <Input
                    type="url"
                    value={draft.cdnDomain}
                    placeholder="https://images.example.com"
                    onChange={(event) => patch({ cdnDomain: event.target.value.trim() })}
                  />
                </label>
                <label>
                  下载鉴权
                  <LibrarySelect
                    label="CDN 下载鉴权"
                    value={draft.cdnMode}
                    options={
                      draft.provider === 'qiniu'
                        ? [['qiniu_private', '七牛私有下载凭证']]
                        : [
                            ['aliyun_type_a', '阿里云 CDN 鉴权 A'],
                            ['tencent_type_a', '腾讯云 CDN 鉴权 A'],
                          ]
                    }
                    onChange={(cdnMode) => patch({ cdnMode })}
                  />
                </label>
                {draft.cdnMode !== 'qiniu_private' && (
                  <label>
                    CDN 鉴权密钥
                    <Input
                      type="password"
                      autoComplete="new-password"
                      value={draft.cdnKey}
                      placeholder={draft.hasCdnKey ? '已保存，留空保留' : '与 CDN 控制台保持一致'}
                      onChange={(event) => patch({ cdnKey: event.target.value.trim() })}
                    />
                  </label>
                )}
                <p className="storage-config-wide">
                  A 类鉴权的有效期请在 CDN 控制台设为 300
                  秒，使用默认签名参数。云端还需启用私有回源、配置 CORS，并让 CDN
                  缓存内容时始终校验下载签名。
                </p>
              </div>
            </details>
            {draft.id && (
              <p className="library-count">
                存储位置已固定。更换平台、桶或目录时请添加新配置，避免旧图片失效。
              </p>
            )}
            <footer className="asset-picker-footer">
              <Button
                variant="outline"
                type="button"
                className="studio-secondary"
                disabled={busy}
                onClick={() => setDraft(null)}
              >
                <X data-icon="inline-start" />
                取消
              </Button>
              <Button type="submit" disabled={busy}>
                {busy ? '保存中…' : '保存配置'}
              </Button>
            </footer>
          </form>
        </LibraryDialog>
      )}
    </main>
  )
}
