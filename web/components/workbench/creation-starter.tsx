import { ArrowUpRight } from 'lucide-react'
import type { CommerceTaskType } from '@/lib/contracts'
import { creationExamples, type CreationExample } from '@/lib/creation-examples'

export function CreationStarter({
  mode,
  task,
  canApply,
  disabled,
  onApply,
}: {
  mode: 'general' | 'commerce'
  task: CommerceTaskType
  canApply: boolean
  disabled?: boolean
  onApply: (example: CreationExample) => void
}) {
  const general = mode === 'general'
  const clothing = !general && task === 'clothing-set'
  return (
    <section className="creation-starter" aria-label="创作入门">
      <h2>{canApply ? '从一个想法开始' : '继续完善这次创作'}</h2>
      <p className="creation-starter-lead">
        {general
          ? canApply
            ? '写下主体、场景和风格，也可以从下面的描述示例开始。'
            : '描述可继续编辑，也可以按需添加参考图；准备好后再确认参数与积分。'
          : clothing
            ? '先上传服装原图，选择图种或模特上身，再查看并编辑逐张生成规划。'
            : task === 'viral-recreate'
              ? '先上传商品原图与构图参考，再描述希望借鉴的布局或光影。'
              : '先上传清晰的商品原图，再填写展示需求，核对想要保留的商品细节。'}
      </p>
      {canApply && (
        <div className="creation-example-list" aria-label="描述示例">
          {creationExamples(mode, task).map((example) => (
            <button
              key={example.title}
              type="button"
              disabled={disabled}
              onClick={() => onApply(example)}
            >
              <span>{example.title}</span>
              <ArrowUpRight size={16} aria-hidden="true" />
            </button>
          ))}
        </div>
      )}
      {canApply && <p className="creation-starter-note">点击示例只填入描述，确认后再生成。</p>}
    </section>
  )
}
