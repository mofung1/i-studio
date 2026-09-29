import { Workbench } from '@/components/workbench'
import type { CommerceTaskType } from '@/lib/contracts'
import { redirect } from 'next/navigation'
import { Suspense } from 'react'

const commerceTasks: CommerceTaskType[] = ['product-main', 'detail-page', 'viral-recreate', 'product-retouch']

interface WorkbenchPageProps {
  searchParams: Promise<{ mode?: string; task?: string; view?: string; prompt?: string; model?: string; aspectRatio?: string; resolution?: string; count?: string }>
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
    <Suspense fallback={<main className="workbench-page" aria-label="工作台加载中" />}>
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
