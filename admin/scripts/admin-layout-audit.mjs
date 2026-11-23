/** Read-only DOM check. Run in a browser after the page's data has loaded. */
export function auditAdminLayout() {
  const issues = []
  const measurements = []
  const rendered = (element) =>
    element.getClientRects().length > 0 && getComputedStyle(element).visibility !== 'hidden'
  const bounds = (element) => {
    const rect = element.getBoundingClientRect()
    return {
      left: rect.left,
      right: rect.right,
      top: rect.top,
      bottom: rect.bottom,
      width: rect.width,
      height: rect.height,
    }
  }
  const admin = document.querySelector('.admin-shell')
  if (!admin) return { ready: false, issues: [{ type: 'admin-not-ready' }], measurements }
  const reverse = admin.querySelector('#reverse-panel')
  if (reverse && rendered(reverse) && !reverse.querySelector('.reverse-config-footer'))
    issues.push({ type: 'reverse-not-ready' })
  if (document.documentElement.scrollWidth > innerWidth + 1)
    issues.push({ type: 'page-overflow', width: document.documentElement.scrollWidth })

  const footers = admin.querySelectorAll(
    '.reverse-config-footer, .ops-form > .settings-form-actions, .site-settings-panel .settings-form-actions, [role="dialog"] [data-dialog-actions], dialog[open] [data-dialog-actions]',
  )
  for (const footer of footers) {
    if (!rendered(footer)) continue
    const rect = bounds(footer)
    const target = footer.className || 'dialog-actions'
    const record = { target, ...rect, position: getComputedStyle(footer).position, states: [] }
    measurements.push(record)
    if (rect.height > Math.max(160, innerHeight * 0.3))
      issues.push({ type: 'footer-too-tall', target, height: rect.height })
    if (rect.left < -1 || rect.right > innerWidth + 1)
      issues.push({ type: 'footer-overflow', target })

    for (const state of footer.querySelectorAll('.reverse-config-state, .dialog-actions-note')) {
      const text = state.textContent.trim()
      const size = bounds(state)
      const style = getComputedStyle(state)
      const fontSize = Number.parseFloat(style.fontSize) || 14
      const lineHeight = Number.parseFloat(style.lineHeight) || fontSize * 1.5
      record.states.push({ width: size.width, height: size.height, lineHeight })
      // Include zero-width flex items: they still render a column of overflowing text.
      if (text.length > 6 && size.width < fontSize * 4 && size.height > lineHeight * 2)
        issues.push({ type: 'compressed-status', target, width: size.width, height: size.height })
    }

    if (
      !footer.closest('[role="dialog"], dialog[open]') &&
      ['sticky', 'fixed'].includes(record.position)
    ) {
      let preceding = footer.previousElementSibling
      while (preceding && !rendered(preceding)) preceding = preceding.previousElementSibling
      if (preceding && bounds(preceding).bottom > rect.top + 1)
        issues.push({ type: 'page-footer-overlap', target })
    }
    const buttons = [...footer.querySelectorAll('button, a')].filter(rendered)
    for (const button of buttons) {
      if (
        button.scrollWidth > button.clientWidth + 2 ||
        button.scrollHeight > button.clientHeight + 2
      )
        issues.push({ type: 'action-content-overflow', target, label: button.textContent.trim() })
    }
    for (let i = 0; i < buttons.length; i++) {
      for (let j = i + 1; j < buttons.length; j++) {
        const a = bounds(buttons[i]),
          b = bounds(buttons[j])
        if (
          Math.min(a.right, b.right) - Math.max(a.left, b.left) > 1 &&
          Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 1
        )
          issues.push({ type: 'actions-overlap', target })
      }
    }
  }
  return {
    ready: !issues.some((issue) => issue.type.endsWith('not-ready')),
    viewport: { width: innerWidth, height: innerHeight },
    issues,
    measurements,
  }
}
