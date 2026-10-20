import 'server-only'
import { tools } from './marketing-content'
import { marketingMetadata } from './seo'
import { getSiteBranding } from './site-settings-server'

export function toolBySlug(slug: string) {
  const tool = tools.find((item) => item.slug === slug)
  if (!tool) throw new Error(`Unknown marketing tool: ${slug}`)
  return tool
}

export async function toolMetadata(slug: string) {
  const tool = toolBySlug(slug)
  const { name } = await getSiteBranding()
  return marketingMetadata({
    title: tool.title,
    description: tool.description.replaceAll('iStudio', name),
    path: `/tools/${tool.slug}`,
    name,
  })
}
