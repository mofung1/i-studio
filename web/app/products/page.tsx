import { ProductWorkspace } from '@/components/products/product-workspace'

export default async function ProductsPage({
  searchParams,
}: {
  searchParams: Promise<{ projectId?: string }>
}) {
  const { projectId } = await searchParams
  return <ProductWorkspace initialProjectId={projectId} />
}
