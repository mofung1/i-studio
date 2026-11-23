import { act } from 'react'

/** Open a Radix menu by keyboard, then choose its visible option from the portal. */
export async function chooseMenuOption(
  trigger: HTMLElement,
  label: string,
  role: 'option' | 'menuitem',
) {
  await act(async () => {
    trigger.focus()
    trigger.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true }),
    )
  })
  const options = [...document.querySelectorAll<HTMLElement>(`[role="${role}"]`)]
  const item = options.find((option) => option.textContent?.trim() === label)
  if (!item) throw new Error(`找不到选项「${label}」`)
  await act(async () => item.click())
}
