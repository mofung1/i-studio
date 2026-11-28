// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  clearHomeComposerDraft,
  homeComposerStorageKey,
  readHomeComposerDraft,
  writeHomeComposerDraft,
} from './home-composer'

const draft = {
  prompt: '窗边的玻璃花瓶与雏菊',
  mode: 'img2img' as const,
  endpointId: 'endpoint-1',
  aspectRatio: '3:4',
  resolution: '4K',
}

beforeEach(() => window.sessionStorage.clear())
afterEach(() => {
  window.sessionStorage.clear()
  vi.restoreAllMocks()
})

describe('home composer draft', () => {
  it('round-trips a draft and clears it', () => {
    writeHomeComposerDraft(draft)
    expect(readHomeComposerDraft()).toEqual(draft)

    clearHomeComposerDraft()
    expect(readHomeComposerDraft()).toBeNull()
  })

  it('ignores malformed or incomplete values', () => {
    window.sessionStorage.setItem(homeComposerStorageKey, '{broken')
    expect(readHomeComposerDraft()).toBeNull()

    window.sessionStorage.setItem(
      homeComposerStorageKey,
      JSON.stringify({ ...draft, mode: 'video' }),
    )
    expect(readHomeComposerDraft()).toBeNull()

    window.sessionStorage.setItem(homeComposerStorageKey, JSON.stringify({ prompt: '缺少参数' }))
    expect(readHomeComposerDraft()).toBeNull()
  })

  it('degrades gracefully when sessionStorage is unavailable', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => {
      throw new Error('blocked')
    })

    expect(readHomeComposerDraft()).toBeNull()
    expect(() => writeHomeComposerDraft(draft)).not.toThrow()
    expect(() => clearHomeComposerDraft()).not.toThrow()
  })
})
