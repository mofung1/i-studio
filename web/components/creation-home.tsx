'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  ArrowUp,
  ArrowUpRight,
  Box,
  Copy,
  Frame,
  Image as ImageIcon,
  ImagePlus,
  Images,
  Loader2,
  Shirt,
  Sparkles,
  WandSparkles,
  X,
} from 'lucide-react'
import { useEffect, useRef, useState } from 'react'

import { useAccount } from '@/components/account-provider'
import { useCanvasCapabilities } from '@/components/canvas/use-canvas-capabilities'
import { useGenerationCost } from '@/components/generation-cost'
import { LoginLink } from '@/components/login-link'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/select'
import { useInspirationPrompts } from '@/components/workbench/use-inspiration-prompts'
import type { InspirationPrompt } from '@/components/workbench/use-inspiration-prompts'
import { optionLabel, ratioOptions, resolutionOptions } from '@/components/workbench/shared'
import { apiBaseUrl, getAccessToken, uploadAsset } from '@/lib/api'
import { creationImageTypes, maxCreationImageSize } from '@/lib/creation-images'
import { formatCredits } from '@/lib/credits'
import { modelCompatibilityIssue } from '@/lib/generation-models'
import {
  clearHomeComposerDraft,
  readHomeComposerDraft,
  writeHomeComposerDraft,
} from '@/lib/home-composer'
import { inspirationWorkbenchUrl } from '@/lib/inspiration-handoff'
import { studioToolUrl } from '@/lib/studio-navigation'

import styles from './creation-home.module.css'

const generalModes = [
  { id: 'text', label: '文生图', icon: Sparkles },
  { id: 'img2img', label: '图生图', icon: ImagePlus },
] as const

const commerceLinks = [
  { task: 'product-main', label: '商品主图', icon: Box },
  { task: 'detail-page', label: '详情页', icon: Images },
  { task: 'viral-recreate', label: '爆款复刻', icon: Copy },
  { task: 'clothing-set', label: '模特上身', icon: Shirt },
] as const

const toolLinks = [
  { task: 'product-retouch', label: '商品精修', icon: WandSparkles },
  { task: 'clothing-set', label: '模特上身', icon: Shirt },
] as const

type GeneralMode = (typeof generalModes)[number]['id']

function withPrompt(url: string, prompt: string) {
  const value = prompt.trim()
  if (!value) return url
  return `${url}${url.includes('?') ? '&' : '?'}prompt=${encodeURIComponent(value)}`
}

function inspirationCover(item: InspirationPrompt) {
  return item.imageUrl.startsWith('/') ? `${apiBaseUrl}${item.imageUrl}` : item.imageUrl
}

function InspirationCover({ item }: { item: InspirationPrompt }) {
  const [failed, setFailed] = useState(false)
  const source = inspirationCover(item)
  const ratio = `${item.width || 4} / ${item.height || 5}`
  useEffect(() => setFailed(false), [item.imageUrl])

  if (!item.imageUrl || failed) {
    return (
      <span className={styles.cardFallback} style={{ aspectRatio: ratio }}>
        <ImageIcon size={26} aria-hidden="true" />
      </span>
    )
  }
  return (
    <img
      className={styles.cardImage}
      src={source}
      alt={item.title || '灵感示例'}
      width={item.width || 4}
      height={item.height || 5}
      loading="lazy"
      decoding="async"
      onError={() => setFailed(true)}
    />
  )
}

export function CreationHome() {
  const router = useRouter()
  const { account } = useAccount()
  const { imageEndpoints, loading: modelsLoading, error: modelsError } = useCanvasCapabilities()
  const inspiration = useInspirationPrompts()

  const [prompt, setPrompt] = useState('')
  const [mode, setMode] = useState<GeneralMode>('text')
  const [endpointId, setEndpointId] = useState('')
  const [aspectRatio, setAspectRatio] = useState('1:1')
  const [resolution, setResolution] = useState('2K')
  const [referenceAssetId, setReferenceAssetId] = useState('')
  const [referencePreview, setReferencePreview] = useState('')
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState('')
  // 先恢复再写回，避免首帧用空状态覆盖掉登录前暂存的输入。
  const [composerRestored, setComposerRestored] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const saved = readHomeComposerDraft()
    if (saved) {
      setPrompt(saved.prompt)
      setMode(saved.mode)
      setEndpointId(saved.endpointId)
      setAspectRatio(saved.aspectRatio)
      setResolution(saved.resolution)
    }
    setComposerRestored(true)
  }, [])

  useEffect(() => {
    if (!composerRestored) return
    writeHomeComposerDraft({ prompt, mode, endpointId, aspectRatio, resolution })
  }, [composerRestored, prompt, mode, endpointId, aspectRatio, resolution])

  useEffect(() => {
    const first = imageEndpoints[0]
    if (!first) return
    setEndpointId((current) =>
      imageEndpoints.some((endpoint) => endpoint.id === current) ? current : first.id,
    )
  }, [imageEndpoints])

  useEffect(() => {
    if (!referencePreview) return
    return () => URL.revokeObjectURL(referencePreview)
  }, [referencePreview])

  const endpoint = imageEndpoints.find((item) => item.id === endpointId) ?? imageEndpoints[0]
  const capabilityRatios = endpoint?.capabilities?.aspectRatios?.length
    ? endpoint.capabilities.aspectRatios
    : ratioOptions.map(([value]) => value)
  const capabilityResolutions = endpoint?.capabilities?.resolutions?.length
    ? endpoint.capabilities.resolutions
    : resolutionOptions.map(([value]) => value)
  const activeRatio = capabilityRatios.includes(aspectRatio)
    ? aspectRatio
    : (capabilityRatios[0] ?? '1:1')
  const activeResolution = capabilityResolutions.includes(resolution)
    ? resolution
    : (capabilityResolutions[0] ?? '2K')
  const cost = useGenerationCost(endpoint?.model, 1)
  const usesReference = mode === 'img2img' && Boolean(referenceAssetId)
  const compatibilityIssue = modelCompatibilityIssue(endpoint, {
    aspectRatio: activeRatio,
    resolution: activeResolution,
    hasImages: usesReference,
  })
  const availableRatios = capabilityRatios.map(
    (value) => [value, optionLabel(ratioOptions, value)] as const,
  )
  const availableResolutions = capabilityResolutions.map(
    (value) => [value, optionLabel(resolutionOptions, value)] as const,
  )

  const costLabel = !endpoint
    ? modelsLoading
      ? '模型加载中…'
      : modelsError
        ? '模型暂时不可用'
        : '暂未配置生图模型'
    : cost.quote
      ? `预计 ${formatCredits(cost.quote.totalMinor)} ${cost.quote.creditName}`
      : cost.pending
        ? '费用计算中…'
        : cost.error
          ? '费用暂不可用'
          : cost.authenticated
            ? '费用待确认'
            : '登录后查看积分'

  const canSubmit =
    prompt.trim().length > 0 &&
    Boolean(endpoint) &&
    !uploading &&
    !compatibilityIssue &&
    (mode !== 'img2img' || Boolean(referenceAssetId))

  const modeHint = !endpoint
    ? modelsLoading
      ? '正在读取可用的生图模型…'
      : modelsError || '暂未配置可用的生图模型，请先完成 AI 服务配置'
    : compatibilityIssue
      ? compatibilityIssue
      : mode === 'img2img' && !referenceAssetId
        ? '图生图需要先添加一张参考图'
        : mode === 'img2img'
          ? '将带着描述和参考图进入工作台'
          : referenceAssetId
            ? '参考图已准备好，切换到「图生图」即可使用'
            : '将带着描述进入工作台，确认参数后生成'

  async function handleFile(file: File) {
    if (!creationImageTypes.includes(file.type) || file.size > maxCreationImageSize) {
      setUploadError('仅支持 JPG / PNG / WebP，单张不超过 10 MB。')
      return
    }
    const token = getAccessToken()
    if (!token) {
      setUploadError('登录后才能上传参考图。')
      return
    }
    setUploading(true)
    setUploadError('')
    try {
      const assetId = await uploadAsset(file, token)
      setReferenceAssetId(assetId)
      setReferencePreview(URL.createObjectURL(file))
      const supportsReference = imageEndpoints.find((item) => item.capabilities?.referenceImages)
      if (
        endpoint &&
        endpoint.capabilities &&
        !endpoint.capabilities.referenceImages &&
        supportsReference
      ) {
        setEndpointId(supportsReference.id)
      }
    } catch (reason) {
      setUploadError(reason instanceof Error ? reason.message : '参考图上传失败')
    } finally {
      setUploading(false)
    }
  }

  function removeReference() {
    setReferenceAssetId('')
    setReferencePreview('')
    setUploadError('')
  }

  function submit() {
    const text = prompt.trim()
    if (!text || !endpoint || !canSubmit) return
    const query = new URLSearchParams({
      mode: 'general',
      prompt: text,
      model: endpoint.model,
      aspectRatio: activeRatio,
      resolution: activeResolution,
      count: '1',
    })
    if (usesReference) query.set('referenceAsset', referenceAssetId)
    clearHomeComposerDraft()
    router.push(`/studio?${query.toString()}`)
  }

  const feedItems = inspiration.prompts.slice(0, 12)

  return (
    <main className={styles.home}>
      <section className={styles.hero} aria-labelledby="home-title">
        <div className={styles.heroInner}>
          <h1 id="home-title" className={styles.title}>
            今天想做什么图？
          </h1>
          <p className={styles.lede}>
            描述画面，或从下面的灵感开始。支持文生图、图生图和商品图创作。
          </p>

          <form
            id="home-composer"
            className={styles.composer}
            onSubmit={(event) => {
              event.preventDefault()
              submit()
            }}
          >
            {referencePreview && (
              <div className={styles.refStack} aria-label="已添加的参考图">
                <div className={styles.refThumb}>
                  <img src={referencePreview} alt="参考图预览" />
                  <button
                    type="button"
                    className={styles.refRemove}
                    aria-label="移除参考图"
                    onClick={removeReference}
                  >
                    <X size={12} aria-hidden="true" />
                  </button>
                </div>
              </div>
            )}
            <textarea
              className={styles.composerInput}
              value={prompt}
              rows={3}
              aria-label="描述你想生成的画面"
              placeholder={
                mode === 'img2img'
                  ? '描述想如何修改这张参考图，例如：换成暖色黄昏背景'
                  : '例如：透明玻璃花瓶，白色雏菊，午后窗边的自然光'
              }
              onChange={(event) => setPrompt(event.target.value)}
              onKeyDown={(event) => {
                if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
                  event.preventDefault()
                  submit()
                }
              }}
            />

            <div className={styles.composerFoot}>
              <div className={styles.quickControls}>
                <Select
                  value={endpoint?.id ?? ''}
                  onValueChange={setEndpointId}
                  disabled={modelsLoading || !imageEndpoints.length}
                >
                  <SelectTrigger className={styles.controlSelect} aria-label="生图模型">
                    <SelectValue placeholder={modelsLoading ? '模型加载中…' : '选择模型'} />
                  </SelectTrigger>
                  <SelectContent>
                    {imageEndpoints.map((item) => (
                      <SelectItem key={item.id} value={item.id}>
                        {item.name || item.model}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <Select value={activeRatio} onValueChange={setAspectRatio}>
                  <SelectTrigger className={styles.controlSelect} aria-label="画幅比例">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {availableRatios.map(([value, label]) => (
                      <SelectItem key={value} value={value}>
                        {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <Select value={activeResolution} onValueChange={setResolution}>
                  <SelectTrigger className={styles.controlSelect} aria-label="清晰度">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {availableResolutions.map(([value, label]) => (
                      <SelectItem key={value} value={value}>
                        {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                {account.authenticated ? (
                  <button
                    type="button"
                    className={styles.controlChip}
                    disabled={uploading}
                    onClick={() => fileRef.current?.click()}
                  >
                    {uploading ? (
                      <Loader2 className={styles.spinner} size={14} aria-hidden="true" />
                    ) : (
                      <ImagePlus size={14} aria-hidden="true" />
                    )}
                    {uploading ? '上传中' : '参考图'}
                  </button>
                ) : (
                  <LoginLink returnTo="/home" className={styles.controlChip}>
                    <ImagePlus size={14} aria-hidden="true" />
                    参考图
                  </LoginLink>
                )}
                <input
                  ref={fileRef}
                  className={styles.fileInput}
                  type="file"
                  accept={creationImageTypes.join(',')}
                  onChange={(event) => {
                    const file = event.currentTarget.files?.[0]
                    event.currentTarget.value = ''
                    if (file) void handleFile(file)
                  }}
                />
                <span className={styles.cost}>{costLabel}</span>
              </div>

              <div className={styles.submitGroup}>
                <span className={styles.shortcut} aria-hidden="true">
                  ⌘ ↵
                </span>
                <button
                  type="submit"
                  className={styles.submit}
                  disabled={!canSubmit}
                  aria-label="进入工作台继续"
                  title={canSubmit ? '进入工作台确认参数与积分' : modeHint}
                >
                  <ArrowUp size={18} aria-hidden="true" />
                </button>
              </div>
            </div>
            {uploadError && (
              <p className={styles.refError} role="alert">
                {uploadError}
              </p>
            )}
          </form>

          <div className={styles.modes} role="group" aria-label="创作方式">
            {generalModes.map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                type="button"
                aria-pressed={mode === id}
                className={`${styles.mode}${mode === id ? ` ${styles.modeActive}` : ''}`}
                onClick={() => setMode(id)}
              >
                <Icon size={14} aria-hidden="true" />
                {label}
              </button>
            ))}
            {commerceLinks.map(({ task, label, icon: Icon }) => (
              <Link
                key={task}
                href={
                  task === 'clothing-set'
                    ? studioToolUrl('commerce', task)
                    : withPrompt(studioToolUrl('commerce', task), prompt)
                }
                className={styles.mode}
              >
                <Icon size={14} aria-hidden="true" />
                {label}
              </Link>
            ))}
            <Link href="/canvas" className={styles.mode}>
              <Frame size={14} aria-hidden="true" />
              无限画布
            </Link>
          </div>
          <p className={styles.modeHint}>{modeHint}</p>
        </div>
      </section>

      <div className={styles.content}>
        <section aria-labelledby="home-tools-title">
          <div className={styles.sectionHead}>
            <h2 id="home-tools-title" className={styles.sectionTitle}>
              快捷工具
            </h2>
            <Link className={styles.sectionLink} href="/studio">
              进入工作台
              <ArrowUpRight size={14} aria-hidden="true" />
            </Link>
          </div>
          <div className={styles.tools}>
            {toolLinks.map(({ task, label, icon: Icon }) => (
              <Link
                key={task}
                href={
                  task === 'clothing-set'
                    ? studioToolUrl('commerce', task)
                    : withPrompt(studioToolUrl('commerce', task), prompt)
                }
                className={styles.tool}
              >
                <Icon size={15} aria-hidden="true" />
                {label}
              </Link>
            ))}
            <Link
              href={`/studio?${new URLSearchParams({ tool: 'image-to-prompt' }).toString()}`}
              className={styles.tool}
            >
              <Sparkles size={15} aria-hidden="true" />
              图片反推
            </Link>
            <Link href="/canvas" className={styles.tool}>
              <Frame size={15} aria-hidden="true" />
              无限画布
            </Link>
          </div>
        </section>

        <section aria-labelledby="home-inspiration-title">
          <h2 className={styles.visuallyHidden} id="home-inspiration-title">
            灵感
          </h2>
          <div className={`${styles.sectionHead} ${styles.feedHead}`}>
            <div className={styles.tabs} role="group" aria-label="灵感分类">
              <button
                type="button"
                aria-pressed={!inspiration.category}
                className={`${styles.tab}${!inspiration.category ? ` ${styles.tabActive}` : ''}`}
                onClick={() => inspiration.changeCategory('')}
              >
                为你推荐
              </button>
              {inspiration.categories.map((item) => (
                <button
                  key={item.category}
                  type="button"
                  aria-pressed={inspiration.category === item.category}
                  className={`${styles.tab}${
                    inspiration.category === item.category ? ` ${styles.tabActive}` : ''
                  }`}
                  onClick={() => inspiration.changeCategory(item.category)}
                >
                  {item.category}
                </button>
              ))}
            </div>
            <Link className={styles.sectionLink} href="/inspire">
              查看全部灵感
              <ArrowUpRight size={14} aria-hidden="true" />
            </Link>
          </div>

          {inspiration.isLoading && !feedItems.length ? (
            <div className={styles.masonry} role="status" aria-label="灵感加载中">
              {[3 / 4, 1, 4 / 5, 3 / 2, 3 / 4, 1, 4 / 5, 3 / 2].map((ratio, index) => (
                <div
                  key={`${ratio}-${index}`}
                  className={styles.skeleton}
                  style={{ aspectRatio: String(ratio) }}
                />
              ))}
            </div>
          ) : inspiration.error ? (
            <div className={styles.error} role="alert">
              <p>{inspiration.error}</p>
              <button type="button" onClick={inspiration.reload}>
                重新加载
              </button>
            </div>
          ) : feedItems.length === 0 ? (
            <p className={styles.empty}>当前分类暂无公开灵感。</p>
          ) : (
            <div className={styles.masonry}>
              {feedItems.map((item) => (
                <Link
                  key={item.id}
                  href={inspirationWorkbenchUrl(item.id)}
                  className={styles.card}
                  aria-label={`用「${item.title}」做同款`}
                >
                  <div className={styles.cardMedia}>
                    <InspirationCover item={item} />
                    <span className={styles.cardUse}>
                      做同款
                      <ArrowUpRight size={14} aria-hidden="true" />
                    </span>
                  </div>
                  <div className={styles.cardMeta}>
                    <span className={styles.cardTitle}>{item.title}</span>
                    <span className={styles.cardCategory}>{item.category}</span>
                  </div>
                </Link>
              ))}
            </div>
          )}

          <p className={styles.feedNote}>灵感来自公共提示词库，点击卡片可带入工作台继续创作。</p>
        </section>
      </div>
    </main>
  )
}
