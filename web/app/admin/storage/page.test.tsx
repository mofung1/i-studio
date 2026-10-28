// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { beforeEach, afterEach, it, expect, vi } from 'vitest'
import Page from './page'
import { adminRequest } from '@/lib/admin'

vi.mock('@/lib/admin', () => ({ adminRequest: vi.fn() }))
vi.mock('@/components/library-controls', () => ({
  LibrarySelect: ({
    label,
    value,
    options,
    onChange,
    disabled,
  }: {
    label: string
    value: string
    options: [string, string][]
    onChange: (value: string) => void
    disabled: boolean
  }) => (
    <select
      aria-label={label}
      value={value}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value)}
    >
      {options.map(([id, name]) => (
        <option key={id} value={id}>
          {name}
        </option>
      ))}
    </select>
  ),
}))
const profile = {
  id: 'shared',
  name: '统一存储',
  provider: 'qiniu',
  region: 'cn-south-1',
  bucket: 'old-bucket',
  endpoint: 'https://s3.example.com',
  publicEndpoint: '',
  prefix: 'uploads',
  pathStyle: false,
  cdnDomain: 'https://img.example.com',
  cdnMode: 'qiniu_private',
  hasCredentials: true,
  accessKey: 'fixture-access',
  secretKey: 'fixture-secret',
  cdnKey: 'fixture-cdn',
}
let host: HTMLDivElement, root: Root
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  vi.mocked(adminRequest)
    .mockReset()
    .mockResolvedValue({ activeProfile: 'shared', profiles: [profile] })
  host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
})
afterEach(async () => {
  await act(async () => root.unmount())
  host.remove()
  vi.unstubAllGlobals()
})
function button(label: string) {
  return Array.from(host.querySelectorAll('button')).find((b) => b.textContent?.includes(label))!
}
it('edits the same configuration for historical covers and user images', async () => {
  await act(async () => root.render(<Page />))
  expect(host.querySelectorAll('form')).toHaveLength(1)
  expect(host.textContent).toContain('公共提示词库封面、用户上传、AI 生成图片')
  expect(host.textContent).not.toContain('添加存储')
  const bucket = host.querySelector<HTMLInputElement>('#storage-bucket')!
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(
      bucket,
      'new-bucket',
    )
    bucket.dispatchEvent(new Event('input', { bubbles: true }))
  })
  await act(async () =>
    host
      .querySelector('form')!
      .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })),
  )
  expect(adminRequest).toHaveBeenCalledWith(
    'storage',
    'PUT',
    expect.objectContaining({
      id: 'shared',
      bucket: 'new-bucket',
      enabled: true,
      accessKey: 'fixture-access',
      secretKey: 'fixture-secret',
    }),
  )
})

it('shows saved storage credentials as plain text in separate settings sections', async () => {
  await act(async () => root.render(<Page />))
  const access = host.querySelector<HTMLInputElement>('#storage-access')!
  const secret = host.querySelector<HTMLInputElement>('#storage-secret')!
  expect(access.type).toBe('text')
  expect(secret.type).toBe('text')
  expect(access.value).toBe('fixture-access')
  expect(secret.value).toBe('fixture-secret')
  expect(host.textContent).toContain('存储连接')
  expect(host.textContent).toContain('访问密钥')
  expect(host.querySelectorAll('[data-slot="card"]')).toHaveLength(4)
})
it('checks the draft without enabling it, and can restore all images to local storage', async () => {
  await act(async () => root.render(<Page />))
  await act(async () => button('检查连接').click())
  expect(adminRequest).toHaveBeenCalledWith(
    'storage',
    'POST',
    expect.objectContaining({ check: true, id: 'shared' }),
  )
  expect(vi.mocked(adminRequest).mock.calls.filter((c) => c[1] === 'PUT')).toHaveLength(0)
  await act(async () => host.querySelector<HTMLInputElement>('#storage-enabled')!.click())
  await act(async () =>
    host
      .querySelector('form')!
      .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })),
  )
  expect(adminRequest).toHaveBeenCalledWith('storage', 'PUT', { enabled: false })
})
it('warns that public direct links are readable by anyone', async () => {
  await act(async () => root.render(<Page />))
  const select = host.querySelector<HTMLSelectElement>('select[aria-label="CDN 下载鉴权"]')!
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')!.set!.call(
      select,
      'public',
    )
    select.dispatchEvent(new Event('change', { bubbles: true }))
  })
  expect(host.textContent).toContain('任何拿到链接的人都能访问和转存')
})
