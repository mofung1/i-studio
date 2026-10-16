// @vitest-environment jsdom
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { expect, it } from 'vitest'

it('keeps text fields, search wrappers and checkboxes from overriding one another', () => {
  const style = document.createElement('style')
  style.textContent = readFileSync(resolve('app/library.css'), 'utf8')
  const host = document.createElement('div')
  host.className = 'library-dialog-body'
  host.innerHTML =
    '<form><input aria-label="名称"><label class="library-search"><input type="search"></label><label class="personal-checkbox"><input type="checkbox">收藏</label></form>'
  document.head.append(style)
  document.body.append(host)
  try {
    const name = host.querySelector('input')!
    const search = host.querySelector<HTMLInputElement>('[type="search"]')!
    const checkbox = host.querySelector('[type="checkbox"]')!
    expect(getComputedStyle(name).minHeight).toBe('40px')
    expect(getComputedStyle(search).padding).toBe('0px')
    expect(getComputedStyle(search).borderTopWidth).toBe('0px')
    search.focus()
    expect(getComputedStyle(search).boxShadow).toBe('none')
    expect(getComputedStyle(checkbox).width).toBe('16px')
    expect(getComputedStyle(checkbox).minHeight).toBe('0')
    expect(getComputedStyle(checkbox).padding).not.toBe('8px 10px')
  } finally {
    host.remove()
    style.remove()
  }
})
