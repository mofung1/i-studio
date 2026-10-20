// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { expect, it, vi } from 'vitest'
import { SiteBrandingProvider, useSiteBranding } from './site-branding-provider'

function UpdateBrand() {
  const { updateBranding } = useSiteBranding()
  return <button onClick={() => updateBranding({ name: '新品牌', logoPath: '' })}>保存品牌</button>
}

it('keeps route-specific titles intact when branding mounts or changes', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  document.title = 'AI 产品图片精修工具 | iStudio'
  const container = document.createElement('div')
  const root = createRoot(container)
  try {
    await act(async () =>
      root.render(
        <SiteBrandingProvider initialBranding={{ name: 'iStudio', logoPath: '' }}>
          <UpdateBrand />
        </SiteBrandingProvider>,
      ),
    )
    expect(document.title).toBe('AI 产品图片精修工具 | iStudio')
    await act(async () => container.querySelector('button')!.click())
    expect(document.title).toBe('AI 产品图片精修工具 | iStudio')
  } finally {
    await act(async () => root.unmount())
    localStorage.clear()
    vi.unstubAllGlobals()
  }
})
