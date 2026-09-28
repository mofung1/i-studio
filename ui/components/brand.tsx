import Link from 'next/link'

export function Brand() {
  return (
    <Link className="brand" href="/" aria-label="返回首页">
      <span className="brand-mark" aria-hidden="true">
        <i />
        <i />
      </span>
      <strong>iStudio</strong>
    </Link>
  )
}

