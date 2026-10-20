import { Workbench } from '@/components/workbench'
import { WorkbenchSkeleton } from '@/components/workbench/workbench-skeleton'
import type { CommerceTaskType } from '@/lib/contracts'
import { redirect } from 'next/navigation'
import { Suspense } from 'react'
import { StudioToolLauncher } from '@/components/workbench/studio-tool-launcher'

const commerceTasks: CommerceTaskType[] = [
  'product-main',
  'detail-page',
  'viral-recreate',
  'product-retouch',
  'clothing-set',
]

interface WorkbenchPageProps {
  searchParams: Promise<{
    mode?: string
    task?: string
    view?: string
    prompt?: string
    model?: string
    aspectRatio?: string
    resolution?: string
    count?: string
  }>
}

export default async function WorkbenchPage({ searchParams }: WorkbenchPageProps) {
  const params = await searchParams
  // 灵感已经拆成独立页面，老链接继续可用
  if (params.view === 'inspire') redirect('/inspire')
  const initialMode = params.mode === 'commerce' ? 'commerce' : 'general'
  const initialTask = commerceTasks.includes(params.task as CommerceTaskType)
    ? (params.task as CommerceTaskType)
    : 'product-main'

  return (
    <Suspense fallback={<WorkbenchSkeleton mode={initialMode} />}>
      <StudioToolLauncher />
      <Workbench
        initialMode={initialMode}
        initialPrompt={params.prompt}
        initialTask={initialTask}
        initialModel={params.model}
        initialAspectRatio={params.aspectRatio}
        initialResolution={params.resolution}
        initialCount={params.count}
      />
    </Suspense>
  )
}
