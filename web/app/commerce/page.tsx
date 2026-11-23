import { studioToolUrl } from '@/lib/studio-navigation'
import { redirect } from 'next/navigation'

export default async function CommercePage({
  searchParams,
}: {
  searchParams: Promise<{ projectId?: string | string[] }>
}) {
  const { projectId } = await searchParams
  const project = typeof projectId === 'string' ? new URLSearchParams({ projectId }) : undefined
  redirect(studioToolUrl('commerce', 'product-main', project))
}
