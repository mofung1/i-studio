'use client'

import { Check, Plus, SlidersHorizontal } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/select'
import type { GenerationModel } from '@/lib/contracts'

import {
  detailModules,
  productMainModules,
  retouchOptions,
  styleOptions,
  type GeneralStyle,
  type ModuleMode,
  type ReferenceStrength,
  type WorkbenchMode,
} from './shared'
import type { CommerceTaskType } from '@/lib/contracts'

interface AdvancedSettingsProps {
  imageEndpoints: { id: string; name: string; model: string }[]
  endpointId: string
  onSetEndpoint: (id: string) => void
  mode: WorkbenchMode
  task: CommerceTaskType
  style: GeneralStyle
  onSetStyle: (style: GeneralStyle) => void
  referenceStrength: ReferenceStrength
  resolution: string
  count: number
  model: GenerationModel
  moduleMode: ModuleMode
  moduleCounts: Record<string, number>
  recreateStrength: 'style' | 'high'
  enhancements: string[]
  /** 折叠时展示的当前取值摘要 */
  summary: string
  onSetReferenceStrength: (strength: ReferenceStrength) => void
  onSetResolution: (resolution: string) => void
  onSetCount: (count: number) => void
  onSetModel: (model: GenerationModel) => void
  onSetModuleMode: (mode: ModuleMode) => void
  onSetModuleCounts: (counts: Record<string, number>) => void
  onSetRecreateStrength: (strength: 'style' | 'high') => void
  onSetEnhancements: (enhancements: string[]) => void
}

/** 高级设置：默认收起，专业用户展开后仍然是完整控制面。 */
export function AdvancedSettings(props: AdvancedSettingsProps) {
  const {
    mode, task, referenceStrength,
    moduleMode, moduleCounts, recreateStrength, enhancements, summary,
    onSetReferenceStrength,
    onSetModuleMode, onSetModuleCounts, onSetRecreateStrength, onSetEnhancements,
  } = props
  const [open, setOpen] = useState(false)
  const panelRef = useRef<HTMLElement>(null)
  useEffect(() => {
    if (!open || mode !== 'general') return
    const closeOutside = (event: PointerEvent) => {
      const target = event.target as HTMLElement
      if (!panelRef.current?.contains(target) && !target.closest('.select-content')) setOpen(false)
    }
    const closeEscape = (event: KeyboardEvent) => { if (event.key === 'Escape') setOpen(false) }
    document.addEventListener('pointerdown', closeOutside)
    document.addEventListener('keydown', closeEscape)
    return () => { document.removeEventListener('pointerdown', closeOutside); document.removeEventListener('keydown', closeEscape) }
  }, [mode, open])
  const expanded = mode === 'commerce' || open

  const moduleList = task === 'product-main' ? productMainModules : detailModules
  const moduleTotal = Object.values(moduleCounts).reduce((total, value) => total + value, 0)
  const usesModules = mode === 'commerce' && (task === 'product-main' || task === 'detail-page')

  return (
    <section className={`advanced-settings ${expanded ? 'is-open' : ''}`} aria-label="更多参数" ref={panelRef}>
      {mode === 'commerce' ? <h3 className="advanced-heading">更多设置</h3> : <button
        className="advanced-toggle"
        type="button"
        aria-expanded={open}
        aria-controls="advanced-settings-body"
        onClick={() => setOpen((value) => !value)}
      >
        <SlidersHorizontal size={15} aria-hidden="true" /><span>更多参数</span>{mode !== 'general' && <small>{summary}</small>}
      </button>}

      {expanded && (
        <div className="advanced-body" id="advanced-settings-body">
          {mode === 'general' && (
            <div className="settings-grid">
              <label className="settings-field"><span>创作风格</span><Select value={props.style} onValueChange={value => props.onSetStyle(value as GeneralStyle)}><SelectTrigger aria-label="创作风格"><SelectValue /></SelectTrigger><SelectContent>{styleOptions.map(([value, label]) => <SelectItem value={value} key={value}>{label}</SelectItem>)}</SelectContent></Select></label>
              <label className="settings-field">
                <span>参考强度</span>
                <Select value={referenceStrength} onValueChange={(value) => onSetReferenceStrength(value as ReferenceStrength)}>
                  <SelectTrigger aria-label="参考强度"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="low">低</SelectItem>
                    <SelectItem value="medium">中</SelectItem>
                    <SelectItem value="high">高</SelectItem>
                  </SelectContent>
                </Select>
              </label>

            </div>
          )}

          {mode === 'commerce' && task === 'viral-recreate' && (
            <div className="choice-group">
              <span className="choice-label">复刻程度</span>
              <div className="recreate-options">
                <label className={recreateStrength === 'style' ? 'selected' : ''}>
                  <input type="radio" checked={recreateStrength === 'style'} onChange={() => onSetRecreateStrength('style')} />
                  <span><strong>参考风格</strong><small>参考整体风格和结构，自动调整色彩和重构场景</small></span>
                </label>
                <label className={recreateStrength === 'high' ? 'selected' : ''}>
                  <input type="radio" checked={recreateStrength === 'high'} onChange={() => onSetRecreateStrength('high')} />
                  <span><strong>高度复刻</strong><small>参照参考图视觉结构替换产品和文案，场景细节略有差异</small></span>
                </label>
              </div>
            </div>
          )}

          {mode === 'commerce' && task === 'product-retouch' && (
            <div className="choice-group">
              <span className="choice-label">快捷优化项</span>
              <div className="insight-chips">
                {retouchOptions.map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    aria-pressed={enhancements.includes(value)}
                    className={enhancements.includes(value) ? 'selected' : ''}
                    onClick={() => onSetEnhancements(
                      enhancements.includes(value) ? enhancements.filter((item) => item !== value) : [...enhancements, value],
                    )}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {usesModules && (
            <div className="choice-group">
              <span className="choice-label">图片模块</span>
              <div className="module-switch" role="group" aria-label="图片模块模式">
                <button
                  type="button"
                  aria-pressed={moduleMode === 'smart'}
                  className={moduleMode === 'smart' ? 'is-selected' : ''}
                  onClick={() => onSetModuleMode('smart')}
                >
                  <strong>智能组合</strong>
                  <small>AI 自动挑选</small>
                </button>
                <button
                  type="button"
                  aria-pressed={moduleMode === 'custom'}
                  className={moduleMode === 'custom' ? 'is-selected' : ''}
                  onClick={() => onSetModuleMode('custom')}
                >
                  <strong>自定义</strong>
                  <small>自己挑模块</small>
                </button>
              </div>
              {moduleMode === 'custom' && (
                <>
                  <div className="module-picker">
                    {moduleList.map(([value, label]) => {
                      const count = moduleCounts[value] ?? 0
                      const isSelected = count > 0
                      const canAdd = moduleTotal < 16
                      return (
                        <div className={`module-card ${isSelected ? 'is-selected' : ''}`} key={value}>
                          <button
                            type="button"
                            className="module-card-toggle"
                            aria-pressed={isSelected}
                            disabled={!isSelected && !canAdd}
                            onClick={() => onSetModuleCounts(isSelected
                              ? (() => { const next = { ...moduleCounts }; delete next[value]; return next })()
                              : { ...moduleCounts, [value]: 1 })}
                          >
                            <span>{label}</span>
                            {isSelected ? <Check size={14} aria-hidden="true" /> : <Plus size={14} aria-hidden="true" />}
                          </button>
                          {isSelected && (
                            <div className="module-stepper">
                              <button
                                type="button"
                                aria-label={`减少${label}数量`}
                                disabled={count <= 1}
                                onClick={() => onSetModuleCounts({ ...moduleCounts, [value]: count - 1 })}
                              >−</button>
                              <span>{count} 张</span>
                              <button
                                type="button"
                                aria-label={`增加${label}数量`}
                                disabled={count >= 4 || moduleTotal >= 16}
                                onClick={() => onSetModuleCounts({ ...moduleCounts, [value]: count + 1 })}
                              >+</button>
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                  <p className="field-helper module-helper">
                    {moduleTotal > 0
                      ? `已选 ${Object.keys(moduleCounts).length} 个模块、共 ${moduleTotal} 张（最多 16 张）。`
                      : '还没有选择模块，至少选一个才能生成。'}
                  </p>
                </>
              )}
            </div>
          )}


        </div>
      )}
    </section>
  )
}
