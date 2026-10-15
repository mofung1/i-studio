'use client'

import { useEffect, useRef, useState } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { X } from 'lucide-react'
import { apiBaseUrl, deleteGenerationTask, getAccessToken, readApiError } from '@/lib/api'
import { analyzeClothing, clothingStyles, defaultClothingCounts, makeClothingPlan, type ClothingPlanDefaults } from '@/lib/clothing'
import type { ClothingPlan } from '@/lib/contracts'
import { InfoDialog } from '@/components/info-dialog'
import { resolvePresetEndpoint, type CreationPreset, type PersonalApplication } from '@/lib/personal-prompts'
import { CreationLibraryTools } from './creation-library-tools'
import { usePersonalPromptHandoff } from './use-personal-prompt-handoff'
import { ClothingSettings, type ClothingSettingsValue } from './clothing-settings'
import { ClothingPlanDialog } from './clothing-plan-dialog'
import { GenerateBar } from './generate-bar'
import { ResultWorkspace } from './result-workspace'
import { WorkbenchHeader } from './workbench-header'
import { WorkbenchRail } from './workbench-rail'
import { useGenerationTask } from './use-generation-task'
import { historyWorkbenchUrl, referenceWorkbenchUrl, useWorkbenchHandoff } from './use-workbench-handoff'
import type { HistoryTask } from './use-task-history'
import type { ConfigSide, WorkbenchMode } from './shared'

export function ClothingWorkbench({ initialModel, initialAspectRatio, initialResolution }: { initialModel?: string; initialAspectRatio?: string; initialResolution?: string }) {
  const router = useRouter()
  const pathname = usePathname()
  const search = useSearchParams()
  const [settings, setSettings] = useState<ClothingSettingsValue>({ mode: 'product', style: 'studio', counts: { ...defaultClothingCounts }, modelCount: 1, garments: [], models: [], scenes: [], requirements: '', platform: 'smart', outputLanguage: 'none', endpointId: '', model: initialModel ?? 'gpt-image-2', aspectRatio: initialAspectRatio ?? '3:4', resolution: initialResolution ?? '2K' })
  const [side, setSide] = useState<ConfigSide>(() => typeof document !== 'undefined' && document.documentElement.getAttribute('data-wb-side') === 'right' ? 'right' : 'left')
  const [panelOpen, setPanelOpen] = useState(false)
  const [mobile, setMobile] = useState(false)
  const [detailsOpen, setDetailsOpen] = useState(false)
  const [endpoints, setEndpoints] = useState<{ id: string; name: string; model: string; isDefault?: boolean }[]>([])
  const [aiEnabled, setAiEnabled] = useState<boolean | null>(null)
  const [canAnalyze, setCanAnalyze] = useState(false)
  const [planDefaults, setPlanDefaults] = useState<ClothingPlanDefaults>()
  const [plan, setPlan] = useState<ClothingPlan | null>(null)
  const [planning, setPlanning] = useState(false)
  const [planMessage, setPlanMessage] = useState('')
  const [historyOpen, setHistoryOpen] = useState(false)
  const [historyTask, setHistoryTask] = useState<HistoryTask | null>(null)
  const [loadingHistoryId, setLoadingHistoryId] = useState<string | null>(null)
  const [submittedCount, setSubmittedCount] = useState<number | null>(null)
  const [downloadBusy, setDownloadBusy] = useState(false)
  const [collectionUndo, setCollectionUndo] = useState<PersonalApplication | null>(null)
  const revision = useRef(0)
  const analysisRequest = useRef<AbortController | null>(null)
  const draftPlan = useRef<ClothingPlan | null>(null)
  const { generationTask, resultHistory, activeResultIndex, activeResult, isSubmitting, isGenerating, notice, setNotice, setActiveResultIndex, submit, removeResult } = useGenerationTask('commerce:clothing-set')
  const counts: Record<string, number> = settings.mode === 'product' ? settings.counts : { 'clothing-model': settings.modelCount }
  const expectedCount = Object.values(counts).reduce((sum, count) => sum + count, 0)
  useWorkbenchHandoff({ ready: aiEnabled !== null, onHistory: loadHistory, onReference: useReference, onError: message => setNotice({ kind: 'error', message }) })

  function currentPreset(): CreationPreset {
    return { mode: 'commerce', taskType: 'clothing-set', model: settings.model, ...(settings.endpointId ? { endpointId: settings.endpointId } : {}), aspectRatio: settings.aspectRatio, resolution: settings.resolution, count: expectedCount, clothingMode: settings.mode, clothingStyle: settings.style, moduleCounts: { ...counts }, platform: settings.platform, outputLanguage: settings.outputLanguage } as CreationPreset
  }
  function applyCollection(application: PersonalApplication, restore = false) {
    if (planning || isGenerating || isSubmitting) throw new Error('当前任务进行中，请完成后再应用')
    if (application.text.length > 2000) throw new Error('服装补充需求最多 2000 字')
    const config = application.config
    if (config && (config.mode !== 'commerce' || config.taskType !== 'clothing-set')) throw new Error('该预设属于其他工具，请从“我的提示词”页面应用')
    const endpoint = config ? resolvePresetEndpoint(config, endpoints) : null
    if (!restore) setCollectionUndo({ text: settings.requirements, config: currentPreset(), title: '应用前的配置' })
    const patch: Partial<ClothingSettingsValue> = {}
    if (restore || !config || application.text.trim()) patch.requirements = application.text
    if (config && endpoint) {
      Object.assign(patch, { endpointId: endpoint.id, model: endpoint.model, aspectRatio: config.aspectRatio, resolution: config.resolution, mode: config.clothingMode ?? 'product', style: config.clothingStyle ?? 'studio', platform: config.platform ?? 'smart', outputLanguage: config.outputLanguage ?? 'none' })
      if (config.clothingMode === 'model') patch.modelCount = config.count
      else patch.counts = { ...config.moduleCounts }
    }
    change(patch); setPanelOpen(true); setNotice({ kind: 'success', message: restore ? '已撤销应用' : `已应用“${application.title}”，请选择素材并确认规划` })
  }
  usePersonalPromptHandoff({ ready: aiEnabled !== null && !planning && !isGenerating && !isSubmitting, onApply: application => applyCollection(application), onError: message => setNotice({ kind: 'error', message }) })


  useEffect(() => {
    const controller = new AbortController()
    fetch(`${apiBaseUrl}/v1/generation/capabilities`, { headers: { Authorization: `Bearer ${getAccessToken()}` }, signal: controller.signal }).then(response => response.json()).then(data => {
      if (controller.signal.aborted) return
      setAiEnabled(!!data.aiEnabled); setCanAnalyze(!!data.promptEnhanceEnabled && !!data.promptVision)
      setPlanDefaults(data.clothingPlanDefaults)
      const available = data.imageEndpoints ?? []
      setEndpoints(available)
      const selected = available.find((endpoint: { model: string }) => endpoint.model === initialModel) ?? available.find((endpoint: { isDefault: boolean }) => endpoint.isDefault) ?? available[0]
      if (selected) setSettings(previous => ({ ...previous, endpointId: selected.id, model: selected.model }))
    }).catch(() => { if (!controller.signal.aborted) setAiEnabled(false) })
    return () => { controller.abort(); analysisRequest.current?.abort(); revision.current++ }
  }, [initialModel])
  useEffect(() => { try { localStorage.setItem('istudio-config-side', side) } catch { /* Layout still works without persistence. */ } }, [side])
  useEffect(() => {
    const query = window.matchMedia('(max-width: 780px)')
    const update = () => setMobile(query.matches)
    update(); query.addEventListener('change', update)
    return () => query.removeEventListener('change', update)
  }, [])
  useEffect(() => {
    if (!mobile || !panelOpen) return
    const panel = document.getElementById('creation-settings')
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    function controls() { return Array.from(panel?.querySelectorAll<HTMLElement>('button:not(:disabled), textarea, input:not([hidden]), [tabindex="0"]') ?? []).filter(element => element.getClientRects().length > 0) }
    controls()[0]?.focus()
    function keyboard(event: KeyboardEvent) {
      if (document.querySelector('dialog[open]')) return
      if (event.key === 'Escape') { event.preventDefault(); setPanelOpen(false) }
      if (event.key !== 'Tab') return
      const elements = controls(); const first = elements[0]; const last = elements.at(-1)
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus() }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus() }
    }
    document.addEventListener('keydown', keyboard)
    return () => { document.body.style.overflow = previousOverflow; document.removeEventListener('keydown', keyboard); previousFocus?.focus() }
  }, [mobile, panelOpen])

  function change(patch: Partial<ClothingSettingsValue>) {
    revision.current++
    analysisRequest.current?.abort()
    draftPlan.current = null
    setPlanning(false); setPlan(null); setPlanMessage(''); setLoadingHistoryId(null)
    setSettings(previous => ({ ...previous, ...patch }))
  }
  function login() { router.push(`/login?next=${encodeURIComponent(`${pathname}${search.size ? `?${search}` : ''}`)}`) }
  function checkSource(): boolean {
    let message = ''
    if (!settings.garments.length) message = '请先上传 1–6 张服装原图'
    else if (settings.mode === 'model' && settings.models.length !== 1) message = '模特上身需要上传 1 张模特照片'
    else if (expectedCount < 1 || expectedCount > 16 || (settings.mode === 'model' && expectedCount > 4)) message = '请选择图种与张数，商品组图最多 16 张，模特上身最多 4 张'
    else if ([...settings.garments, ...(settings.mode === 'model' ? [...settings.models, ...settings.scenes] : [])].some(file => file.size > 10 * 1024 * 1024)) message = '每张素材不能超过 10 MB，请压缩图片后再上传'
    else if ([...settings.garments, ...(settings.mode === 'model' ? [...settings.models, ...settings.scenes] : [])].reduce((sum, file) => sum + file.size, 0) > 20 * 1024 * 1024) message = '本次素材总大小不能超过 20 MB'
    if (message) setNotice({ kind: 'error', message })
    return !message
  }
  async function prepare(useAI = canAnalyze && !draftPlan.current) {
    if (isSubmitting || isGenerating || planning || !checkSource()) return
    if (!getAccessToken()) { login(); return }
    setNotice(null); setPlanMessage('')
    const current = ++revision.current
    const existingPlan = plan ?? draftPlan.current
    const base = existingPlan ?? makeClothingPlan(settings.mode, counts, settings.requirements, planDefaults)
    draftPlan.current = base
    setPlan(base)
    if (!useAI) {
      if (existingPlan) return
      setPlanning(true)
      try {
        const response = await fetch(`${apiBaseUrl}/v1/clothing/manual-plan`, { method: 'POST', headers: { Authorization: `Bearer ${getAccessToken()}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ mode: settings.mode, counts, requirements: settings.requirements }) })
        if (!response.ok) throw new Error('基础规划读取失败')
        const manual = await response.json() as ClothingPlan
        if (revision.current === current) { draftPlan.current = manual; setPlan(manual) }
      } catch { if (revision.current === current) setPlanMessage('暂时无法读取基础规划，可编辑当前规划后生成。') }
      finally { if (revision.current === current) setPlanning(false) }
      return
    }
    const controller = new AbortController()
    analysisRequest.current?.abort(); analysisRequest.current = controller
    setPlanning(true)
    try {
      const analyzed = await analyzeClothing({ mode: settings.mode, style: settings.style, counts, requirements: settings.requirements, garmentFiles: settings.garments, modelFiles: settings.models, sceneFiles: settings.scenes, aspectRatio: settings.aspectRatio, platform: settings.platform, outputLanguage: settings.outputLanguage }, controller.signal)
      if (revision.current === current && !controller.signal.aborted) { draftPlan.current = analyzed; setPlan(analyzed) }
    } catch (error) {
      if (revision.current === current && !controller.signal.aborted) setPlanMessage(`${error instanceof Error ? error.message : 'AI 分析失败'}。基础规划已保留，可直接编辑后生成。`)
    } finally { if (revision.current === current) setPlanning(false) }
  }
  function cancelAnalysis(close = false) {
    revision.current++; analysisRequest.current?.abort(); setPlanning(false)
    if (close) setPlan(null)
  }
  function confirm() {
    if (!plan || planning || isSubmitting || isGenerating || !checkSource()) return
    if (aiEnabled !== true) { setPlanMessage('请先在设置中配置可用的 Image AI 生图服务'); return }
    const confirmed = plan.shots.map(shot => ({ ...shot }))
    const snapshot = { ...settings, counts: { ...counts } }
    setPlan(null); setPanelOpen(false); setSubmittedCount(confirmed.length); setHistoryTask(null); setHistoryOpen(false)
    void submit({
      productFiles: snapshot.garments, referenceFiles: [],
      modelFile: snapshot.mode === 'model' ? snapshot.models[0] : undefined,
      sceneFile: snapshot.mode === 'model' ? snapshot.scenes[0] : undefined,
      buildPayload: (productAssetIds, _referenceAssetIds, roles) => ({ projectId: search.get('projectId') || undefined, mode: 'commerce', taskType: 'clothing-set', productAssetIds, ...(snapshot.mode === 'model' ? roles : {}), clothingMode: snapshot.mode, clothingStyle: snapshot.style, moduleCounts: snapshot.counts, clothingPlan: confirmed, requirements: snapshot.requirements, platform: snapshot.platform, outputLanguage: snapshot.outputLanguage, model: snapshot.model, endpointId: snapshot.endpointId || undefined, aspectRatio: snapshot.aspectRatio, resolution: snapshot.resolution, count: confirmed.length, consistencyProtection: true }),
      onAuthRequired: login,
    })
  }

  async function imageFile(path: string, name: string) {
    const response = await fetch(path.startsWith('/') ? `${apiBaseUrl}${path}` : path, { headers: { Authorization: `Bearer ${getAccessToken()}` } })
    if (!response.ok) throw new Error(await readApiError(response, '素材读取失败'))
    const blob = await response.blob()
    return new File([blob], `${name}.${blob.type.includes('jpeg') ? 'jpg' : blob.type.includes('webp') ? 'webp' : 'png'}`, { type: blob.type || 'image/png' })
  }
  async function loadHistory(record: HistoryTask, regenerate = false) {
    if (regenerate && (isSubmitting || isGenerating)) { setNotice({ kind: 'error', message: '当前任务生成中，请完成后再重新生成' }); return }
    if (record.input.taskType !== 'clothing-set') { router.replace(historyWorkbenchUrl(record, regenerate)); return }
    const current = ++revision.current
    analysisRequest.current?.abort(); setPlanning(false); setPlan(null); setLoadingHistoryId(record.id)
    try {
      const input = record.input
      const [garments, models, scenes] = await Promise.all([
        Promise.all((input.productAssetIds ?? []).map((id, index) => imageFile(`/v1/assets/${id}/content`, `服装-${index + 1}`))),
        input.modelAssetId ? Promise.all([imageFile(`/v1/assets/${input.modelAssetId}/content`, '模特')]) : [],
        input.sceneAssetId ? Promise.all([imageFile(`/v1/assets/${input.sceneAssetId}/content`, '场景')]) : [],
      ])
      if (revision.current !== current) return
      const selected = endpoints.find(endpoint => endpoint.id === input.endpointId) ?? endpoints.find(endpoint => endpoint.model === input.model)
      const next: ClothingSettingsValue = { mode: input.clothingMode ?? 'product', style: input.clothingStyle ?? 'studio', counts: input.clothingMode === 'model' ? { ...defaultClothingCounts } : input.moduleCounts ?? { ...defaultClothingCounts }, modelCount: input.clothingMode === 'model' ? Math.min(4, Math.max(1, input.count ?? 1)) : 1, garments, models, scenes, requirements: input.requirements ?? '', platform: input.platform ?? 'smart', outputLanguage: input.outputLanguage ?? 'none', endpointId: selected?.id ?? '', model: selected?.model ?? input.model ?? 'gpt-image-2', aspectRatio: input.aspectRatio ?? '3:4', resolution: input.resolution ?? '2K' }
      setSettings(next); setHistoryTask(null); setHistoryOpen(false); setPanelOpen(true)
      const restored = makeClothingPlan(next.mode, next.mode === 'model' ? { 'clothing-model': next.modelCount } : next.counts, next.requirements, planDefaults)
      draftPlan.current = { ...restored, summary: '已载入历史拍摄规划，确认后重新生成。', shots: input.clothingPlan ?? restored.shots }
      if (regenerate) {
        setPlan(draftPlan.current); setPlanMessage('')
      } else setNotice({ kind: 'success', message: '服装、模特、场景与拍摄要求已载入，可继续调整。' })
    } catch (error) { if (revision.current === current) setNotice({ kind: 'error', message: error instanceof Error ? error.message : '历史配置读取失败' }) }
    finally { if (revision.current === current) setLoadingHistoryId(null) }
  }
  async function deleteRecord(record: HistoryTask) {
    await deleteGenerationTask(record.id); removeResult(record.id)
    if (historyTask?.id === record.id) setHistoryTask(null)
    setNotice({ kind: 'success', message: '已删除这条记录' })
  }
  async function useReference(path: string, source: { mode: WorkbenchMode; taskType: string } = { mode: 'commerce', taskType: 'clothing-set' }) {
    if (source.mode !== 'commerce' || source.taskType !== 'clothing-set') {
      const target = referenceWorkbenchUrl(path, source.mode, source.taskType)
      if (target) router.replace(target)
      return
    }
    if (settings.garments.length >= 6) { setNotice({ kind: 'error', message: '服装素材已达到 6 张，请先移除一张再添加参考图' }); setPanelOpen(true); return }
    const current = revision.current
    try {
      const file = await imageFile(path, '服装参考')
      if (current !== revision.current) return
      change({ garments: [...settings.garments, file].slice(0, 6) }); setPanelOpen(true)
      setNotice({ kind: 'success', message: '已作为服装参考填入素材区' })
    } catch (error) { setNotice({ kind: 'error', message: error instanceof Error ? error.message : '图片读取失败' }) }
  }
  async function downloadAll() {
    const id = historyTask?.id ?? activeResult?.id
    if (!id || downloadBusy) return
    setDownloadBusy(true)
    try {
      const response = await fetch(`${apiBaseUrl}/v1/generation/tasks/${id}/download`, { headers: { Authorization: `Bearer ${getAccessToken()}` } })
      if (!response.ok) throw new Error(await readApiError(response, '图组下载失败'))
      const url = URL.createObjectURL(await response.blob())
      const link = document.createElement('a'); link.href = url; link.download = '服装组图.zip'; link.click()
      window.setTimeout(() => URL.revokeObjectURL(url), 30000)
    } catch (error) { setNotice({ kind: 'error', message: error instanceof Error ? error.message : '图组下载失败' }) }
    finally { setDownloadBusy(false) }
  }
  return <div className="workbench-page"><div className={`workbench-shell mode-commerce clothing-workbench config-${side} ${panelOpen ? 'panel-open' : ''}`}>
    <WorkbenchRail mode="commerce" task="clothing-set" onChangeMode={mode => router.replace(mode === 'general' ? '/workbench?mode=general' : '/commerce')} onChangeTask={task => router.replace(`/workbench?mode=commerce&task=${task}`)} />
    <WorkbenchHeader collectionTools={<CreationLibraryTools config={currentPreset()} prompt={settings.requirements} disabled={isGenerating || isSubmitting || planning} onApply={application => applyCollection(application)} onUndo={collectionUndo ? () => { try { applyCollection(collectionUndo, true); setCollectionUndo(null) } catch (reason) { setNotice({ kind: 'error', message: reason instanceof Error ? reason.message : '撤销失败' }) } } : undefined} />} mode="commerce" task="clothing-set" configSide={side} panelOpen={panelOpen} onShowDetails={() => setDetailsOpen(true)} historyOpen={historyOpen} onToggleHistory={() => setHistoryOpen(value => !value)} onChangeSide={setSide} onTogglePanel={() => setPanelOpen(value => !value)} />
    <button type="button" className="clothing-panel-backdrop" hidden={!panelOpen} onClick={() => setPanelOpen(false)} aria-label="关闭服装设置" tabIndex={-1} />
    <aside id="creation-settings" className="configuration-panel creator-sidebar commerce-settings" aria-label="服装创作设置" role={mobile && panelOpen ? 'dialog' : undefined} aria-modal={mobile && panelOpen ? true : undefined}><div className="configuration-scroll"><div className="creator-sheet-head"><span>服装组图设置</span><button type="button" aria-label="收起服装设置" onClick={() => setPanelOpen(false)}><X size={18} aria-hidden="true" /></button></div><ClothingSettings value={settings} onChange={change} endpoints={endpoints} />{!canAnalyze && <p className="clothing-field-help">当前使用手动规划，可逐张编辑拍摄要求；配置支持识图的 Prompt 服务后可进行 AI 分析。</p>}</div><GenerateBar modelId={settings.endpointId} title="服装组图" buttonLabel="查看生成规划" busyLabel={planning ? '正在分析服装…' : undefined} expectedCount={expectedCount} aspectRatio={settings.aspectRatio} resolution={settings.resolution} notice={notice} isSubmitting={isSubmitting || planning} isGenerating={isGenerating} aiEnabled={aiEnabled} onSubmit={() => void prepare()} /></aside>
    <ResultWorkspace mode="commerce" task="clothing-set" aspectRatio={settings.aspectRatio} resolution={settings.resolution} expectedCount={expectedCount} generatingCount={submittedCount} resultHistory={resultHistory} activeResultIndex={activeResultIndex} activeResult={activeResult} generationTask={generationTask} isGenerating={isGenerating} isSubmitting={isSubmitting} aiEnabled={aiEnabled} historyOpen={historyOpen} historyTask={historyTask} loadingHistoryConfigId={loadingHistoryId} isRegeneratingHistory={!!loadingHistoryId} onToggleHistory={() => setHistoryOpen(value => !value)} onSelectHistory={setHistoryTask} onExitHistoryView={() => setHistoryTask(null)} onLoadHistoryConfig={record => void loadHistory(record)} onRegenerateFromHistory={record => void loadHistory(record, true)} onDeleteHistoryTask={deleteRecord} onUseImageAsReference={(path, source) => void useReference(path, source)} onSetActiveResultIndex={setActiveResultIndex} onRegenerate={() => void prepare()} onDownloadAll={() => void downloadAll()} downloadAllBusy={downloadBusy} onConfigure={() => { setPanelOpen(true); document.getElementById('creation-settings')?.scrollIntoView({ block: 'nearest' }) }} />
    {plan && <ClothingPlanDialog modelId={settings.endpointId} plan={plan} busy={planning} canAnalyze={canAnalyze} message={planMessage} contextLabel={`${settings.mode === 'product' ? '商品组图' : '模特上身'} · ${clothingStyles.find(([key]) => key === settings.style)?.[1]} · ${settings.aspectRatio} · ${settings.resolution}`} requirements={settings.requirements} onChange={next => { draftPlan.current = next; setPlan(next) }} onAnalyze={() => void prepare(true)} onManual={() => cancelAnalysis()} onClose={() => cancelAnalysis(true)} onConfirm={confirm} />}
    {detailsOpen && <InfoDialog title="服装生成参数" onClose={() => setDetailsOpen(false)} hideActions><dl className="clothing-parameter-details"><dt>创作模式</dt><dd>{settings.mode === 'product' ? '商品组图' : '模特上身'}</dd><dt>服装素材</dt><dd>{settings.garments.length} 张</dd><dt>模特 / 场景</dt><dd>{settings.mode === 'model' ? `${settings.models.length} / ${settings.scenes.length} 张` : '不使用'}</dd><dt>拍摄风格</dt><dd>{clothingStyles.find(([key]) => key === settings.style)?.[1]}</dd><dt>比例 / 清晰度</dt><dd>{settings.aspectRatio} · {settings.resolution}</dd><dt>预计张数</dt><dd>{expectedCount} 张</dd></dl></InfoDialog>}
  </div></div>
}
