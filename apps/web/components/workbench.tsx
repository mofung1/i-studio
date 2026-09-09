'use client'

import {
  Box,
  Check,
  ChevronDown,
  Image as ImageIcon,
  LayoutPanelLeft,
  Minus,
  Package,
  PanelRight,
  Palette,
  Plus,
  Sparkles,
  Upload,
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
  initialCount?: string
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

const detailModules = [
  ['hero', '首屏主视觉'],
  ['core-selling-point', '核心卖点'],
  ['usage-scene', '使用场景'],
  ['multi-angle', '多角度'],
  ['specification', '尺寸 / 参数'],
  ['material', '材质 / 成分'],
  ['accessories', '配件清单'],
] as const

const insightTags = [
  ['composition', '构图', '中心聚焦'],
  ['color', '色彩', '暖灰 + 琥珀'],
  ['material', '材质', '哑光金属'],
  ['lighting', '光影', '柔和侧光'],
  ['style', '风格', '现代极简'],
  ['atmosphere', '氛围', '安静专注'],
] as const

type VisualDirection = (typeof insightTags)[number][0]

export function Workbench({ initialMode, initialPrompt, initialTask, initialModel, initialAspectRatio, initialResolution, initialCount }: WorkbenchProps) {
  const router = useRouter()
  const [mode, setMode] = useState<WorkbenchMode>(initialMode)
  const [task, setTask] = useState<CommerceTaskType>(initialTask)
  const [configSide, setConfigSide] = useState<ConfigSide>('left')
  const [prompt, setPrompt] = useState(initialPrompt ?? '柔和晨光中的极简静物摄影，构图干净，材质细节清晰。')
  const [requirements, setRequirements] = useState('突出长效续航、舒适佩戴与沉浸降噪。画面干净克制，适合高端数码品牌。')
  const [productFile, setProductFile] = useState<File | null>(null)
  const [referenceFile, setReferenceFile] = useState<File | null>(null)
  const [hasProductImage, setHasProductImage] = useState(true)
  const [hasReferenceImage, setHasReferenceImage] = useState(true)
  const [count, setCount] = useState(() => Math.min(4, Math.max(1, Number(initialCount) || 1)))
  const [model, setModel] = useState<GenerationModel>((initialModel as GenerationModel) ?? 'gpt-image-2')
  const [aspectRatio, setAspectRatio] = useState(initialAspectRatio ?? '1:1')
  const [resolution, setResolution] = useState(initialResolution ?? '2K')
  const [platform, setPlatform] = useState('amazon')
  const [outputLanguage, setOutputLanguage] = useState<'zh-CN' | 'zh-TW' | 'en'>('en')
  const [detailModule, setDetailModule] = useState<(typeof detailModules)[number][0]>('core-selling-point')
  const [visualDirections, setVisualDirections] = useState<VisualDirection[]>(insightTags.map(([key]) => key))
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
    () => requirements.split(/[\n，。；]/).map((item) => item.trim()).filter(Boolean).slice(0, 8),
    [requirements],
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
        referenceAssetIds: hasReferenceImage ? ['local-reference'] : [],
        style: 'unspecified',
        referenceStrength: 'medium',
        ...imageSettings,
      }
    }

    const common = {
      mode: 'commerce',
      taskType: task,
      productAssetIds: hasProductImage ? ['local-product'] : [],
      productName: productFile?.name.replace(/\.[^.]+$/, '') || 'Aero H1',
      productCategory: '其他',
      platform,
      consistencyProtection: true,
      ...imageSettings,
    }

    if (task === 'white-background') return { ...common, requirements, naturalShadow: true }
    if (task === 'scene') return { ...common, sceneDescription: requirements, referenceAssetIds: hasReferenceImage ? ['local-reference'] : [], visualDirection: visualDirections }
    if (task === 'selling-point') return { ...common, sellingPoints: parsedSellingPoints, outputLanguage, requirements, reserveCopyArea: true }
    return { ...common, module: detailModule, sellingPoints: parsedSellingPoints, outputLanguage, requirements }
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

  function improveDescription() {
    setRequirements(mode === 'commerce'
      ? '突出商品核心卖点，保持外观和材质准确，使用克制的高端商业摄影风格。'
      : requirements)
    setNotice({ kind: 'success', message: '已优化画面描述' })
  }

  function toggleVisualDirection(direction: VisualDirection) {
    setVisualDirections((current) => current.includes(direction)
      ? current.filter((item) => item !== direction)
      : [...current, direction])
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
              {commerceTasks.map(([taskId, meta]) => <button key={taskId} className={task === taskId ? 'active' : ''} type="button" onClick={() => changeTask(taskId)}>{taskId === 'white-background' && <Box size={16} />}{taskId === 'scene' && <ImageIcon size={16} />}{taskId === 'selling-point' && <Sparkles size={16} />}{taskId === 'detail-page' && <Palette size={16} />}{meta.title}</button>)}
            </nav>
          ) : <strong className="workbench-title"><WandSparkles size={17} />通用生图</strong>}
          <Button asChild size="icon" variant="ghost"><Link href="/" aria-label="关闭工作台"><X size={20} /></Link></Button>
        </header>

        <aside className="configuration-panel">
          <div className="configuration-heading">
            <strong>生成配置</strong>
            <div className="side-toggle" aria-label="生成配置位置">
              <button className={configSide === 'left' ? 'active' : ''} type="button" aria-label="配置显示在左侧" aria-pressed={configSide === 'left'} onClick={() => setConfigSide('left')}><LayoutPanelLeft size={17} /></button>
              <button className={configSide === 'right' ? 'active' : ''} type="button" aria-label="配置显示在右侧" aria-pressed={configSide === 'right'} onClick={() => setConfigSide('right')}><PanelRight size={17} /></button>
            </div>
          </div>

          <div className="configuration-scroll">
            <fieldset className="form-section">
              <div className="field-heading"><legend>{mode === 'general' ? '参考图片' : '商品原图'}</legend><span>{mode === 'general' ? '可选，最多 4 张' : '支持 1-3 张，多角度效果更佳'}</span></div>
              <div className="upload-list">
                {(mode === 'general' ? hasReferenceImage : hasProductImage) && <div className="uploaded-thumb"><img src={mode === 'general' ? canvasImage : taskMeta.scene.image} alt="已选择图片" /><span>{mode === 'general' ? '参考' : '主图'}</span><button type="button" aria-label="删除图片" onClick={() => { if (mode === 'general') { setReferenceFile(null); setHasReferenceImage(false) } else { setProductFile(null); setHasProductImage(false) } }}><X size={13} /></button></div>}
                <label className="add-thumb"><Upload size={20} /><span>{(mode === 'general' ? hasReferenceImage : hasProductImage) ? '添加图片' : '选择图片'}</span><input type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => { const file = event.target.files?.[0] ?? null; if (mode === 'general') { setReferenceFile(file); setHasReferenceImage(Boolean(file)) } else { setProductFile(file); setHasProductImage(Boolean(file)) } }} /></label>
              </div>
            </fieldset>

            {mode === 'commerce' && (
              <fieldset className="form-section two-columns compact-fields">
                <label>上架平台<span className="select-shell"><select value={platform} onChange={(event) => setPlatform(event.target.value)}><option value="taobao-tmall">淘宝 / 天猫</option><option value="jd">京东</option><option value="douyin">抖音</option><option value="amazon">Amazon</option><option value="shopify">Shopify</option></select><ChevronDown size={14} /></span></label>
                <label>输出语言<span className="select-shell"><select value={outputLanguage} onChange={(event) => setOutputLanguage(event.target.value as typeof outputLanguage)}><option value="zh-CN">简体中文</option><option value="zh-TW">繁体中文</option><option value="en">English</option></select><ChevronDown size={14} /></span></label>
              </fieldset>
            )}

            {mode === 'general' ? (
              <fieldset className="form-section">
                <label>画面描述<textarea value={prompt} onChange={(event) => setPrompt(event.target.value)} /></label>
                <div className="two-columns">
                  <label>创作风格<span className="select-shell"><select defaultValue="unspecified"><option value="unspecified">不指定</option><option value="studio">摄影棚</option><option value="minimal">极简</option><option value="fresh">清新</option></select><ChevronDown size={14} /></span></label>
                  <label>参考强度<span className="select-shell"><select defaultValue="medium" disabled={!hasReferenceImage}><option value="low">低</option><option value="medium">中</option><option value="high">高</option></select><ChevronDown size={14} /></span></label>
                </div>
              </fieldset>
            ) : (
              <>
                <fieldset className="form-section">
                  <div className="field-heading"><legend>商品卖点与要求</legend><button className="ai-write" type="button" onClick={improveDescription}><WandSparkles size={15} />AI 优化</button></div>
                  <textarea value={requirements} onChange={(event) => setRequirements(event.target.value)} placeholder="描述商品卖点、目标场景和画面要求" />
                </fieldset>
                {task === 'detail-page' && <fieldset className="form-section"><div className="field-heading stacked"><legend>详情页内容模块</legend><span>选择本页要表达的一个主题</span></div><div className="module-grid">{detailModules.map(([value, label]) => <button key={value} className={detailModule === value ? 'selected' : ''} type="button" onClick={() => setDetailModule(value)}>{detailModule === value && <Check size={13} />}{label}</button>)}</div></fieldset>}
                <fieldset className="form-section">
                  <div className="field-heading"><legend>视觉方向</legend><span>取消不希望参考的维度</span></div>
                  <div className="reference-insight"><img src={taskMeta.scene.image} alt="视觉参考" /><div><strong>智能匹配</strong><span>基于商品图推荐当前方向</span></div><Sparkles size={17} /></div>
                  <div className="insight-chips">{insightTags.map(([value, label, detail]) => <button key={value} className={visualDirections.includes(value) ? 'selected' : ''} type="button" onClick={() => toggleVisualDirection(value)}><span>{label}</span>{detail}{visualDirections.includes(value) && <Check size={12} />}</button>)}</div>
                </fieldset>
              </>
            )}

            <fieldset className="form-section">
              <div className="field-heading"><legend>画面设置</legend><span>默认生成 1 张</span></div>
              <div className="settings-grid">
                <span className="select-shell"><select aria-label="画面比例" value={aspectRatio} onChange={(event) => setAspectRatio(event.target.value)}><option>1:1</option><option>3:4</option><option>4:3</option><option>9:16</option><option>16:9</option></select><ChevronDown size={14} /></span>
                <span className="select-shell"><select aria-label="清晰度" value={resolution} onChange={(event) => setResolution(event.target.value)}><option>1K</option><option>2K</option><option>4K</option></select><ChevronDown size={14} /></span>
                <div className="stepper"><button type="button" aria-label="减少生成数量" disabled={count === 1} onClick={() => setCount((value) => Math.max(1, value - 1))}><Minus size={15} /></button><strong>{count}</strong><button type="button" aria-label="增加生成数量" disabled={count === 4} onClick={() => setCount((value) => Math.min(4, value + 1))}><Plus size={15} /></button></div>
              </div>
            </fieldset>
          </div>

          <footer className="configuration-footer">
            {notice && <p className={`form-notice ${notice.kind}`} role="status">{notice.kind === 'success' && <Check size={15} />}{notice.message}</p>}
            <label className="model-button"><Sparkles size={16} /><select aria-label="生图模型" value={model} onChange={(event) => setModel(event.target.value as GenerationModel)}><option value="gpt-image-2">Auto · 推荐</option><option value="gemini-2.5-flash-image">Gemini 2.5 Flash</option><option value="gemini-3.1-flash-image">Gemini 3.1 Flash</option><option value="gemini-3-pro-image">Gemini 3 Pro Image</option></select><ChevronDown size={14} /></label>
            <Button onClick={createGenerationTask}><Sparkles size={17} />生成 {title}</Button>
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
