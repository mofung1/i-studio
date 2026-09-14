'use client'

import {
  Box,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Download,
  Image as ImageIcon,
  LayoutPanelLeft,
  Minus,
  Package,
  PanelRight,
  Palette,
  Plus,
  RefreshCw,
  RotateCcw,
  Sparkles,
  Upload,
  WandSparkles,
  X,
} from 'lucide-react'
import Link from 'next/link'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { useCallback, useEffect, useRef, useState } from 'react'

import {
  generationInputSchema,
  type GenerationModel,
  type CommerceTaskType,
  type GenerationInput,
} from '@istudio/contracts'
import { Button } from '@istudio/ui'

import { AuthenticatedImage, downloadProtectedAsset } from '@/components/authenticated-image'
import { apiBaseUrl, getAccessToken, readApiError, uploadAsset } from '@/lib/api'

type WorkbenchMode = 'general' | 'commerce'
type ConfigSide = 'left' | 'right'

type InlineGenerationTask = {
  id: string
  status: string
  resultImages?: string[]
  errorMessage?: string
}

const terminalStatuses = new Set(['succeeded', 'failed', 'cancelled', 'expired'])
const generationStatusLabels: Record<string, string> = {
  queued: '排队中，前面还有任务',
  processing: '正在生成',
  waiting_provider: '已提交给 AI 服务，等待返回',
}

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

// 场景风格图库：每个条目带预览图、中文名和自动填入的场景描述
const sceneStyles = [
  {
    id: 'indoor-minimal',
    label: '简约室内',
    description: '白色极简室内背景，柔和自然散射光，浅灰木纹桌面，干净留白',
    image: 'https://images.unsplash.com/photo-1586023492125-27b2c045efd7?auto=format&fit=crop&w=400&q=75',
  },
  {
    id: 'nordic-wood',
    label: '北欧木质',
    description: '浅木色原木桌面，北欧风室内，暖白自然光，温馨简约氛围',
    image: 'https://images.unsplash.com/photo-1555041469-a586c61ea9bc?auto=format&fit=crop&w=400&q=75',
  },
  {
    id: 'outdoor-natural',
    label: '户外自然',
    description: '户外自然环境，绿植背景，柔和日光，清新通透的氛围',
    image: 'https://images.unsplash.com/photo-1441974231531-c6227db76b6e?auto=format&fit=crop&w=400&q=75',
  },
  {
    id: 'flat-lay',
    label: '俯拍平铺',
    description: '俯视角度，平铺摆拍，浅色背景，物品有序排列，构图干净',
    image: 'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?auto=format&fit=crop&w=400&q=75',
  },
  {
    id: 'tech-dark',
    label: '科技深色',
    description: '深色科技感背景，冷色调打光，硬朗光影，精密材质细节突出',
    image: 'https://images.unsplash.com/photo-1518770660439-4636190af475?auto=format&fit=crop&w=400&q=75',
  },
  {
    id: 'lifestyle',
    label: '生活场景',
    description: '真实生活使用场景，暖色调居家环境，自然随意的生活感',
    image: 'https://images.unsplash.com/photo-1556909114-f6e7ad7d3136?auto=format&fit=crop&w=400&q=75',
  },
  {
    id: 'gradient-studio',
    label: '渐变摄影棚',
    description: '摄影棚渐变背景，专业商业打光，阴影自然，主体突出',
    image: 'https://images.unsplash.com/photo-1560472354-b33ff0c44a43?auto=format&fit=crop&w=400&q=75',
  },
  {
    id: 'holiday',
    label: '节日氛围',
    description: '节日氛围装饰背景，暖色调，彩带或鲜花点缀，喜庆温馨',
    image: 'https://images.unsplash.com/photo-1512389142860-9c449e58a543?auto=format&fit=crop&w=400&q=75',
  },
] as const

type SceneStyleId = (typeof sceneStyles)[number]['id']

type VisualDirection = (typeof insightTags)[number][0]
type GeneralStyle = 'unspecified' | 'studio' | 'minimal' | 'fresh' | 'technology' | 'guochao'
type ReferenceStrength = 'low' | 'medium' | 'high'

const MAX_SELLING_POINTS = 8

function SellingPointTagInput({
  tags,
  onChange,
}: {
  tags: string[]
  onChange: (tags: string[]) => void
}) {
  const [inputValue, setInputValue] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  const atMax = tags.length >= MAX_SELLING_POINTS

  function addTag(raw: string) {
    const trimmed = raw.trim().replace(/,|，/g, '').trim()
    if (!trimmed || tags.includes(trimmed) || tags.length >= MAX_SELLING_POINTS) return
    onChange([...tags, trimmed])
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Enter' || event.key === ',' || event.key === '，') {
      event.preventDefault()
      addTag(inputValue)
      setInputValue('')
    } else if (event.key === 'Backspace' && inputValue === '' && tags.length > 0) {
      onChange(tags.slice(0, -1))
    }
  }

  function handleBlur() {
    if (inputValue.trim()) {
      addTag(inputValue)
      setInputValue('')
    }
  }

  return (
    <div
      className={`selling-point-input${atMax ? ' at-max' : ''}`}
      onClick={() => inputRef.current?.focus()}
      role="group"
      aria-label="卖点标签输入"
    >
      {tags.map((tag, index) => (
        <span key={tag} className="sp-tag">
          {tag}
          <button
            type="button"
            aria-label={`删除卖点：${tag}`}
            onClick={(e) => { e.stopPropagation(); onChange(tags.filter((_, i) => i !== index)) }}
          >
            <X size={11} />
          </button>
        </span>
      ))}
      {!atMax && (
        <input
          ref={inputRef}
          type="text"
          className="sp-tag-input"
          value={inputValue}
          placeholder={tags.length === 0 ? '输入卖点，回车或逗号分隔' : '继续添加…'}
          maxLength={50}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={handleKeyDown}
          onBlur={handleBlur}
          aria-label="输入卖点"
        />
      )}
    </div>
  )
}

function SelectedImageThumbnail({ file, label, onRemove }: { file: File; label: string; onRemove: () => void }) {
  const [preview, setPreview] = useState('')

  useEffect(() => {
    const url = URL.createObjectURL(file)
    setPreview(url)
    return () => URL.revokeObjectURL(url)
  }, [file])

  return (
    <div className="uploaded-thumb">
      {preview ? <img src={preview} alt={`${label}：${file.name}`} /> : null}
      <span>{label}</span>
      <button type="button" aria-label={`删除${label}`} onClick={onRemove}><X size={13} /></button>
    </div>
  )
}

export function Workbench({ initialMode, initialPrompt, initialTask, initialModel, initialAspectRatio, initialResolution, initialCount }: WorkbenchProps) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [mode, setMode] = useState<WorkbenchMode>(initialMode)
  const [task, setTask] = useState<CommerceTaskType>(initialTask)
  const [configSide, setConfigSide] = useState<ConfigSide>('left')
  const [prompt, setPrompt] = useState(initialPrompt ?? '柔和晨光中的极简静物摄影，构图干净，材质细节清晰。')
  const [requirements, setRequirements] = useState('')
  const [sceneStyleId, setSceneStyleId] = useState<SceneStyleId | null>(null)
  const [sellingPointTags, setSellingPointTags] = useState<string[]>([])
  const [productFiles, setProductFiles] = useState<File[]>([])
  const [referenceFiles, setReferenceFiles] = useState<File[]>([])
  const [count, setCount] = useState(() => Math.min(4, Math.max(1, Number(initialCount) || 1)))
  const [model, setModel] = useState<GenerationModel>((initialModel as GenerationModel) ?? 'gpt-image-2')
  const [aspectRatio, setAspectRatio] = useState(initialAspectRatio ?? '1:1')
  const [resolution, setResolution] = useState(initialResolution ?? '2K')
  const [style, setStyle] = useState<GeneralStyle>('unspecified')
  const [referenceStrength, setReferenceStrength] = useState<ReferenceStrength>('medium')
  const [productName, setProductName] = useState('')
  const [productCategory, setProductCategory] = useState('')
  const [fieldErrors, setFieldErrors] = useState<{ productName?: string }>({})
  const [platform, setPlatform] = useState('amazon')
  const [outputLanguage, setOutputLanguage] = useState<'zh-CN' | 'zh-TW' | 'en'>('en')
  const [detailModule, setDetailModule] = useState<(typeof detailModules)[number][0]>('core-selling-point')
  const [visualDirections, setVisualDirections] = useState<VisualDirection[]>(insightTags.map(([key]) => key))
  const [notice, setNotice] = useState<{ kind: 'success' | 'error'; message: string } | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [aiEnabled, setAiEnabled] = useState<boolean | null>(null)
  // 历史生成结果列表，每次成功生成追加一项，支持切换查看
  const [resultHistory, setResultHistory] = useState<InlineGenerationTask[]>([])
  const [activeResultIndex, setActiveResultIndex] = useState(0)
  const [generationTask, setGenerationTask] = useState<InlineGenerationTask | null>(null)
  const hasProductImage = productFiles.length > 0
  const hasReferenceImage = referenceFiles.length > 0
  const isGenerating = Boolean(generationTask && !terminalStatuses.has(generationTask.status))
  const activeResult = resultHistory[activeResultIndex] ?? null

  useEffect(() => {
    const savedSide = window.localStorage.getItem('istudio-config-side')
    setConfigSide(savedSide === 'right' ? 'right' : 'left')
  }, [])

  useEffect(() => {
    window.localStorage.setItem('istudio-config-side', configSide)
  }, [configSide])

  useEffect(() => {
    fetch(`${apiBaseUrl}/v1/generation/capabilities`)
      .then((response) => response.json())
      .then((data: { aiEnabled?: boolean }) => setAiEnabled(Boolean(data.aiEnabled)))
      .catch(() => setAiEnabled(false))
  }, [])

  useEffect(() => {
    if (!generationTask || terminalStatuses.has(generationTask.status)) return

    let cancelled = false
    let timer = 0
    const loadTask = async () => {
      try {
        const token = getAccessToken()
        if (!token) return
        const response = await fetch(`${apiBaseUrl}/v1/generation/tasks/${generationTask.id}`, {
          headers: { Authorization: `Bearer ${token}` },
        })
        if (!response.ok) throw new Error(await readApiError(response, '任务状态获取失败'))
        const data = await response.json() as { task: InlineGenerationTask }
        if (cancelled) return
        setGenerationTask(data.task)
        // 任务完成后追加到历史列表，切换到最新结果
        if (terminalStatuses.has(data.task.status) && data.task.status === 'succeeded') {
          setResultHistory((prev) => {
            const next = [...prev, data.task]
            setActiveResultIndex(next.length - 1)
            return next
          })
        }
        if (!terminalStatuses.has(data.task.status)) timer = window.setTimeout(loadTask, 3000)
      } catch (error) {
        if (cancelled) return
        setGenerationTask((current) => current ? {
          ...current,
          status: 'failed',
          errorMessage: error instanceof Error ? error.message : '任务状态获取失败',
        } : current)
      }
    }

    void loadTask()
    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [generationTask?.id, generationTask?.status])

  const currentTask = taskMeta[task]
  const canvasImage = mode === 'general'
    ? 'https://images.unsplash.com/photo-1556228578-8c89e6adf883?auto=format&fit=crop&w=1400&q=88'
    : currentTask.image

  const title = mode === 'general' ? '通用生图' : currentTask.title
  const description = mode === 'general' ? '用文字描述或参考图片构建画面' : currentTask.description

  const requirementsPlaceholder = task === 'scene'
    ? '描述目标场景、光线和氛围'
    : '补充背景、阴影和商品呈现要求'

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

  function buildPayload(productAssetIds: string[], referenceAssetIds: string[]): unknown {
    const imageSettings = { model, aspectRatio, resolution, count }

    if (mode === 'general') {
      return {
        mode: 'general',
        prompt,
        referenceAssetIds,
        style,
        referenceStrength,
        ...imageSettings,
      }
    }

    const common = {
      mode: 'commerce',
      taskType: task,
      productAssetIds,
      productName: productName.trim(),
      productCategory: productCategory.trim() || '未分类',
      platform,
      consistencyProtection: true,
      ...imageSettings,
    }

    if (task === 'white-background') return { ...common, requirements, naturalShadow: true }
    if (task === 'scene') return { ...common, sceneDescription: requirements, referenceAssetIds, visualDirection: [] }
    if (task === 'selling-point') return { ...common, sellingPoints: sellingPointTags, outputLanguage, requirements, reserveCopyArea: true }
    return { ...common, module: detailModule, sellingPoints: sellingPointTags, outputLanguage, requirements }
  }

  async function createGenerationTask() {
    const token = getAccessToken()
    if (!token) {
      const currentUrl = `${pathname}${searchParams.size ? `?${searchParams.toString()}` : ''}`
      router.push(`/login?next=${encodeURIComponent(currentUrl)}`)
      return
    }
    if (aiEnabled === false) {
      setNotice({ kind: 'error', message: 'AI 服务尚未配置，请先在后端设置供应商密钥' })
      return
    }
    if (mode === 'commerce' && !hasProductImage) {
      setNotice({ kind: 'error', message: '请先上传商品原图' })
      return
    }
    if (mode === 'commerce' && !productName.trim()) {
      setFieldErrors({ productName: '请输入商品名称' })
      return
    }

    setIsSubmitting(true)
    setFieldErrors({})
    setNotice(null)
    setGenerationTask(null)
    try {
      const draftResult = generationInputSchema.safeParse(buildPayload(
        productFiles.map((_, index) => `pending-product-${index}`),
        referenceFiles.map((_, index) => `pending-reference-${index}`),
      ))
      if (!draftResult.success) {
        const firstIssue = draftResult.error.issues[0]
        throw new Error(firstIssue?.message ?? '请完成必填配置')
      }
      const [productAssetIds, referenceAssetIds] = await Promise.all([
        Promise.all(productFiles.map((file) => uploadAsset(file, token))),
        Promise.all(referenceFiles.map((file) => uploadAsset(file, token))),
      ])
      const result = generationInputSchema.safeParse(buildPayload(productAssetIds, referenceAssetIds))

      if (!result.success) {
        const firstIssue = result.error.issues[0]
        throw new Error(firstIssue?.message ?? '请完成必填配置')
      }

      const validatedInput: GenerationInput = result.data
      const response = await fetch(`${apiBaseUrl}/v1/generation/tasks`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(validatedInput),
      })
      if (response.status === 401) {
        const currentUrl = `${pathname}${searchParams.size ? `?${searchParams.toString()}` : ''}`
        router.push(`/login?next=${encodeURIComponent(currentUrl)}`)
        return
      }
      if (!response.ok) throw new Error(await readApiError(response, '任务创建失败'))
      const data = await response.json() as { task: InlineGenerationTask; message: string }
      setGenerationTask(data.task)
      setNotice({ kind: 'success', message: '任务已提交，结果将在当前页面显示' })
    } catch (error) {
      setNotice({ kind: 'error', message: error instanceof Error ? error.message : '任务创建失败，请稍后重试' })
    } finally {
      setIsSubmitting(false)
    }
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
                {(mode === 'general' ? referenceFiles : productFiles).map((file, index) => (
                  <SelectedImageThumbnail
                    key={`${file.name}-${file.size}-${file.lastModified}-${index}`}
                    file={file}
                    label={mode === 'general' ? `参考 ${index + 1}` : index === 0 ? '主图' : `辅图 ${index}`}
                    onRemove={() => mode === 'general'
                      ? setReferenceFiles((current) => current.filter((_, fileIndex) => fileIndex !== index))
                      : setProductFiles((current) => current.filter((_, fileIndex) => fileIndex !== index))}
                  />
                ))}
                {(mode === 'general' ? referenceFiles.length < 4 : productFiles.length < 3) && <label className="add-thumb"><Upload size={20} /><span>添加图片</span><input multiple type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => {
                  const selectedFiles = Array.from(event.target.files ?? [])
                  if (mode === 'general') setReferenceFiles((current) => [...current, ...selectedFiles].slice(0, 4))
                  else setProductFiles((current) => [...current, ...selectedFiles].slice(0, 3))
                  event.target.value = ''
                }} /></label>}
              </div>
            </fieldset>

            {mode === 'commerce' && (
              <fieldset className="form-section compact-fields">
                <label>商品名称<input type="text" value={productName} aria-invalid={Boolean(fieldErrors.productName)} onChange={(event) => { setProductName(event.target.value); setFieldErrors({}) }} placeholder="请输入商品名称" />{fieldErrors.productName && <span className="field-error">{fieldErrors.productName}</span>}</label>
                <label>商品类目<input type="text" list="product-categories" value={productCategory} onChange={(event) => setProductCategory(event.target.value)} placeholder="选填，可选择或手动输入" /><datalist id="product-categories"><option value="服饰鞋包" /><option value="美妆护肤" /><option value="食品饮料" /><option value="家居家电" /><option value="数码电子" /><option value="母婴用品" /><option value="运动户外" /></datalist></label>
              </fieldset>
            )}

            {mode === 'commerce' && (
              <fieldset className="form-section two-columns compact-fields">
                <label>上架平台<span className="select-shell"><select value={platform} onChange={(event) => setPlatform(event.target.value)}><option value="taobao-tmall">淘宝 / 天猫</option><option value="jd">京东</option><option value="douyin">抖音</option><option value="amazon">Amazon</option><option value="shopify">Shopify</option></select><ChevronDown size={14} /></span></label>
                <label>输出语言<span className="select-shell"><select value={outputLanguage} onChange={(event) => setOutputLanguage(event.target.value as typeof outputLanguage)}><option value="zh-CN">简体中文</option><option value="zh-TW">繁体中文</option><option value="en">English</option></select><ChevronDown size={14} /></span></label>
              </fieldset>
            )}

            {mode === 'commerce' && task === 'scene' && (
              <fieldset className="form-section">
                <div className="field-heading"><legend>参考图片</legend><span>可选，最多 4 张</span></div>
                <div className="upload-list">
                  {referenceFiles.map((file, index) => <SelectedImageThumbnail key={`${file.name}-${file.size}-${file.lastModified}-${index}`} file={file} label={`参考 ${index + 1}`} onRemove={() => setReferenceFiles((current) => current.filter((_, fileIndex) => fileIndex !== index))} />)}
                  {referenceFiles.length < 4 && <label className="add-thumb"><Upload size={20} /><span>添加图片</span><input multiple type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => { setReferenceFiles((current) => [...current, ...Array.from(event.target.files ?? [])].slice(0, 4)); event.target.value = '' }} /></label>}
                </div>
              </fieldset>
            )}

            {mode === 'general' ? (
              <fieldset className="form-section">
                <label>画面描述<textarea value={prompt} onChange={(event) => setPrompt(event.target.value)} /></label>
                <div className="two-columns">
                  <label>创作风格<span className="select-shell"><select value={style} onChange={(event) => setStyle(event.target.value as GeneralStyle)}><option value="unspecified">不指定</option><option value="studio">摄影棚</option><option value="minimal">极简</option><option value="fresh">清新</option><option value="technology">科技</option><option value="guochao">国潮</option></select><ChevronDown size={14} /></span></label>
                  <label>参考强度<span className="select-shell"><select value={referenceStrength} onChange={(event) => setReferenceStrength(event.target.value as ReferenceStrength)}><option value="low">低</option><option value="medium">中</option><option value="high">高</option></select><ChevronDown size={14} /></span></label>
                </div>
              </fieldset>
            ) : (
              <>
                {(task === 'selling-point' || task === 'detail-page') ? (
                  <fieldset className="form-section">
                    <div className="field-heading">
                      <legend>商品卖点</legend>
                      <span>{sellingPointTags.length}/{MAX_SELLING_POINTS}</span>
                    </div>
                    <SellingPointTagInput tags={sellingPointTags} onChange={setSellingPointTags} />
                    {sellingPointTags.length >= MAX_SELLING_POINTS && (
                      <p className="field-helper">已达到最多 {MAX_SELLING_POINTS} 条</p>
                    )}
                  </fieldset>
                ) : (
                  <fieldset className="form-section">
                    <div className="field-heading"><legend>补充要求</legend></div>
                    <textarea value={requirements} onChange={(event) => setRequirements(event.target.value)} placeholder={requirementsPlaceholder} />
                  </fieldset>
                )}
                {task === 'detail-page' && <fieldset className="form-section"><div className="field-heading stacked"><legend>详情页内容模块</legend><span>选择本页要表达的一个主题</span></div><div className="module-grid">{detailModules.map(([value, label]) => <button key={value} className={detailModule === value ? 'selected' : ''} type="button" onClick={() => setDetailModule(value)}>{detailModule === value && <Check size={13} />}{label}</button>)}</div></fieldset>}
                {task === 'scene' && <fieldset className="form-section">
                  <div className="field-heading stacked">
                    <legend>场景风格</legend>
                    <span>选择后自动填入场景描述，可手动修改</span>
                  </div>
                  <div className="scene-style-grid">
                    {sceneStyles.map((s) => (
                      <button
                        key={s.id}
                        type="button"
                        className={`scene-style-card${sceneStyleId === s.id ? ' selected' : ''}`}
                        onClick={() => {
                          const next = sceneStyleId === s.id ? null : s.id as SceneStyleId
                          setSceneStyleId(next)
                          setRequirements(next ? s.description : '')
                        }}
                        aria-pressed={sceneStyleId === s.id}
                      >
                        <img src={s.image} alt={s.label} />
                        <span>{s.label}</span>
                        {sceneStyleId === s.id && <span className="scene-style-check"><Check size={10} /></span>}
                      </button>
                    ))}
                  </div>
                  <textarea
                    className="scene-desc-textarea"
                    value={requirements}
                    onChange={(event) => { setRequirements(event.target.value); setSceneStyleId(null) }}
                    placeholder="描述目标场景、光线和氛围，或从上方选择风格快速填入"
                  />
                </fieldset>}
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
            <label className="model-button"><Sparkles size={16} /><select aria-label="生图模型" value={model} onChange={(event) => setModel(event.target.value as GenerationModel)}><option value="gpt-image-2">GPT Image 2</option><option value="gemini-2.5-flash-image">Gemini 2.5 Flash</option><option value="gemini-3.1-flash-image">Gemini 3.1 Flash</option><option value="gemini-3-pro-image">Gemini 3 Pro Image</option></select><ChevronDown size={14} /></label>
          <Button disabled={isSubmitting || isGenerating || aiEnabled === null} onClick={createGenerationTask}><Sparkles size={17} />{isSubmitting ? '正在提交…' : isGenerating ? '正在生成…' : aiEnabled === null ? '检查 AI 服务…' : `生成 ${title}`}</Button>
          </footer>
        </aside>

        <section className={`creation-canvas ${(resultHistory.length > 0 || isGenerating) ? 'has-generation-result' : ''}`}>
          {resultHistory.length === 0 && !isGenerating && <>
            <div className="canvas-copy"><span>{mode === 'general' ? 'AI 图片' : '电商工具'}</span><h1>{title}</h1><p>{description}</p></div>
            <div className="canvas-preview">
              <img src={canvasImage} alt={`${title}效果预览`} />
              <span>效果预览</span>
            </div>
            <p className="integration-note"><Box size={16} />当前展示设计参考图；尚未调用 AI，也不会产生费用。</p>
          </>}

          {isGenerating && <div className="generation-feedback">
            <span className="generation-status-icon"><Sparkles size={22} /></span>
            <h2>{generationStatusLabels[generationTask?.status ?? ''] ?? '任务处理中'}</h2>
            <p>结果返回后会自动显示在当前页面。</p>
            <div className="generation-progress" aria-label="任务处理中"><span /></div>
          </div>}

          {!isGenerating && generationTask && generationTask.status !== 'succeeded' && resultHistory.length === 0 && (
            <div className="inline-generation-error"><strong>生成失败</strong><span>{generationTask.errorMessage || '供应商未返回错误详情，请重试。'}</span></div>
          )}

          {resultHistory.length > 0 && !isGenerating && activeResult && activeResult.resultImages?.length ? (
            <div className="editor-result">
              {/* 历史结果导航栏 */}
              {resultHistory.length > 1 && (
                <div className="result-history-nav" role="navigation" aria-label="历史生成结果">
                  <button
                    type="button"
                    aria-label="上一次结果"
                    disabled={activeResultIndex === 0}
                    onClick={() => setActiveResultIndex((i) => Math.max(0, i - 1))}
                  >
                    <ChevronLeft size={15} />
                  </button>
                  <span>第 {activeResultIndex + 1} / {resultHistory.length} 次</span>
                  <button
                    type="button"
                    aria-label="下一次结果"
                    disabled={activeResultIndex === resultHistory.length - 1}
                    onClick={() => setActiveResultIndex((i) => Math.min(resultHistory.length - 1, i + 1))}
                  >
                    <ChevronRight size={15} />
                  </button>
                </div>
              )}

              <div className="result-topline">
                <div><span className="success-label"><Check size={13} />生成完成</span><h2>{title}</h2></div>
                <span>{activeResult.resultImages.length} 张图片</span>
              </div>

              <div className="inline-result-grid">
                {activeResult.resultImages.map((path, index) => (
                  <div className="inline-result-image" key={path}>
                    <AuthenticatedImage path={path} alt={`AI 生成结果 ${index + 1}`} />
                    <span className="ai-badge">AI 生成</span>
                    <div className="result-image-actions">
                      <button
                        type="button"
                        aria-label={`下载第 ${index + 1} 张图片`}
                        title="下载"
                        onClick={() => void downloadProtectedAsset(path, `istudio-${activeResult.id.slice(0, 8)}-${index + 1}.png`)}
                      >
                        <Download size={15} />
                      </button>
                      <button
                        type="button"
                        aria-label={`以第 ${index + 1} 张图片为参考再生成`}
                        title="以此图为参考再生成"
                        onClick={async () => {
                          // 将已生成图片下载为 Blob，转换为 File，填入 referenceFiles
                          const url = path.startsWith('/') ? `${apiBaseUrl}${path}` : path
                          const token = getAccessToken()
                          const resp = await fetch(url, {
                            headers: token ? { Authorization: `Bearer ${token}` } : undefined,
                          })
                          if (!resp.ok) return
                          const blob = await resp.blob()
                          const filename = `ref-${activeResult.id.slice(0, 8)}-${index + 1}.png`
                          const file = new File([blob], filename, { type: blob.type || 'image/png' })
                          setReferenceFiles((prev) => [...prev, file].slice(0, 4))
                          // 滚动配置面板至顶部（让用户看到参考图已填入）
                          document.querySelector('.configuration-scroll')?.scrollTo({ top: 0, behavior: 'smooth' })
                        }}
                      >
                        <RotateCcw size={15} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              {/* 继续调整操作行 */}
              <div className="result-action-bar">
                <button
                  type="button"
                  className="result-action-btn"
                  disabled={isSubmitting || isGenerating || aiEnabled === null}
                  onClick={() => void createGenerationTask()}
                >
                  <RefreshCw size={14} />修改参数重新生成
                </button>
                <p className="integration-note" style={{ margin: 0 }}>
                  <RefreshCw size={14} />结果已保存到任务记录
                </p>
              </div>
            </div>
          ) : null}
        </section>
      </section>
    </main>
  )
}
