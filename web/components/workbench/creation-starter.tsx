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
      <ol className="creation-starter-steps">
        <li>
          {general
            ? '填写描述，按需添加参考图'
            : clothing
              ? '上传服装素材并确认图种'
              : '准备商品素材与展示需求'}
        </li>
        <li>选择模型，核对能力与画面参数</li>
        <li>{clothing ? '确认逐张规划和预计积分后生成' : '确认预计积分，再点击生成'}</li>
      </ol>
      <p className="creation-starter-note">
        示例只填入描述，不会自动生成或消耗积分。常用配置可通过顶部“提示词与预设”保存。
      </p>
    </section>
  )
}
