import type { Metadata } from 'next'
import type { ReactNode } from 'react'

import './globals.css'

/**
 * 首屏绘制前就把首页的背景图应用上：
 * 否则 React 挂载后才贴背景图，会先闪一下空背景。
 */
const homeAppearanceScript = `(function(){try{
if(location.pathname!=='/')return;
var root=document.documentElement;
var bg=localStorage.getItem('istudio-home-background');
if(bg&&bg.indexOf('data:image/')===0)root.style.setProperty('--home-bg','url("'+bg+'")');
}catch(e){}})();`

/**
 * 工作台骨架屏渲染前就把配置面板方向定下来：
 * 否则骨架屏默认左侧、React 挂载后从 localStorage 读到右侧，布局会闪跳一下。
 */
const workbenchConfigSideScript = `(function(){try{
if(location.pathname!=='/workbench')return;
var side=localStorage.getItem('istudio-config-side');
document.documentElement.setAttribute('data-wb-side',side||'left');
}catch(e){}})();`

export const metadata: Metadata = {
  title: 'iStudio AI - 电商视觉工作台',
  description: '面向电商团队的 AI 图片创作工作台',
}

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="zh-CN" data-scroll-behavior="smooth">
      <head>
        <script dangerouslySetInnerHTML={{ __html: homeAppearanceScript }} />
        <script dangerouslySetInnerHTML={{ __html: workbenchConfigSideScript }} />
      </head>
      <body>{children}</body>
    </html>
  )
}
