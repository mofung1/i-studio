/**
 * 首页创作输入暂存。
 *
 * 未登录用户点「登录」会整页跳转，React 状态随之丢失；把未提交的文字与参数
 * 写进 sessionStorage，登录返回 /home 后恢复。参考图不暂存：未登录无法上传，
 * 登录态离开页面后重新选择即可。
 */

export type HomeComposerMode = 'text' | 'img2img'

export interface HomeComposerDraft {
  prompt: string
  mode: HomeComposerMode
  endpointId: string
  aspectRatio: string
  resolution: string
}

export const homeComposerStorageKey = 'istudio-home-composer-draft'

function isDraft(value: unknown): value is HomeComposerDraft {
  if (typeof value !== 'object' || value === null) return false
  const draft = value as Record<string, unknown>
  return (
    typeof draft.prompt === 'string' &&
    (draft.mode === 'text' || draft.mode === 'img2img') &&
    typeof draft.endpointId === 'string' &&
    typeof draft.aspectRatio === 'string' &&
    typeof draft.resolution === 'string'
  )
}

export function readHomeComposerDraft(): HomeComposerDraft | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.sessionStorage.getItem(homeComposerStorageKey)
    if (!raw) return null
    const parsed: unknown = JSON.parse(raw)
    return isDraft(parsed) ? parsed : null
  } catch {
    return null
  }
}

export function writeHomeComposerDraft(draft: HomeComposerDraft) {
  if (typeof window === 'undefined') return
  try {
    window.sessionStorage.setItem(homeComposerStorageKey, JSON.stringify(draft))
  } catch {
    // 隐私模式或配额不足时放弃暂存，不影响正常输入与提交。
  }
}

export function clearHomeComposerDraft() {
  if (typeof window === 'undefined') return
  try {
    window.sessionStorage.removeItem(homeComposerStorageKey)
  } catch {
    // 清理失败同样不影响跳转，下次进入会覆盖为新的输入。
  }
}
