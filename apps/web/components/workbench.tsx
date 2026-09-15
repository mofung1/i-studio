'use client'

import {
  Box,
  Check,
  ChevronLeft,
  ChevronRight,
  Download,
  Image as ImageIcon,
  LayoutPanelLeft,
  Package,
  PanelRight,
  Palette,
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
import { createPortal } from 'react-dom'

import {
  generationInputSchema,
  type GenerationModel,
  type CommerceTaskType,
  type GenerationInput,
} from '@istudio/contracts'
import { Button } from '@istudio/ui'

import { AuthenticatedImage, downloadProtectedAsset } from '@/components/authenticated-image'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/select'
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
  'product-main': {
    title: '商品主图',
    description: '生成适配平台规范的商品主视觉',
    image: 'https://images.unsplash.com/photo-1602143407151-7111542de6e8?auto=format&fit=crop&w=1400&q=88',
  },
  'detail-page': {
    title: '详情页',
    description: '围绕商品信息生成详情页素材',
    image: 'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?auto=format&fit=crop&w=1400&q=88',
  },
  'viral-recreate': {
    title: '爆款复刻',
    description: '参考爆款视觉重构商品画面',
    image: 'https://images.unsplash.com/photo-1542291026-7eec264c27ff?auto=format&fit=crop&w=1400&q=88',
  },
  'product-retouch': {
    title: '产品精修',
    description: '修复和提升商品原图质量',
    image: 'https://images.unsplash.com/photo-1556228578-8c89e6adf883?auto=format&fit=crop&w=1400&q=88',
  },
}

const commerceTasks = Object.entries(taskMeta) as Array<[CommerceTaskType, (typeof taskMeta)[CommerceTaskType]]>

const productMainModules = [['hero', '主图首图'], ['white', '白底主图'], ['selling', '卖点主图'], ['scene', '场景主图'], ['detail', '细节主图']] as const
const detailModules = [['hero', '首屏主视觉'], ['selling', '核心卖点图'], ['scene', '场景应用图'], ['detail', '产品细节图'], ['spec', '规格参数图'], ['feedback', '用户反馈图'], ['package', '包装内容图'], ['brand', '品牌故事图'], ['certificate', '品质认证图'], ['install', '安装指引图'], ['faq', '常见问题图'], ['size', '尺码对照图'], ['material', '材质纹理图'], ['promotion', '结尾促销图']] as const

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
type ModuleMode = 'smart' | 'custom'
const platformOptions = [['smart', '智能匹配'], ['taobao', '淘宝'], ['1688', '1688'], ['tmall', '天猫'], ['pinduoduo', '拼多多'], ['jd', '京东'], ['douyin', '抖音'], ['amazon', '亚马逊'], ['temu', 'TEMU'], ['ebay', 'eBay']] as const
const languageOptions = [['none', '无文字（纯视觉）'], ['zh-CN', '中文（简体）'], ['zh-TW', '中文（繁体）'], ['en', '英文'], ['ja', '日语'], ['ko', '韩文'], ['th', '泰语'], ['ms', '马来语'], ['id', '印尼语'], ['ru', '俄语']] as const
const retouchOptions = [['gloss', '增强产品光泽'], ['repair', '修复划痕瑕疵'], ['clarity', '提升整体清晰度'], ['color', '色彩校正'], ['perspective', '修正透视变形'], ['background', '背景净化']] as const

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
  const [expanded, setExpanded] = useState(false)

  useEffect(() => {
    const url = URL.createObjectURL(file)
    setPreview(url)
    return () => URL.revokeObjectURL(url)
  }, [file])

  useEffect(() => {
    if (!expanded) return
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setExpanded(false)
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [expanded])

  return (
    <>
      <div className="uploaded-thumb">
        {preview && <button className="thumb-preview" type="button" aria-label={`放大查看${label}`} title="放大查看" onClick={() => setExpanded(true)}><img src={preview} alt={`${label}：${file.name}`} /></button>}
        <span>{label}</span>
        <button className="thumb-remove" type="button" aria-label={`删除${label}`} title="删除图片" onClick={onRemove}><X size={13} /></button>
      </div>
      {expanded && preview && createPortal(
        <div className="image-lightbox" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setExpanded(false) }}>
          <div className="image-lightbox-content" role="dialog" aria-modal="true" aria-label={`${label}图片预览`}>
            <button type="button" aria-label="关闭图片预览" title="关闭" autoFocus onClick={() => setExpanded(false)}><X size={20} /></button>
            <img src={preview} alt={`${label}：${file.name}`} />
            <span>{file.name}</span>
          </div>
        </div>, document.body,
      )}
    </>
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
  const [productFiles, setProductFiles] = useState<File[]>([])
  const [referenceFiles, setReferenceFiles] = useState<File[]>([])
  const [count, setCount] = useState(() => Math.min(16, Math.max(1, Number(initialCount) || 1)))
  const [model, setModel] = useState<GenerationModel>((initialModel as GenerationModel) ?? 'gpt-image-2')
  const [aspectRatio, setAspectRatio] = useState(initialAspectRatio ?? '1:1')
  const [resolution, setResolution] = useState(initialResolution ?? '2K')
  const [style, setStyle] = useState<GeneralStyle>('unspecified')
  const [referenceStrength, setReferenceStrength] = useState<ReferenceStrength>('medium')
  const [platform, setPlatform] = useState('smart')
  const [outputLanguage, setOutputLanguage] = useState('none')
  const [moduleMode, setModuleMode] = useState<ModuleMode>('smart')
  const [moduleCounts, setModuleCounts] = useState<Record<string, number>>({})
  const [recreateStrength, setRecreateStrength] = useState<'style' | 'high'>('style')
  const [enhancements, setEnhancements] = useState<string[]>([])
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

  const requirementsPlaceholder = task === 'product-main' || task === 'detail-page'
    ? '建议输入：产品名称，核心卖点，目标人群，主图风格，平台规范等'
    : '选填，例如：去除背景杂物、增强产品光泽、修复划痕、提升整体清晰度等'

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
    const moduleKeys = task === 'product-main' ? productMainModules.map(([value]) => value) : detailModules.map(([value]) => value)
    const normalizedModuleCounts = Object.fromEntries(Object.entries(moduleCounts).filter(([key]) => moduleKeys.some((moduleKey) => moduleKey === key)))
    const commerceCount = task === 'product-main' || task === 'detail-page'
      ? moduleMode === 'custom' ? Math.max(1, Object.values(normalizedModuleCounts).reduce((total, value) => total + value, 0)) : 1
      : 1
    const imageSettings = { model, aspectRatio, resolution, count: mode === 'general' ? count : commerceCount }

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
      platform,
      consistencyProtection: true,
      ...imageSettings,
    }

    if (task === 'product-main' || task === 'detail-page') return { ...common, requirements, outputLanguage, moduleMode, moduleCounts: normalizedModuleCounts }
    if (task === 'viral-recreate') return { ...common, referenceAssetIds, recreateStrength, requirements, outputLanguage }
    return { ...common, enhancements, requirements }
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
    if (mode === 'commerce' && task === 'viral-recreate' && referenceFiles.length !== 1) {
      setNotice({ kind: 'error', message: '爆款复刻需要上传 1 张参考爆款图' })
      return
    }

    const sourceFiles = mode === 'general' ? referenceFiles : task === 'viral-recreate' ? [...productFiles, ...referenceFiles] : productFiles
    if (sourceFiles.reduce((total, file) => total + file.size, 0) > 20 * 1024 * 1024) {
      setNotice({ kind: 'error', message: '本次上传图片总大小不能超过 20 MB' })
      return
    }

    setIsSubmitting(true)
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
              {commerceTasks.map(([taskId, meta]) => <button key={taskId} className={task === taskId ? 'active' : ''} type="button" onClick={() => changeTask(taskId)}>{taskId === 'product-main' && <Box size={16} />}{taskId === 'detail-page' && <ImageIcon size={16} />}{taskId === 'viral-recreate' && <Sparkles size={16} />}{taskId === 'product-retouch' && <Palette size={16} />}{meta.title}</button>)}
            </nav>
          ) : <strong className="workbench-title"><WandSparkles size={17} />通用生图</strong>}
          <Button asChild size="icon" variant="ghost"><Link href="/" aria-label="关闭工作台"><X size={20} /></Link></Button>
        </header>

        <aside className="configuration-panel">
          <div className="configuration-heading">
            <div className="configuration-heading-copy">
              <span>配置工作区</span>
              <strong>生成配置</strong>
              <p>{mode === 'commerce' ? `${title} · 先完善素材与输出要求` : '描述你的画面，再选择输出规格'}</p>
            </div>
            <div className="side-toggle" aria-label="生成配置位置">
              <button className={configSide === 'left' ? 'active' : ''} type="button" aria-label="配置显示在左侧" aria-pressed={configSide === 'left'} onClick={() => setConfigSide('left')}><LayoutPanelLeft size={17} /></button>
              <button className={configSide === 'right' ? 'active' : ''} type="button" aria-label="配置显示在右侧" aria-pressed={configSide === 'right'} onClick={() => setConfigSide('right')}><PanelRight size={17} /></button>
            </div>
          </div>

          <div className="configuration-scroll">
            <fieldset className="form-section config-card config-card-assets">
              <div className="field-heading"><legend>{mode === 'general' ? '参考图片' : task === 'viral-recreate' ? '商品原图' : '产品素材'}</legend><span>{mode === 'general' ? `${referenceFiles.length}/6 张 · 可选` : task === 'product-retouch' ? `${productFiles.length}/1 张 · 必须 1 张` : `${productFiles.length}/6 张 · 至少 1 张`}</span></div>
              <div className="upload-list">
                {(mode === 'general' ? referenceFiles : productFiles).map((file, index) => (
                  <SelectedImageThumbnail
                    key={`${file.name}-${file.size}-${file.lastModified}-${index}`}
                    file={file}
                    label={mode === 'general' ? `参考 ${index + 1}` : index === 0 ? '主图' : `素材 ${index + 1}`}
                    onRemove={() => mode === 'general'
                      ? setReferenceFiles((current) => current.filter((_, fileIndex) => fileIndex !== index))
                      : setProductFiles((current) => current.filter((_, fileIndex) => fileIndex !== index))}
                  />
                ))}
                {(mode === 'general' ? referenceFiles.length < 6 : productFiles.length < (task === 'product-retouch' ? 1 : task === 'viral-recreate' ? 3 : 6)) && <label className="add-thumb"><span className="add-thumb-icon"><Upload size={16} /></span><span>添加图片</span><input multiple type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => {
                  const selectedFiles = Array.from(event.target.files ?? [])
                  if (mode === 'general') setReferenceFiles((current) => [...current, ...selectedFiles].slice(0, 6))
                  else setProductFiles((current) => [...current, ...selectedFiles].slice(0, task === 'product-retouch' ? 1 : task === 'viral-recreate' ? 3 : 6))
                  event.target.value = ''
                }} /></label>}
              </div>
            </fieldset>

            {mode === 'commerce' && (
              <fieldset className={`form-section config-card two-columns compact-fields ${task === 'product-retouch' ? 'single-field' : ''}`}>
                <label>目标平台<Select value={platform} onValueChange={setPlatform}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{platformOptions.map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent></Select></label>
                {task !== 'product-retouch' && <label>目标语言<Select value={outputLanguage} onValueChange={setOutputLanguage}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{languageOptions.map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent></Select></label>}
              </fieldset>
            )}

            {mode === 'commerce' && task === 'viral-recreate' && (
              <fieldset className="form-section config-card">
                <div className="field-heading"><legend>参考图（爆款图）</legend><span>{referenceFiles.length}/1 张 · 必须 1 张</span></div>
                <div className="upload-list">
                  {referenceFiles.map((file, index) => <SelectedImageThumbnail key={`${file.name}-${file.size}-${file.lastModified}-${index}`} file={file} label={`参考 ${index + 1}`} onRemove={() => setReferenceFiles((current) => current.filter((_, fileIndex) => fileIndex !== index))} />)}
                  {referenceFiles.length < 1 && <label className="add-thumb"><span className="add-thumb-icon"><Upload size={16} /></span><span>添加参考图</span><input type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => { setReferenceFiles(Array.from(event.target.files ?? []).slice(0, 1)); event.target.value = '' }} /></label>}
                </div>
                <div className="choice-group"><span className="choice-label">复刻程度</span><div className="recreate-options"><label className={recreateStrength === 'style' ? 'selected' : ''}><input type="radio" checked={recreateStrength === 'style'} onChange={() => setRecreateStrength('style')} /><span><strong>参考风格</strong><small>参考整体风格和结构，自动调整色彩和重构场景</small></span></label><label className={recreateStrength === 'high' ? 'selected' : ''}><input type="radio" checked={recreateStrength === 'high'} onChange={() => setRecreateStrength('high')} /><span><strong>高度复刻</strong><small>参照参考图视觉结构替换产品和文案，场景细节略有差异</small></span></label></div></div>
              </fieldset>
            )}

            {mode === 'general' ? (
                  <fieldset className="form-section config-card general-description">
                <label>画面描述<textarea value={prompt} onChange={(event) => setPrompt(event.target.value)} /></label>
                <div className="two-columns">
                  <label>创作风格<Select value={style} onValueChange={(value) => setStyle(value as GeneralStyle)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="unspecified">不指定</SelectItem><SelectItem value="studio">摄影棚</SelectItem><SelectItem value="minimal">极简</SelectItem><SelectItem value="fresh">清新</SelectItem><SelectItem value="technology">科技</SelectItem><SelectItem value="guochao">国潮</SelectItem></SelectContent></Select></label>
                  <label>参考强度<Select value={referenceStrength} onValueChange={(value) => setReferenceStrength(value as ReferenceStrength)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="low">低</SelectItem><SelectItem value="medium">中</SelectItem><SelectItem value="high">高</SelectItem></SelectContent></Select></label>
                </div>
              </fieldset>
            ) : (
              <>
                {(task === 'product-main' || task === 'detail-page') ? (
                  <fieldset className="form-section config-card">
                    <div className="field-heading"><legend>{task === 'product-main' ? '主图要求' : '详情图要求'}</legend><div className="field-heading-actions"><button type="button" className="ai-write-button" onClick={() => setRequirements((current) => current || '请围绕产品名称、核心卖点、目标人群、视觉风格和平台规范，生成清晰统一的电商图片方案。')}><Sparkles size={14} />AI 帮写</button></div></div>
                    <textarea value={requirements} onChange={(event) => setRequirements(event.target.value)} placeholder={requirementsPlaceholder} />
                  </fieldset>
                ) : task === 'product-retouch' ? (
                  <fieldset className="form-section config-card">
                    <div className="field-heading"><legend>快捷优化项</legend><span>可多选</span></div>
                    <div className="insight-chips">{retouchOptions.map(([value, label]) => <button key={value} type="button" className={enhancements.includes(value) ? 'selected' : ''} onClick={() => setEnhancements((current) => current.includes(value) ? current.filter((item) => item !== value) : [...current, value])}>{label}</button>)}</div>
                    <label className="field-label-spaced">补充要求<textarea value={requirements} onChange={(event) => setRequirements(event.target.value)} placeholder={requirementsPlaceholder} /></label>
                  </fieldset>
                ) : (
                  <fieldset className="form-section config-card">
                    <div className="field-heading"><legend>补充要求</legend></div>
                    <textarea value={requirements} onChange={(event) => setRequirements(event.target.value)} placeholder={requirementsPlaceholder} />
                  </fieldset>
                )}
                {mode === 'commerce' && (task === 'product-main' || task === 'detail-page') && <fieldset className="form-section config-card config-card-modules"><div className="field-heading"><legend>图片模块</legend><span>{moduleMode === 'smart' ? 'AI 自动组合' : '选择需要的模块'}</span></div><div className="module-tabs"><button type="button" className={moduleMode === 'smart' ? 'selected' : ''} onClick={() => setModuleMode('smart')}>智能模块</button><button type="button" className={moduleMode === 'custom' ? 'selected' : ''} onClick={() => setModuleMode('custom')}>自定义模块</button></div>{moduleMode === 'smart' ? <p className="field-helper module-helper">AI 将自动分析商品特征并选择最佳图片模块组合</p> : <div className="module-count-grid">{(task === 'product-main' ? productMainModules : detailModules).map(([value, label]) => { const isSelected = moduleCounts[value] !== undefined; return <div className={`module-choice ${isSelected ? 'selected' : ''}`} key={value}><label><input type="checkbox" checked={isSelected} onChange={(event) => setModuleCounts((current) => { if (event.target.checked) return { ...current, [value]: 1 }; const next = { ...current }; delete next[value]; return next })} /><span>{label}</span></label>{isSelected && <select aria-label={`${label}数量`} value={moduleCounts[value]} onChange={(event) => setModuleCounts((current) => ({ ...current, [value]: Number(event.target.value) }))}>{[1, 2, 3, 4].map((number) => <option key={number} value={number}>{number} 张</option>)}</select>}</div> })}</div>}</fieldset>}
              </>
            )}

            <fieldset className="form-section config-card config-card-output">
              <div className="field-heading"><legend>输出设置</legend>{mode === 'general' && <span>最多 16 张</span>}</div>
              <div className="settings-grid">
                <label className="settings-field"><span>尺寸比例</span><Select value={aspectRatio} onValueChange={setAspectRatio}><SelectTrigger aria-label="画面比例"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="1:1">1:1</SelectItem><SelectItem value="3:4">3:4</SelectItem><SelectItem value="4:3">4:3</SelectItem><SelectItem value="9:16">9:16</SelectItem><SelectItem value="16:9">16:9</SelectItem></SelectContent></Select></label>
                <label className="settings-field"><span>分辨率</span><Select value={resolution} onValueChange={setResolution}><SelectTrigger aria-label="清晰度"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="1K">1K</SelectItem><SelectItem value="2K">2K</SelectItem><SelectItem value="4K">4K</SelectItem></SelectContent></Select></label>
                <label className="settings-field"><span>生图模型</span><Select value={model} onValueChange={(value) => setModel(value as GenerationModel)}><SelectTrigger aria-label="生图模型"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="gpt-image-2">GPT Image 2</SelectItem><SelectItem value="gemini-2.5-flash-image">Gemini 2.5 Flash</SelectItem><SelectItem value="gemini-3.1-flash-image">Gemini 3.1 Flash</SelectItem><SelectItem value="gemini-3-pro-image">Gemini 3 Pro Image</SelectItem></SelectContent></Select></label>
                <label className="settings-field"><span>生成数量</span>{mode === 'general' ? <Select value={String(count)} onValueChange={(value) => setCount(Number(value))}><SelectTrigger aria-label="生成数量"><SelectValue /></SelectTrigger><SelectContent>{Array.from({ length: 16 }, (_, index) => <SelectItem key={index + 1} value={String(index + 1)}>{index + 1} 张</SelectItem>)}</SelectContent></Select> : <span className="settings-value">{task === 'product-main' || task === 'detail-page' ? moduleMode === 'custom' ? `${Math.max(1, Object.values(moduleCounts).reduce((total, value) => total + value, 0))} 张` : '智能生成' : '1 张'}</span>}</label>
              </div>
            </fieldset>
          </div>

          <footer className="configuration-footer">
            {notice && <p className={`form-notice ${notice.kind}`} role="status">{notice.kind === 'success' && <Check size={15} />}{notice.message}</p>}
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
                          setReferenceFiles((prev) => [...prev, file].slice(0, 6))
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
