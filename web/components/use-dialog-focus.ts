'use client'

import { useLayoutEffect, useRef, type RefObject } from 'react'

const dialogStack: HTMLElement[] = []
let bodyOverflow = ''

/** 弹窗打开后限制键盘焦点，关闭后回到触发按钮。 */
export function useDialogFocus(
  ref: RefObject<HTMLElement | null>,
  onClose: () => void,
  initialSelector = 'button',
) {
  const closeRef = useRef(onClose)
  useLayoutEffect(() => {
    closeRef.current = onClose
  }, [onClose])

  useLayoutEffect(() => {
    const previousFocus =
      document.activeElement instanceof HTMLElement ? document.activeElement : null
    const dialog = ref.current
    if (!dialog) return
    if (dialogStack.length === 0) bodyOverflow = document.body.style.overflow
    dialogStack.push(dialog)
    document.body.style.overflow = 'hidden'
    ref.current?.querySelector<HTMLElement>(initialSelector)?.focus({ preventScroll: true })

    function onKeyDown(event: KeyboardEvent) {
      if (event.defaultPrevented || dialogStack.at(-1) !== dialog) return
      if (event.key === 'Escape') {
        event.preventDefault()
        closeRef.current()
      }
      if (event.key !== 'Tab') return
      const controls = ref.current?.querySelectorAll<HTMLElement>(
        'button:not(:disabled), input:not(:disabled):not([type="hidden"]), a[href], textarea:not(:disabled), select:not(:disabled), [tabindex="0"]',
      )
      if (!controls?.length) return
      const first = controls.item(0)
      const last = controls.item(controls.length - 1)
      if (!ref.current?.contains(document.activeElement)) {
        event.preventDefault()
        first.focus()
      } else if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      const index = dialogStack.indexOf(dialog)
      if (index !== -1) dialogStack.splice(index, 1)
      if (dialogStack.length === 0) document.body.style.overflow = bodyOverflow
      if (previousFocus?.isConnected) previousFocus.focus({ preventScroll: true })
    }
  }, [ref, initialSelector])
}
