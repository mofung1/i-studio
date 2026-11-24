'use client'

import { useRouter, useSearchParams } from 'next/navigation'

import { addCreationImage, type CreationImage } from '@/lib/creation-images'
import { loadStoredImage } from '@/lib/library'

import { referenceWorkbenchUrl } from './use-workbench-handoff'
import { referenceLimit, type WorkbenchMode } from './shared'
import type { CommerceTaskType } from '@/lib/contracts'

interface DraftWriter {
  flush: () => Promise<void>
  markEntryApplied: () => void
}

interface UseImageAsReferenceOptions {
  mode: WorkbenchMode
  task: CommerceTaskType
  draft: DraftWriter
  mounted: { current: boolean }
  requestRef: { current: number }
  currentImages: { current: { productFiles: CreationImage[]; referenceFiles: CreationImage[] } }
  setProductFiles: (files: CreationImage[]) => void
  setReferenceFiles: (files: CreationImage[]) => void
  setConfigCollapsed: (collapsed: boolean) => void
  setPanelOpen: (open: boolean) => void
  setNotice: (notice: { kind: 'success' | 'error'; message: string } | null) => void
}

/**
 * 把结果图作为参考图继续迭代：
 * 与当前工具同类型时直接填入素材区；不同类型时先切到对应的生图配置页再填入。
 */
export function useImageAsReference({
  mode,
  task,
  draft,
  mounted,
  requestRef,
  currentImages,
  setProductFiles,
  setReferenceFiles,
  setConfigCollapsed,
  setPanelOpen,
  setNotice,
}: UseImageAsReferenceOptions) {
  const router = useRouter()
  const searchParams = useSearchParams()

  return async function insertReferenceImage(
    path: string,
    source: { mode: WorkbenchMode; taskType: CommerceTaskType },
  ) {
    if (source.mode !== mode || (source.mode === 'commerce' && source.taskType !== task)) {
      try {
        await draft.flush()
      } catch {
        setNotice({ kind: 'error', message: '草稿尚未保存，请重试保存后再切换工具' })
        return
      }
      if (!mounted.current) return
      const target = referenceWorkbenchUrl(path, source.mode, source.taskType, searchParams)
      if (target) router.replace(target)
      return
    }
    const requestId = requestRef.current
    const slot = mode === 'general' || task === 'viral-recreate' ? 'referenceFiles' : 'productFiles'
    const limit = mode === 'commerce' && task === 'viral-recreate' ? 1 : referenceLimit(mode, task)
    setConfigCollapsed(false)
    setPanelOpen(true)
    setNotice(null)
    try {
      const file = await loadStoredImage(path)
      if (!mounted.current || requestId !== requestRef.current) return
      const addition = addCreationImage(currentImages.current[slot], file, limit)
      if (addition.status === 'full') {
        setNotice({ kind: 'error', message: `素材已达到 ${limit} 张上限，请先移除一张再继续创作` })
        return
      }
      if (addition.status === 'added') {
        currentImages.current = { ...currentImages.current, [slot]: addition.images }
        if (slot === 'referenceFiles') setReferenceFiles(addition.images)
        else setProductFiles(addition.images)
      }
      draft.markEntryApplied()
      setNotice({
        kind: 'success',
        message:
          addition.status === 'existing'
            ? '这张图片已在素材区，无需重复添加'
            : '已作为参考图填入创作素材区',
      })
      document.querySelector('.configuration-scroll')?.scrollTo({ top: 0, behavior: 'smooth' })
    } catch (error) {
      if (!mounted.current || requestId !== requestRef.current) return
      setNotice({
        kind: 'error',
        message: error instanceof Error ? error.message : '图片读取失败，请稍后重试',
      })
    }
  }
}
