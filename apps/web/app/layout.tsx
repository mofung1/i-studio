import type { Metadata } from 'next'
import type { ReactNode } from 'react'

import './globals.css'
import './studio.css'

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

export const metadata: Metadata = {
  title: 'iStudio - 个人 AI 创作工作台',
  description: '个人 AI 生图、灵感探索与电商视觉创作工作台',
}

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="zh-CN" data-scroll-behavior="smooth" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
        <script dangerouslySetInnerHTML={{ __html: workbenchConfigSideScript }} />
      </head>
      <body>{children}</body>
    </html>
  )
}
