'use client'

interface GenerationLoadingProps {
  status: string
  count: number
}

/** 黑白画片组合只表示任务仍在运行，不模拟进度或预计完成时间。 */
export function GenerationLoading({ status, count }: GenerationLoadingProps) {
  const label =
    status === 'queued'
      ? '创作正在排队'
      : status === 'waiting_provider'
        ? '等待画面返回'
        : '正在构建画面'
  const description =
    status === 'queued'
      ? '任务已提交，轮到后将自动开始'
      : status === 'waiting_provider'
        ? 'AI 正在处理，完成后会自动展示'
        : '让描述、光影与细节慢慢成形'

  return (
    <div className="generation-loading">
      <div className="generation-loading-art" aria-hidden="true">
        <span className="generation-orbit generation-orbit-outer" />
        <span className="generation-orbit generation-orbit-inner" />
        <div className="generation-picture">
          <span className="generation-picture-back" />
          <span className="generation-picture-front">
            <span className="generation-picture-sun" />
            <span className="generation-picture-landscape" />
            <span className="generation-picture-glint" />
          </span>
        </div>
        <span className="generation-particle particle-one" />
        <span className="generation-particle particle-two" />
        <span className="generation-particle particle-three" />
      </div>
      <div className="generation-loading-copy" role="status" aria-atomic="true">
        <strong>{label}</strong>
        <p>{description}</p>
        <span className="generation-loading-count">本次创作 · {count} 张</span>
      </div>
    </div>
  )
}
