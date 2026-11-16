'use client'

import { useLayoutEffect, useRef, type RefObject } from 'react'

const dialogStack: HTMLElement[] = []
let bodyOverflow = ''

function canFocus(element: HTMLElement, dialog: HTMLElement) {
  if (element.tabIndex < 0 || element.closest('[hidden], [inert], [aria-hidden="true"]'))
    return false
  for (let ancestor: HTMLElement | null = element; ancestor; ancestor = ancestor.parentElement) {
    const style = window.getComputedStyle(ancestor)
    if (
      style.display === 'none' ||
      style.visibility === 'hidden' ||
      style.visibility === 'collapse'
    )
      return false
    if (ancestor === dialog) break
  }
  const details = element.closest('details:not([open])')
  return !details || details.querySelector('summary')?.contains(element) === true
}

/** 弹窗打开后限制键盘焦点，关闭后回到触发按钮。 */
export function useDialogFocus(
  ref: RefObject<HTMLElement | null>,
  onClose: () => void,
  initialSelector = 'button',
  portalContainer?: HTMLElement | null,
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
    const focusable = () =>
      [
        ...dialog.querySelectorAll<HTMLElement>(
          'button:not(:disabled), input:not(:disabled):not([type="hidden"]), a[href], textarea:not(:disabled), select:not(:disabled), summary, [tabindex="0"]',
        ),
      ].filter((element) => canFocus(element, dialog))
    const initial = [...dialog.querySelectorAll<HTMLElement>(initialSelector)].find((element) =>
      canFocus(element, dialog),
    )
    ;(initial ?? focusable()[0] ?? dialog).focus({ preventScroll: true })

    function onKeyDown(event: KeyboardEvent) {
      if (event.defaultPrevented || dialogStack.at(-1) !== dialog) return
      const target = event.target instanceof HTMLElement ? event.target : document.activeElement
      const nativeDialog = target?.closest('dialog[open]')
      if (nativeDialog && !nativeDialog.contains(dialog)) return
      if (event.key === 'Escape') {
        event.preventDefault()
        closeRef.current()
      }
      if (event.key !== 'Tab') return
      const controls = focusable()
      if (!controls.length) {
        event.preventDefault()
        dialog.focus()
        return
      }
      const first = controls[0]!
      const last = controls.at(-1)!
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
  }, [ref, initialSelector, portalContainer])
}
