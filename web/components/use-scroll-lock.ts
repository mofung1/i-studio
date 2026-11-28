'use client'

import { useLayoutEffect } from 'react'

let lockCount = 0
let previousOverflow = ''

/**
 * 获取一次页面滚动锁，返回幂等的释放函数。
 * 多个浮层共享引用计数，全部关闭后才恢复原来的 overflow。
 */
export function lockBodyScroll() {
  if (typeof document === 'undefined') return () => {}
  if (lockCount === 0) previousOverflow = document.body.style.overflow
  lockCount += 1
  document.body.style.overflow = 'hidden'
  let locked = true
  return () => {
    if (!locked) return
    locked = false
    lockCount = Math.max(0, lockCount - 1)
    if (lockCount === 0) document.body.style.overflow = previousOverflow
  }
}

/**
 * 浮层打开时锁定页面滚动。
 * 统一锁 body 而不是 documentElement：iOS Safari 下锁 html 无法可靠阻止背景滚动。
 */
export function useScrollLock(active = true) {
  useLayoutEffect(() => {
    if (!active) return
    return lockBodyScroll()
  }, [active])
}
