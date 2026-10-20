import { ToolPage } from '@/components/marketing/tool-page'
import { toolBySlug, toolMetadata } from '@/lib/marketing-server'

export const generateMetadata = () => toolMetadata('ai-image-generator')

export default function Page() {
  return <ToolPage tool={toolBySlug('ai-image-generator')} />
}
