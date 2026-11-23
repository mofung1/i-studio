// @vitest-environment jsdom

import { renderToStaticMarkup } from 'react-dom/server'
import { expect, it } from 'vitest'
import { tools } from '@/lib/marketing-content'
import { showcaseTools } from '@/lib/tool-showcase'
import { BottomCta } from './sections'
import { ToolPage } from './tool-page'
import { ToolShowcase } from './tool-showcase'

it('uses the same tool-specific action at the start and end of every tool page', () => {
  const parser = new DOMParser()
  for (const tool of tools) {
    const document = parser.parseFromString(
      renderToStaticMarkup(<ToolPage tool={tool} />),
      'text/html',
    )
    for (const area of ['.marketing-tool-hero', '.marketing-bottom-cta']) {
      const link = document.querySelector(`${area} a`)
      expect(link?.getAttribute('href')).toBe(tool.href)
      expect(link?.textContent?.trim()).toBe(tool.cta)
    }
  }
  const homeCta = parser.parseFromString(renderToStaticMarkup(<BottomCta compact />), 'text/html')
  expect(homeCta.querySelector('a')?.getAttribute('href')).toBe('/studio')
})

it('renders one native link around the title, description, artwork and action in each home card', () => {
  const document = new DOMParser().parseFromString(
    renderToStaticMarkup(<ToolShowcase />),
    'text/html',
  )
  expect(document.querySelectorAll('.tool-showcase-grid a')).toHaveLength(showcaseTools.length)
  for (const tool of showcaseTools) {
    const link = document.querySelector(`a#showcase-${tool.id}`)
    expect(link?.getAttribute('href')).toBe(tool.studioHref)
    expect(link?.querySelector('h3')?.textContent).toBe(tool.name)
    expect(link?.querySelector('.tool-showcase-choice-description')?.textContent).toBe(
      tool.description,
    )
    expect(link?.querySelector('.tool-showcase-visual')).toBeTruthy()
    expect(link?.querySelector('.tool-showcase-cta')?.textContent?.trim()).toBe(tool.cta)
  }
})
