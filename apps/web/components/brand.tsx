import Link from 'next/link'

/**
 * 品牌标记：圆角画框里嵌一个几何化的「i」。
 * 单色（currentColor）实现，导航、首页大图、favicon 共用同一份路径；
 * 16px 下仍能辨认，反白/深色底同样可用。
 */
export function BrandMark({ className, size = 30 }: { className?: string; size?: number }) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      role="img"
      aria-hidden="true"
      focusable="false"
    >
      <path
        fill="currentColor"
        fillRule="evenodd"
        clipRule="evenodd"
        d="M7.2 1.6h9.6a5.6 5.6 0 0 1 5.6 5.6v9.6a5.6 5.6 0 0 1-5.6 5.6H7.2a5.6 5.6 0 0 1-5.6-5.6V7.2a5.6 5.6 0 0 1 5.6-5.6Zm3.1 4.3h3.4v3.4h-3.4Zm0 5.1h3.4v7.1h-3.4Z"
      />
    </svg>
  )
}

export function Brand() {
  return (
    <Link className="brand" href="/" aria-label="返回首页">
      <BrandMark className="brand-mark" size={30} />
      <strong>iStudio</strong>
    </Link>
  )
}
