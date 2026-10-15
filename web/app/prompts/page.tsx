import { PersonalPromptLibrary } from '@/components/personal-prompt-library'

export default async function PromptsPage({
  searchParams,
}: {
  searchParams: Promise<{ kind?: string }>
}) {
  const { kind } = await searchParams
  return <PersonalPromptLibrary kind={kind === 'preset' ? 'preset' : 'prompt'} />
}
