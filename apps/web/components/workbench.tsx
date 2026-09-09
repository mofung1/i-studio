'use client'

import {
  Box,
  Check,
  ChevronLeft,
  ImagePlus,
  LayoutPanelLeft,
  LayoutPanelTop,
  Package,
  Sparkles,
  WandSparkles,
  X,
} from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useMemo, useState } from 'react'

import {
  generationInputSchema,
  type GenerationModel,
  type CommerceTaskType,
  type GenerationInput,
} from '@istudio/contracts'
import { Button } from '@istudio/ui'

type WorkbenchMode = 'general' | 'commerce'
type ConfigSide = 'left' | 'right'

interface WorkbenchProps {
  initialMode: WorkbenchMode
  initialTask: CommerceTaskType
  initialPrompt?: string
  initialModel?: string
  initialAspectRatio?: string
  initialResolution?: string
}

const taskMeta: Record<CommerceTaskType, { title: string; description: string; image: string }> = {
  'white-background': {
    title: '白底精修',
    description: '生成干净规范的上架主图',
    image: 'https://images.unsplash.com/photo-1602143407151-7111542de6e8?auto=format&fit=crop&w=1400&q=88',
  },
  scene: {
    title: '商品场景图',
    description: '把商品自然放入真实场景',
    image: 'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?auto=format&fit=crop&w=1400&q=88',
  },
  'selling-point': {
    title: '卖点主图',
    description: '生成无字底图并预留文案空间',
    image: 'https://images.unsplash.com/photo-1542291026-7eec264c27ff?auto=format&fit=crop&w=1400&q=88',
  },
  'detail-page': {
    title: '详情页单页',
    description: '围绕单一主题表达商品信息',
    image: 'https://images.unsplash.com/photo-1556228578-8c89e6adf883?auto=format&fit=crop&w=1400&q=88',
  },
}

const commerceTasks = Object.entries(taskMeta) as Array<[CommerceTaskType, (typeof taskMeta)[CommerceTaskType]]>

export function Workbench({ initialMode, initialPrompt, initialTask, initialModel, initialAspectRatio, initialResolution }: WorkbenchProps) {
  const router = useRouter()
  const [mode, setMode] = useState<WorkbenchMode>(initialMode)
  const [task, setTask] = useState<CommerceTaskType>(initialTask)
  const [configSide, setConfigSide] = useState<ConfigSide>('left')
  const [prompt, setPrompt] = useState(initialPrompt ?? '柔和晨光中的极简静物摄影，构图干净，材质细节清晰。')
  const [productName, setProductName] = useState('')
  const [productCategory, setProductCategory] = useState('')
  const [requirements, setRequirements] = useState('')
  const [sellingPoints, setSellingPoints] = useState('')
  const [productFile, setProductFile] = useState<File | null>(null)
  const [referenceFile, setReferenceFile] = useState<File | null>(null)
  const [count, setCount] = useState(1)
  const [model, setModel] = useState<GenerationModel>((initialModel as GenerationModel) ?? 'gpt-image-2')
  const [aspectRatio, setAspectRatio] = useState(initialAspectRatio ?? (initialTask === 'detail-page' ? '3:4' : '1:1'))
  const [resolution, setResolution] = useState(initialResolution ?? '2K')
  const [notice, setNotice] = useState<{ kind: 'success' | 'error'; message: string } | null>(null)

  useEffect(() => {
    const savedSide = window.localStorage.getItem('istudio-config-side')
    setConfigSide(savedSide === 'right' ? 'right' : 'left')
  }, [])

  useEffect(() => {
    window.localStorage.setItem('istudio-config-side', configSide)
  }, [configSide])

  const currentTask = taskMeta[task]
  const canvasImage = mode === 'general'
    ? 'https://images.unsplash.com/photo-1556228578-8c89e6adf883?auto=format&fit=crop&w=1400&q=88'
    : currentTask.image

  const title = mode === 'general' ? '通用生图' : currentTask.title
  const description = mode === 'general' ? '用文字描述或参考图片构建画面' : currentTask.description

  const parsedSellingPoints = useMemo(
    () => sellingPoints.split('\n').map((item) => item.trim()).filter(Boolean),
    [sellingPoints],
  )

  function changeMode(nextMode: WorkbenchMode) {
    setMode(nextMode)
    setNotice(null)
    router.replace(nextMode === 'general' ? '/workbench?mode=general' : `/workbench?mode=commerce&task=${task}`)
  }

  function changeTask(nextTask: CommerceTaskType) {
    setTask(nextTask)
    setMode('commerce')
    setNotice(null)
    router.replace(`/workbench?mode=commerce&task=${nextTask}`)
  }

  function buildPayload(): unknown {
    const imageSettings = { model, aspectRatio, resolution, count }

    if (mode === 'general') {
      return {
        mode: 'general',
        prompt,
        referenceAssetIds: referenceFile ? ['local-reference'] : [],
        style: 'unspecified',
        referenceStrength: 'medium',
        ...imageSettings,
      }
    }

    const common = {
      mode: 'commerce',
      taskType: task,
      productAssetIds: productFile ? ['local-product'] : [],
      productName,
      productCategory,
      platform: 'generic',
      consistencyProtection: true,
      ...imageSettings,
    }

    if (task === 'white-background') return { ...common, requirements, naturalShadow: true }
    if (task === 'scene') return { ...common, sceneDescription: requirements, referenceAssetIds: referenceFile ? ['local-reference'] : [], visualDirection: [] }
    if (task === 'selling-point') return { ...common, sellingPoints: parsedSellingPoints, outputLanguage: 'zh-CN', requirements, reserveCopyArea: true }
    return { ...common, module: 'core-selling-point', sellingPoints: parsedSellingPoints, outputLanguage: 'zh-CN', requirements }
  }

  async function createGenerationTask() {
    const result = generationInputSchema.safeParse(buildPayload())

    if (!result.success) {
      const firstIssue = result.error.issues[0]
      setNotice({ kind: 'error', message: firstIssue?.message ?? '请完成必填配置' })
      return
    }

    const validatedInput: GenerationInput = result.data
    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://127.0.0.1:4000'}/v1/generation/tasks`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(validatedInput),
      })
      if (!response.ok) throw new Error('API unavailable')
      const data = await response.json() as { task: { id: string; status: string }; message: string }
      setNotice({ kind: 'success', message: `任务 ${data.task.id.slice(0, 8)} 已创建（${data.task.status}）。${data.message}` })
    } catch {
      setNotice({ kind: 'success', message: `${validatedInput.mode === 'general' ? '通用生图' : title}参数已通过校验。API 尚未启动，暂未提交任务。` })
    }
  }

  return (
    <main className="workbench-page">
      <section className={`workbench-shell config-${configSide}`}>
        <aside className="mode-rail" aria-label="生图模式">
          <Link className="compact-brand" href="/" aria-label="返回首页"><span /></Link>
          <button className={mode === 'general' ? 'active' : ''} type="button" onClick={() => changeMode('general')}><WandSparkles size={21} /><span>通用</span></button>
          <button className={mode === 'commerce' ? 'active' : ''} type="button" onClick={() => changeMode('commerce')}><Package size={21} /><span>商品</span></button>
        </aside>

        <header className="workbench-header">
          <div className="mobile-mode-switch" aria-label="生图模式">
            <button className={mode === 'general' ? 'active' : ''} type="button" onClick={() => changeMode('general')}>通用</button>
            <button className={mode === 'commerce' ? 'active' : ''} type="button" onClick={() => changeMode('commerce')}>商品</button>
          </div>
          {mode === 'commerce' ? (
            <nav className="task-tabs" aria-label="商品生图任务">
              {commerceTasks.map(([taskId, meta]) => <button key={taskId} className={task === taskId ? 'active' : ''} type="button" onClick={() => changeTask(taskId)}>{meta.title}</button>)}
            </nav>
          ) : <strong className="workbench-title"><WandSparkles size={17} />通用生图</strong>}
          <Button asChild size="icon" variant="ghost"><Link href="/" aria-label="关闭工作台"><X size={20} /></Link></Button>
        </header>

        <aside className="configuration-panel">
          <div className="configuration-heading">
            <strong>生成配置</strong>
            <div className="side-toggle" aria-label="生成配置位置">
              <button className={configSide === 'left' ? 'active' : ''} type="button" aria-label="配置显示在左侧" aria-pressed={configSide === 'left'} onClick={() => setConfigSide('left')}><LayoutPanelLeft size={17} /></button>
              <button className={configSide === 'right' ? 'active' : ''} type="button" aria-label="配置显示在右侧" aria-pressed={configSide === 'right'} onClick={() => setConfigSide('right')}><LayoutPanelTop className="rotate-panel-icon" size={17} /></button>
            </div>
          </div>

          <div className="configuration-scroll">
            <fieldset className="form-section">
              <legend>{mode === 'general' ? '参考图片' : '商品原图'}</legend>
              <label className="file-input">
                <ImagePlus size={20} />
                <span>{(mode === 'general' ? referenceFile : productFile)?.name ?? (mode === 'general' ? '选择参考图片' : '选择商品图片')}</span>
                <input type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => mode === 'general' ? setReferenceFile(event.target.files?.[0] ?? null) : setProductFile(event.target.files?.[0] ?? null)} />
              </label>
            </fieldset>

            {mode === 'commerce' && (
              <fieldset className="form-section two-columns">
                <label>商品名称<input value={productName} onChange={(event) => setProductName(event.target.value)} placeholder="例如：Aero H1 耳机" /></label>
                <label>商品类目<input value={productCategory} onChange={(event) => setProductCategory(event.target.value)} placeholder="例如：消费电子" /></label>
              </fieldset>
            )}

            {mode === 'general' ? (
              <fieldset className="form-section">
                <label>画面描述<textarea value={prompt} onChange={(event) => setPrompt(event.target.value)} /></label>
                <div className="two-columns">
                  <label>创作风格<select defaultValue="unspecified"><option value="unspecified">不指定</option><option value="studio">摄影棚</option><option value="minimal">极简</option><option value="fresh">清新</option></select></label>
                  <label>参考强度<select defaultValue="medium" disabled={!referenceFile}><option value="low">低</option><option value="medium">中</option><option value="high">高</option></select></label>
                </div>
              </fieldset>
            ) : (
              <CommerceFields task={task} requirements={requirements} sellingPoints={sellingPoints} onRequirementsChange={setRequirements} onSellingPointsChange={setSellingPoints} onReferenceFileChange={setReferenceFile} />
            )}

            <fieldset className="form-section">
              <legend>画面设置 <small>默认生成 1 张</small></legend>
              <div className="settings-grid">
                <select aria-label="生图模型" value={model} onChange={(event) => setModel(event.target.value as GenerationModel)}><option value="gpt-image-2">GPT Image 2</option><option value="gemini-2.5-flash-image">Gemini 2.5 Flash</option><option value="gemini-3.1-flash-image">Gemini 3.1 Flash</option><option value="gemini-3-pro-image">Gemini 3 Pro Image</option></select>
                <select aria-label="画面比例" value={aspectRatio} onChange={(event) => setAspectRatio(event.target.value)}><option>1:1</option><option>3:4</option><option>4:3</option><option>9:16</option><option>16:9</option></select>
                <select aria-label="清晰度" value={resolution} onChange={(event) => setResolution(event.target.value)}><option>1K</option><option>2K</option><option>4K</option></select>
                <div className="stepper"><button type="button" aria-label="减少生成数量" onClick={() => setCount((value) => Math.max(1, value - 1))}>-</button><strong>{count}</strong><button type="button" aria-label="增加生成数量" onClick={() => setCount((value) => Math.min(4, value + 1))}>+</button></div>
              </div>
            </fieldset>
          </div>

          <footer className="configuration-footer">
            {notice && <p className={`form-notice ${notice.kind}`} role="status">{notice.kind === 'success' && <Check size={15} />}{notice.message}</p>}
            <button className="model-button" type="button"><Sparkles size={16} />Auto · 推荐</button>
            <Button onClick={createGenerationTask}><Sparkles size={17} />创建生成任务</Button>
          </footer>
        </aside>

        <section className="creation-canvas">
          <div className="canvas-copy"><span>{mode === 'general' ? 'AI 图片' : '电商工具'}</span><h1>{title}</h1><p>{description}</p></div>
          <div className="canvas-preview">
            <img src={canvasImage} alt={`${title}效果预览`} />
            <span>效果预览</span>
          </div>
          <p className="integration-note"><Box size={16} />当前展示设计参考图；尚未调用 AI，也不会产生费用。</p>
        </section>
      </section>
    </main>
  )
}

interface CommerceFieldsProps {
  task: CommerceTaskType
  requirements: string
  sellingPoints: string
  onRequirementsChange: (value: string) => void
  onSellingPointsChange: (value: string) => void
  onReferenceFileChange: (file: File | null) => void
}

function CommerceFields({ task, requirements, sellingPoints, onRequirementsChange, onSellingPointsChange, onReferenceFileChange }: CommerceFieldsProps) {
  return (
    <>
      {task === 'scene' && (
        <fieldset className="form-section">
          <label>场景描述<textarea value={requirements} onChange={(event) => onRequirementsChange(event.target.value)} placeholder="描述商品所在环境、光线和氛围" /></label>
          <label className="file-input compact"><ImagePlus size={18} /><span>添加场景参考图</span><input type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => onReferenceFileChange(event.target.files?.[0] ?? null)} /></label>
        </fieldset>
      )}
      {task === 'white-background' && <fieldset className="form-section"><label>精修要求<textarea value={requirements} onChange={(event) => onRequirementsChange(event.target.value)} placeholder="可选，例如保留自然阴影、修复边缘" /></label><label className="check-row"><input type="checkbox" defaultChecked />保留自然阴影</label></fieldset>}
      {task === 'selling-point' && <fieldset className="form-section"><label>商品卖点<textarea value={sellingPoints} onChange={(event) => onSellingPointsChange(event.target.value)} placeholder="每行一个卖点，至少填写一项" /></label><label>补充要求<textarea value={requirements} onChange={(event) => onRequirementsChange(event.target.value)} placeholder="画面风格与信息留白要求" /></label><label className="check-row"><input type="checkbox" defaultChecked />为后续文案排版预留空间</label></fieldset>}
      {task === 'detail-page' && <fieldset className="form-section"><label>内容模块<select defaultValue="core-selling-point"><option value="hero">首屏主视觉</option><option value="core-selling-point">核心卖点</option><option value="usage-scene">使用场景</option><option value="multi-angle">多角度</option><option value="specification">尺寸 / 参数</option><option value="material">材质 / 成分</option><option value="accessories">配件清单</option></select></label><label>商品卖点<textarea value={sellingPoints} onChange={(event) => onSellingPointsChange(event.target.value)} placeholder="可选，每行一个卖点" /></label><label>补充要求<textarea value={requirements} onChange={(event) => onRequirementsChange(event.target.value)} /></label></fieldset>}
    </>
  )
}
