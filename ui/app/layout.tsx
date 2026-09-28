import { ThemeProvider } from '@appica/ui-react/providers/theme-provider'
import type { Metadata } from 'next'
import type { ReactNode } from 'react'

import './globals.css'

export const metadata: Metadata = {
  title: 'iStudio Nova - AI 电商视觉工作台',
  description: '面向电商团队的 AI 图片创作与资产管理工作台',
}

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="zh-CN" suppressHydrationWarning data-scroll-behavior="smooth">
      <body>
        <ThemeProvider defaultTheme="light" enableSystem={false} storageKey="istudio-ui-theme">
          {children}
        </ThemeProvider>
      </body>
    </html>
  )
}
