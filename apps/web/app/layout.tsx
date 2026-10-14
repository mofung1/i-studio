import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import { SiteBrandingProvider } from '@/components/site-branding-provider'
import { PromptReverseProvider } from '@/components/prompt-reverse-provider'
import { getSiteBranding } from '@/lib/site-settings-server'
import { siteLogoUrl, siteTitle } from '@/lib/site-settings'

import './globals.css'
import './studio.css'
import './prompt-reverse.css'

/**
 * 工作台骨架屏渲染前就把配置面板方向定下来：
 * 否则骨架屏默认左侧、React 挂载后从 localStorage 读到右侧，布局会闪跳一下。
 */
const themeScript = `(function(){var theme;try{theme=localStorage.getItem('istudio-theme')}catch(e){}document.documentElement.setAttribute('data-theme',theme==='dark'||(theme!=='light'&&window.matchMedia('(prefers-color-scheme: dark)').matches)?'dark':'light')})();`

const workbenchConfigSideScript = `(function(){try{
document.documentElement.setAttribute('data-studio-rail',localStorage.getItem('istudio-rail-collapsed')==='true'?'collapsed':'expanded');
if(location.pathname!=='/workbench'&&location.pathname!=='/')return;
var side=localStorage.getItem('istudio-config-side');
document.documentElement.setAttribute('data-wb-side',side||'left');
}catch(e){}})();`

export async function generateMetadata(): Promise<Metadata> {
  const branding = await getSiteBranding()
  return {
    title: siteTitle(branding.name),
    description: '个人 AI 生图、灵感探索与电商视觉创作工作台',
    icons: { icon: siteLogoUrl(branding.logoPath) || '/icon.svg' },
  }
}

export default async function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  const branding = await getSiteBranding()
  return (
    <html lang="zh-CN" data-scroll-behavior="smooth" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
        <script dangerouslySetInnerHTML={{ __html: workbenchConfigSideScript }} />
      </head>
      <body><SiteBrandingProvider initialBranding={branding}><PromptReverseProvider>{children}</PromptReverseProvider></SiteBrandingProvider></body>
    </html>
  )
}
