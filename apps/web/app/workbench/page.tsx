import { Workbench } from '@/components/workbench'
import type { CommerceTaskType } from '@istudio/contracts'

const commerceTasks: CommerceTaskType[] = ['white-background', 'scene', 'selling-point', 'detail-page']

interface WorkbenchPageProps {
  searchParams: Promise<{ mode?: string; task?: string; prompt?: string; model?: string; aspectRatio?: string; resolution?: string }>
}

export default async function WorkbenchPage({ searchParams }: WorkbenchPageProps) {
  const params = await searchParams
  const initialMode = params.mode === 'commerce' ? 'commerce' : 'general'
  const initialTask = commerceTasks.includes(params.task as CommerceTaskType)
    ? (params.task as CommerceTaskType)
    : 'white-background'

  return (
    <Workbench
      initialMode={initialMode}
      initialPrompt={params.prompt}
      initialTask={initialTask}
      initialModel={params.model}
      initialAspectRatio={params.aspectRatio}
      initialResolution={params.resolution}
    />
  )
}
