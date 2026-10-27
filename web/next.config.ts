import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  output: process.env.NEXT_STANDALONE === '1' ? 'standalone' : undefined,
  images: {
    qualities: [75, 85],
    unoptimized: process.env.NEXT_IMAGE_UNOPTIMIZED === '1',
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
