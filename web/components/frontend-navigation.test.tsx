// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { WorkbenchRail } from './workbench/workbench-rail'
import { AccountMenu } from './account-menu'
import { WorkbenchHeader } from './workbench/workbench-header'
import { CreatorPanel } from './workbench/creator-panel'
import CommercePage from '@/app/commerce/page'

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }))
vi.mock('./theme-toggle', () => ({ ThemeToggle: () => <button>主题</button> }))
vi.mock('./account-provider', () => ({
  useAccount: () => ({
    account: {
      authenticated: true,
      user: { id: 'creator', username: 'creator' },
      available: 125,
      creditName: '积分',
    },
    loading: false,
  }),
}))
let host: HTMLDivElement
let root: ReturnType<typeof createRoot>
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  localStorage.clear()
  host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
})
afterEach(async () => {
  await act(async () => root.unmount())
  host.remove()
  vi.unstubAllGlobals()
})
it('retains the project through the commerce overview, clothing entry and workbench breadcrumb', async () => {
  const projectId = '商品项目 & 01'
  await act(async () => root.render(<WorkbenchRail section="general" projectId={projectId} />))
  const overview = new URL(host.querySelector<HTMLAnchorElement>('[aria-label="电商工具"]')!.href)
  expect(overview.pathname).toBe('/commerce')
  expect(overview.searchParams.get('projectId')).toBe(projectId)

  const page = await CommercePage({
    searchParams: Promise.resolve({ projectId: overview.searchParams.get('projectId')! }),
  })
  await act(async () => root.render(page))
  const tools = [...host.querySelectorAll<HTMLAnchorElement>('main a[href^="/studio?"]')]
  expect(tools.length).toBeGreaterThanOrEqual(5)
  for (const tool of tools) expect(new URL(tool.href).searchParams.get('projectId')).toBe(projectId)
  const clothing = new URL(
    host.querySelector<HTMLAnchorElement>('main a[aria-label="进入服装组图"]')!.href,
  )
  expect(clothing.searchParams.get('task')).toBe('clothing-set')

  await act(async () =>
    root.render(
      <WorkbenchHeader
        mode="commerce"
        task="clothing-set"
        projectId={clothing.searchParams.get('projectId')}
        panelOpen={false}
        historyOpen={false}
        onShowDetails={() => {}}
        onToggleHistory={() => {}}
        onTogglePanel={() => {}}
      />,
    ),
  )
  const breadcrumb = host.querySelector<HTMLAnchorElement>(
    '.studio-breadcrumb a[href^="/commerce"]',
  )!
  expect(new URL(breadcrumb.href).searchParams.get('projectId')).toBe(projectId)
  const projectLink = host.querySelector<HTMLAnchorElement>(
    '[aria-label="查看当前项目的素材与作品"]',
  )!
  expect(new URL(projectLink.href).searchParams.get('project')).toBe(projectId)
  expect(projectLink.textContent).toBe('当前项目')
})

it('does not introduce a project into ordinary commerce browsing', async () => {
  await act(async () => root.render(await CommercePage({ searchParams: Promise.resolve({}) })))
  for (const tool of host.querySelectorAll<HTMLAnchorElement>('main a[href^="/studio?"]'))
    expect(new URL(tool.href).searchParams.has('projectId')).toBe(false)
  expect(host.querySelector('[aria-label="查看当前项目的素材与作品"]')).toBeNull()
})
it.each(['assets', 'history'] as const)(
  'offers a new creation from the %s sidebar',
  async (section) => {
    await act(async () => root.render(<WorkbenchRail section={section} />))
    const create = host.querySelector('a[aria-label="新建创作"]')
    expect(create?.getAttribute('href')).toBe('/studio?mode=general')
    expect(host.querySelector('a[aria-current="page"]')?.getAttribute('aria-label')).toBe(
      '我的资产',
    )
  },
)
it('links to the focusable settings region on mobile and keeps the desktop disclosure', async () => {
  const toggle = vi.fn()
  const render = (jumpToSettings: boolean) => (
    <>
      <WorkbenchHeader
        mode="commerce"
        task="product-main"
        panelOpen
        jumpToSettings={jumpToSettings}
        historyOpen={false}
        onShowDetails={() => {}}
        onToggleHistory={() => {}}
        onTogglePanel={toggle}
      />
      <CreatorPanel
        className="commerce-settings"
        side="left"
        collapsed={false}
        notice={null}
        isSubmitting={false}
        isGenerating={false}
      >
        <button>上传商品原图</button>
      </CreatorPanel>
    </>
  )
  await act(async () => root.render(render(true)))
  const jump = host.querySelector<HTMLAnchorElement>('a[href="#creation-settings"]')!
  expect(jump.textContent).toBe('跳到创作设置')
  expect(jump.hasAttribute('aria-expanded')).toBe(false)
  const settings = host.querySelector<HTMLElement>(jump.hash)!
  expect(settings.getAttribute('aria-label')).toBe('创作设置')
  expect(settings.getAttribute('tabindex')).toBe('-1')

  await act(async () => root.render(render(false)))
  expect(host.querySelector('a[href="#creation-settings"]')).toBeNull()
  const disclosure = host.querySelector<HTMLButtonElement>(
    'button[aria-controls="creation-settings"]',
  )!
  expect(disclosure.getAttribute('aria-expanded')).toBe('true')
  await act(async () => disclosure.click())
  expect(toggle).toHaveBeenCalledTimes(1)
})
it.each([
  {
    tool: '商品主图',
    title: '商品上架套图',
    task: 'product-main',
    id: 'product-main-trio',
    ratio: '1:1',
    outputs: ['白底主图', '场景主图', '细节主图'],
    action: '用我的商品做同款',
  },
  {
    tool: '商品详情',
    title: '商品详情套图',
    task: 'detail-page',
    id: 'detail-page-trio',
    ratio: '3:4',
    outputs: ['首屏主视觉', '材质纹理图', '场景应用图'],
    action: '用我的商品做同款（商品详情套图）',
  },
  {
    tool: '服装组图',
    title: '模特上身套图',
    task: 'clothing-set',
    id: 'clothing-model-duo',
    ratio: '3:4',
    outputs: ['正面上身图', '侧面上身图'],
    action: '用我的商品做同款（模特上身套图）',
  },
])(
  'links the $tool case photos, description and action to the same project recipe',
  async (example) => {
    const projectId = '项目 A'
    await act(async () =>
      root.render(await CommercePage({ searchParams: Promise.resolve({ projectId }) })),
    )
    const ordinary = host.querySelector<HTMLAnchorElement>(`a[aria-label="进入${example.tool}"]`)!
    const card = ordinary.closest('article')!
    const title = card.querySelector('h3')!
    expect(title.textContent).toContain(example.title)
    expect(title.textContent).toContain(example.ratio)
    const recipe = title.closest('a')!
    expect(Object.fromEntries(new URL(recipe.href).searchParams)).toEqual({
      mode: 'commerce',
      task: example.task,
      recipe: example.id,
      projectId,
    })
    const gallery = card.querySelector('[aria-label="案例原图与生成效果"]')!
    const captions = [...gallery.querySelectorAll('figcaption')]
    expect(captions.map((caption) => caption.textContent)).toEqual([
      example.task === 'clothing-set' ? '服装原图' : '商品原图',
      ...example.outputs,
    ])
    const images = [...gallery.querySelectorAll('img')]
    expect(images).toHaveLength(captions.length)
    for (const image of images) {
      const url = new URL(image.src)
      expect(url.searchParams.get('url') ?? url.pathname).toMatch(
        `/images/commerce/recipes/${example.task}-`,
      )
      expect(image.closest('a')).toBe(recipe)
    }
    expect(card.querySelector(`#${example.task}-recipe-description`)?.closest('a')).toBe(recipe)
    const action = document.getElementById(recipe.getAttribute('aria-labelledby')!)
    expect(action?.textContent?.trim()).toBe(example.action)
    expect(action?.closest('a')).toBe(recipe)
    expect(new URL(ordinary.href).searchParams.has('recipe')).toBe(false)
  },
)
it('closes mobile navigation after switching a task or pressing Escape and returns focus to the toggle', async () => {
  const changeTask = vi.fn()
  await act(async () =>
    root.render(<WorkbenchRail section="commerce" task="product-main" onChangeTask={changeTask} />),
  )
  const toggle = host.querySelector<HTMLButtonElement>('.studio-mobile-navigation-toggle')!
  await act(async () => toggle.click())
  expect(toggle.getAttribute('aria-expanded')).toBe('true')
  await act(async () => host.querySelector<HTMLButtonElement>('[aria-label="商品详情"]')!.click())
  expect(changeTask).toHaveBeenCalledExactlyOnceWith('detail-page')
  expect(toggle.getAttribute('aria-expanded')).toBe('false')
  expect(document.activeElement).toBe(toggle)
  await act(async () => toggle.click())
  await act(async () =>
    host
      .querySelector('nav')!
      .dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })),
  )
  expect(toggle.getAttribute('aria-expanded')).toBe('false')
  expect(document.activeElement).toBe(toggle)
})
it('closes mobile navigation when focus or a pointer moves outside and preserves the desktop rail preference', async () => {
  await act(async () => root.render(<WorkbenchRail section="general" />))
  const toggle = host.querySelector<HTMLButtonElement>('.studio-mobile-navigation-toggle')!
  await act(async () => {
    toggle.focus()
    toggle.click()
  })
  await act(async () => host.dispatchEvent(new Event('pointerdown', { bubbles: true })))
  expect(toggle.getAttribute('aria-expanded')).toBe('false')
  await act(async () => toggle.click())
  const outside = document.createElement('button')
  document.body.append(outside)
  await act(async () => outside.focus())
  expect(toggle.getAttribute('aria-expanded')).toBe('false')
  outside.remove()
  await act(async () => host.querySelector<HTMLButtonElement>('.studio-rail-toggle')!.click())
  expect(localStorage.getItem('istudio-rail-collapsed')).toBe('true')
  expect(toggle.getAttribute('aria-expanded')).toBe('false')
  document.documentElement.removeAttribute('data-studio-rail')
})
it('supports arrow, Home, End and Escape keys in the account menu', async () => {
  await act(async () => root.render(<AccountMenu />))
  const toggle = host.querySelector<HTMLButtonElement>('[aria-haspopup="menu"]')!
  await act(async () => toggle.click())
  const menu = host.querySelector<HTMLElement>('[role="menu"]')!
  const items = menu.querySelectorAll<HTMLElement>('[role="menuitem"]')
  expect(document.activeElement).toBe(items[0])
  async function key(value: string) {
    await act(async () =>
      document.activeElement!.dispatchEvent(
        new KeyboardEvent('keydown', { key: value, bubbles: true }),
      ),
    )
  }
  await key('ArrowDown')
  expect(document.activeElement).toBe(items[1])
  await key('ArrowDown')
  expect(document.activeElement).toBe(items[2])
  await key('ArrowDown')
  expect(document.activeElement).toBe(items[0])
  await key('End')
  expect(document.activeElement).toBe(items[2])
  await key('Home')
  expect(document.activeElement).toBe(items[0])
  await key('Escape')
  expect(host.querySelector('[role="menu"]')).toBeNull()
  expect(document.activeElement).toBe(toggle)
})
