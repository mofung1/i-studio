import { Suspense } from 'react'

import { Workbench } from '@/components/workbench'
import type { CommerceTaskType } from '@/lib/contracts'

const commerceTasks: CommerceTaskType[] = ['product-main', 'detail-page', 'viral-recreate', 'product-retouch']

interface HomeProps {
  searchParams: Promise<{
    mode?: string
    task?: string
    prompt?: string
    model?: string
    aspectRatio?: string
    resolution?: string
    count?: string
  }>
}

/** 首页即生成页。 */
export default async function Home({ searchParams }: HomeProps) {
  const params = await searchParams
  const initialMode = params.mode === 'commerce' ? 'commerce' : 'general'
  const initialTask = commerceTasks.includes(params.task as CommerceTaskType)
    ? (params.task as CommerceTaskType)
    : 'product-main'

  return (
    <Suspense fallback={<div className="studio" aria-busy="true" aria-label="生成页加载中" />}>
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
