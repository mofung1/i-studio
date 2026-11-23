import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  output: process.env.NEXT_STANDALONE === '1' ? 'standalone' : undefined,
  images: {
    qualities: [75, 85],
    unoptimized: process.env.NEXT_IMAGE_UNOPTIMIZED === '1',
  },
  async rewrites() {
    const admin = (process.env.ADMIN_INTERNAL_BASE_URL || 'http://127.0.0.1:33001').replace(
      /\/+$/,
      '',
    )
    const api = (process.env.API_INTERNAL_BASE_URL || 'http://127.0.0.1:4000').replace(/\/+$/, '')
    return [
      // Next canonicalizes /admin/ to /admin, while the SPA is mounted at /admin/.
      { source: '/admin', destination: `${admin}/admin/` },
      { source: '/admin/:path+', destination: `${admin}/admin/:path+` },
      { source: '/v1/:path*', destination: `${api}/v1/:path*` },
    ]
  },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Referrer-Policy', value: 'same-origin' },
        ],
      },
    ]
  },
}

export default nextConfig
