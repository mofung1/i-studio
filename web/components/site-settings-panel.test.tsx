// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { readSiteBranding } from '@/lib/site-settings'
import { saveSiteBranding } from '@/lib/admin-site-settings'
import { SiteSettingsPanel } from './site-settings-panel'

const state = vi.hoisted(() => ({ refresh: vi.fn(), updateBranding: vi.fn(), dirty: vi.fn() }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: state.refresh }) }))
vi.mock('./site-branding-provider', () => ({ useSiteBranding: () => state }))
vi.mock('@/lib/site-settings', async (original) => ({
  ...(await original<typeof import('@/lib/site-settings')>()),
  readSiteBranding: vi.fn(),
}))
vi.mock('@/lib/admin-site-settings', () => ({ saveSiteBranding: vi.fn() }))
let container: HTMLDivElement
let root: ReturnType<typeof createRoot>
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  vi.mocked(readSiteBranding).mockReset().mockResolvedValue({ name: 'iStudio', logoPath: '' })
  vi.mocked(saveSiteBranding).mockReset()
  state.updateBranding.mockReset()
  state.dirty.mockReset()
  vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:contact-preview')
  vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
})
afterEach(async () => {
  await act(async () => root.unmount())
  container.remove()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})
async function mode(value: string) {
  await act(async () =>
    container.querySelector<HTMLInputElement>(`input[value="${value}"]`)!.click(),
  )
}
async function submit() {
  await act(async () =>
    container
      .querySelector('form')!
      .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })),
  )
}
it('saves text contact, publishes the returned configuration and can turn contact off', async () => {
  await act(async () => root.render(<SiteSettingsPanel onDirtyChange={state.dirty} />))
  await mode('text')
  const textarea = container.querySelector('textarea')!
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!.call(
      textarea,
      '微信：studio\n邮箱：test@example.com',
    )
    textarea.dispatchEvent(new Event('input', { bubbles: true }))
  })
  const saved = {
    name: 'iStudio',
    logoPath: '',
    contactMode: 'text' as const,
    contactText: textarea.value,
  }
  vi.mocked(saveSiteBranding).mockResolvedValue(saved)
  await submit()
  expect(saveSiteBranding).toHaveBeenCalledWith('iStudio', null, false, {
    mode: 'text',
    text: textarea.value,
    qr: null,
  })
  expect(state.updateBranding).toHaveBeenCalledWith(saved)
  expect(state.dirty).toHaveBeenLastCalledWith(false)
  await mode('none')
  vi.mocked(saveSiteBranding).mockResolvedValue({ ...saved, contactMode: 'none', contactText: '' })
  await submit()
  expect(saveSiteBranding).toHaveBeenLastCalledWith(
    'iStudio',
    null,
    false,
    expect.objectContaining({ mode: 'none' }),
  )
  expect(container.querySelector('textarea')).toBeNull()
})
it('validates QR uploads and preserves a selected file for retry after a failed save', async () => {
  await act(async () => root.render(<SiteSettingsPanel onDirtyChange={state.dirty} />))
  await mode('qrcode')
  expect(container.querySelector<HTMLButtonElement>('button[type="submit"]')?.disabled).toBe(true)
  const input = container.querySelector<HTMLInputElement>(
    '.site-contact-upload input[type="file"]',
  )!
  async function select(file: File) {
    await act(async () => {
      Object.defineProperty(input, 'files', { configurable: true, value: [file] })
      input.dispatchEvent(new Event('change', { bubbles: true }))
    })
  }
  await select(new File(['<svg/>'], 'qr.svg', { type: 'image/svg+xml' }))
  expect(container.querySelector('[role="alert"]')?.textContent).toContain('PNG 或 JPG')
  expect(container.querySelector<HTMLButtonElement>('button[type="submit"]')?.disabled).toBe(true)
  const qr = new File(['png'], 'qr.png', { type: 'image/png' })
  await select(qr)
  expect(container.querySelector<HTMLButtonElement>('button[type="submit"]')?.disabled).toBe(false)
  vi.mocked(saveSiteBranding).mockRejectedValueOnce(new Error('保存失败，请重试'))
  await submit()
  expect(container.querySelector('[role="alert"]')?.textContent).toBe('保存失败，请重试')
  expect(container.textContent).toContain('qr.png')
  vi.mocked(saveSiteBranding).mockResolvedValue({
    name: 'iStudio',
    logoPath: '',
    contactMode: 'qrcode',
    contactQrPath: '/v1/site-settings/contact/qr.png',
  })
  await submit()
  expect(saveSiteBranding).toHaveBeenLastCalledWith('iStudio', null, false, {
    mode: 'qrcode',
    text: '',
    qr,
  })
  expect(
    container.querySelector<HTMLImageElement>('.site-contact-qr')?.getAttribute('src'),
  ).toContain('/v1/site-settings/contact/qr.png')
  expect(state.dirty).toHaveBeenLastCalledWith(false)
  expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:contact-preview')
})
