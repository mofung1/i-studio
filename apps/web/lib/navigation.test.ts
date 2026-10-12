import { describe, expect, it } from 'vitest'
import { safeReturnPath } from './navigation'

describe('login return path', () => {
  it('preserves local routes and query parameters', () => {
    expect(safeReturnPath('/assets?view=tasks#recent')).toBe('/assets?view=tasks#recent')
  })
  it.each([null, 'https://example.com', '//example.com', '/\\example.com', '/\n/example.com'])('rejects external or normalized external routes: %s', path => {
    expect(safeReturnPath(path)).toBe('/workbench?mode=general')
  })
})
