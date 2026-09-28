import { AssetLibrary } from './asset-library'

export default async function AssetsPage({ searchParams }: { searchParams: Promise<{ view?: string }> }) {
  const { view } = await searchParams
  return <AssetLibrary view={view === 'tasks' ? 'tasks' : 'images'} />
}
