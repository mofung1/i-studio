import Link from 'next/link'

/** 印刷套准十字：既是「成像」也是「精准」，是这套 UI 的标记原点。 */
export function RegMark({ signal = false, className }: { signal?: boolean; className?: string }) {
  return (
    <span className={['reg-mark', signal ? 'is-signal' : '', className].filter(Boolean).join(' ')} aria-hidden="true">
      <i />
    </span>
  )
}

export function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <Link className="brand" href="/" aria-label="iStudio 工作台">
      <RegMark />
      {!compact && (
        <span>
          <strong className="brand-word">iStudio</strong>
          <span className="brand-sub">image studio</span>
        </span>
      )}
    </Link>
  )
}
