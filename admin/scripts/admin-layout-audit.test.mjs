// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest'
import { auditAdminLayout } from './admin-layout-audit.mjs'

function box(element, x, y, width, height) {
  const rect = { left: x, right: x + width, top: y, bottom: y + height, width, height }
  element.getBoundingClientRect = () => rect
  element.getClientRects = () => [rect]
}
function fixture({ broken = false } = {}) {
  document.body.innerHTML =
    '<div class="admin-shell"><section id="reverse-panel"><form><section class="fields"></section><footer class="reverse-config-footer"><div class="reverse-config-state">配置已同步 · 仅对新建分析生效</div><div><button>恢复推荐参数</button><button>保存配置</button></div></footer></form></section></div>'
  vi.stubGlobal('innerWidth', 1440)
  vi.stubGlobal('innerHeight', 900)
  box(document.querySelector('#reverse-panel'), 280, 200, 1136, 1600)
  box(document.querySelector('.fields'), 280, 250, 1136, 1100)
  const footer = document.querySelector('footer')
  footer.style.position = broken ? 'sticky' : 'static'
  box(footer, 280, broken ? 557 : 1350, 1136, broken ? 319 : 77)
  const state = document.querySelector('.reverse-config-state')
  state.style.fontSize = '12px'
  state.style.lineHeight = '20.4px'
  box(state, 304, broken ? 574 : 1378, broken ? 0 : 700, broken ? 286 : 21)
  for (const [i, button] of [...document.querySelectorAll('button')].entries())
    box(button, 1100 + i * 150, 1370, 130, 44)
}
afterEach(() => {
  document.body.innerHTML = ''
  vi.unstubAllGlobals()
})
it('detects the observed zero-width status and tall footer covering page fields', () => {
  fixture({ broken: true })
  expect(auditAdminLayout().issues.map((issue) => issue.type)).toEqual(
    expect.arrayContaining(['compressed-status', 'footer-too-tall', 'page-footer-overlap']),
  )
})
it('accepts an ordinary page footer with readable status and separated actions', () => {
  fixture()
  expect(auditAdminLayout().issues).toEqual([])
})
it('fails rather than accepting an unloaded reverse configuration panel', () => {
  fixture()
  document.querySelector('footer').remove()
  expect(auditAdminLayout().ready).toBe(false)
  expect(auditAdminLayout().issues).toContainEqual({ type: 'reverse-not-ready' })
})
it('checks button collisions even when the whole page fits the viewport', () => {
  fixture()
  box(document.querySelectorAll('button')[1], 1150, 1370, 130, 44)
  expect(auditAdminLayout().issues).toContainEqual({
    type: 'actions-overlap',
    target: 'reverse-config-footer',
  })
})
