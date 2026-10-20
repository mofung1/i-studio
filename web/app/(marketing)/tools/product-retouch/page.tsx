import { ToolPage } from '@/components/marketing/tool-page'
import { toolBySlug, toolMetadata } from '@/lib/marketing-server'

export const generateMetadata = () => toolMetadata('product-retouch')

export default function Page() {
  return <ToolPage tool={toolBySlug('product-retouch')} />
}
