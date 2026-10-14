/** Local HTTP deployments may not expose the asynchronous clipboard API. */
export async function copyText(text: string) {
  if (navigator.clipboard?.writeText) {
    try { await navigator.clipboard.writeText(text); return } catch { /* Try the browser's selection-based copy. */ }
  }
  const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null
  const field = document.createElement('textarea')
  field.value = text; field.readOnly = true; field.style.cssText = 'position:fixed;top:0;left:0;width:1px;height:1px;opacity:0'
  const container = document.querySelector('dialog[open]') ?? document.querySelector('[role="dialog"][aria-modal="true"]') ?? document.body
  container.append(field)
  try { field.focus({ preventScroll: true }); field.select(); if (!document.execCommand('copy')) throw new Error('浏览器未允许复制') }
  finally { field.remove(); if (previous?.isConnected) previous.focus({ preventScroll: true }) }
}
