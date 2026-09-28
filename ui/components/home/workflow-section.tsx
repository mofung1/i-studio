import { Download, MessageSquareText, SlidersHorizontal, Sparkles, Upload } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

type WorkflowKind = 'upload' | 'describe' | 'generate' | 'refine' | 'export'

interface WorkflowStep {
  id: string
  title: string
  description: string
  kind: WorkflowKind
  icon: LucideIcon
}

const steps: WorkflowStep[] = [
  { id: '01', title: 'Upload', description: '上传商品原图与参考素材', kind: 'upload', icon: Upload },
  { id: '02', title: 'Describe', description: '描述场景、风格与投放目标', kind: 'describe', icon: MessageSquareText },
  { id: '03', title: 'Generate', description: 'Agent 自动调用模型完成生成', kind: 'generate', icon: Sparkles },
  { id: '04', title: 'Refine', description: '局部调整商品、光影与文案', kind: 'refine', icon: SlidersHorizontal },
  { id: '05', title: 'Export', description: '打包不同平台所需尺寸', kind: 'export', icon: Download },
]

function WorkflowVisual({ kind }: { kind: WorkflowKind }) {
  if (kind === 'upload') {
    return <div className="ist-workflow-visual ist-workflow-upload"><span /><span /><span /></div>
  }
  if (kind === 'describe') {
    return <div className="ist-workflow-visual ist-workflow-describe"><i /><b /><b /></div>
  }
  if (kind === 'generate') {
    return <div className="ist-workflow-visual ist-workflow-generate"><span /><span /><span /><i /></div>
  }
  if (kind === 'refine') {
    return <div className="ist-workflow-visual ist-workflow-refine"><span /><i /><b /></div>
  }
  return <div className="ist-workflow-visual ist-workflow-export"><span /><span /></div>
}

export function WorkflowSection() {
  return (
    <section className="ist-workflow" aria-labelledby="workflow-title">
      <div className="ist-section-heading">
        <span className="ist-section-kicker">From Asset to Delivery</span>
        <h2 id="workflow-title">从素材，到成片。</h2>
        <p>五步完成从原始商品图到可投放视觉资产的生产过程。</p>
      </div>

      <div className="ist-workflow-track">
        {steps.map((step) => {
          const Icon = step.icon
          return (
            <article className="ist-workflow-step" key={step.id}>
              <div className="ist-workflow-card">
                <span className="ist-step-number">{step.id}</span>
                <WorkflowVisual kind={step.kind} />
                <div className="ist-step-title"><Icon size={15} /><h3>{step.title}</h3></div>
                <p>{step.description}</p>
              </div>
              {step.id !== '05' && <span className="ist-workflow-connector" aria-hidden="true" />}
            </article>
          )
        })}
      </div>
    </section>
  )
}

