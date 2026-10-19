import { expect, it } from 'vitest'
import { adminPages, currentAdminPage } from './navigation'
it('matches the most specific admin page and keeps every navigation destination unique', () => {
  expect(currentAdminPage('/admin/inspiration/categories')?.title).toBe('公共灵感库')
  expect(currentAdminPage('/admin/models')?.title).toBe('模型与定价')
  expect(currentAdminPage('/admin/prompts')?.title).toBe('系统提示词')
  expect(currentAdminPage('/admin/site')?.title).toBe('网站配置')
  expect(currentAdminPage('/admin/settings')?.title).toBe('AI 服务')
  expect(currentAdminPage('/admin')?.title).toBe('运营概览')
  expect(currentAdminPage('/workbench')).toBeUndefined()
  expect(adminPages.some((page) => page.href === ('/admin/inspiration/categories' as string))).toBe(
    false,
  )
  expect(new Set(adminPages.map((item) => item.href)).size).toBe(adminPages.length)
})
