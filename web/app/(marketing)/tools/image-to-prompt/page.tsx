import { ToolPage } from '@/components/marketing/tool-page'
import { toolBySlug, toolMetadata } from '@/lib/marketing-server'

export const generateMetadata = () => toolMetadata('image-to-prompt')

export default function Page() {
  return <ToolPage tool={toolBySlug('image-to-prompt')} />
}
