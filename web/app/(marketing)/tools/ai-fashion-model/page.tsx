import { ToolPage } from '@/components/marketing/tool-page'
import { toolBySlug, toolMetadata } from '@/lib/marketing-server'

export const generateMetadata = () => toolMetadata('ai-fashion-model')

export default function Page() {
  return <ToolPage tool={toolBySlug('ai-fashion-model')} />
}
