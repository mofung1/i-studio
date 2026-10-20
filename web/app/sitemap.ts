import { marketingPaths } from '@/lib/marketing-content'
import { marketingSitemap } from '@/lib/seo'

export const dynamic = 'force-dynamic'
export default function sitemap() {
  return marketingSitemap(marketingPaths)
}
