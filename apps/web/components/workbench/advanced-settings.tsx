'use client'

import { Check, ChevronDown, Plus } from 'lucide-react'
import { useState } from 'react'

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/select'
import type { GenerationModel } from '@/lib/contracts'

import {
  countOptions,
  detailModules,
  languageOptions,
  modelOptions,
  productMainModules,
  resolutionOptions,
  retouchOptions,
  type ModuleMode,
  type ReferenceStrength,
  type WorkbenchMode,
} from './shared'
import type { CommerceTaskType } from '@/lib/contracts'

interface AdvancedSettingsProps {
  mode: WorkbenchMode
  task: CommerceTaskType
  referenceStrength: ReferenceStrength
  resolution: string
  count: number
  model: GenerationModel
  outputLanguage: string
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
  onSetOutputLanguage: (language: string) => void
  onSetModuleMode: (mode: ModuleMode) => void
  onSetModuleCounts: (counts: Record<string, number>) => void
  onSetRecreateStrength: (strength: 'style' | 'high') => void
  onSetEnhancements: (enhancements: string[]) => void
}

/** 高级设置：默认收起，专业用户展开后仍然是完整控制面。 */
export function AdvancedSettings(props: AdvancedSettingsProps) {
  const {
    mode, task, referenceStrength, resolution, count, model, outputLanguage,
    moduleMode, moduleCounts, recreateStrength, enhancements, summary,
    onSetReferenceStrength, onSetResolution, onSetCount, onSetModel, onSetOutputLanguage,
    onSetModuleMode, onSetModuleCounts, onSetRecreateStrength, onSetEnhancements,
  } = props
  const [open, setOpen] = useState(false)

  const moduleList = task === 'product-main' ? productMainModules : detailModules
  const moduleTotal = Object.values(moduleCounts).reduce((total, value) => total + value, 0)
  const usesModules = mode === 'commerce' && (task === 'product-main' || task === 'detail-page')

  return (
    <section className={`advanced-settings ${open ? 'is-open' : ''}`} aria-label="高级设置">
      <button
        className="advanced-toggle"
        type="button"
        aria-expanded={open}
        aria-controls="advanced-settings-body"
        onClick={() => setOpen((value) => !value)}
      >
        <span>高级设置</span>
        <small>{summary}</small>
        <ChevronDown size={16} aria-hidden="true" />
      </button>

      {open && (
        <div className="advanced-body" id="advanced-settings-body">
          {mode === 'general' && (
            <div className="settings-grid">
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
              <label className="settings-field">
                <span>生成数量</span>
                <Select value={String(count)} onValueChange={(value) => onSetCount(Number(value))}>
                  <SelectTrigger aria-label="生成数量"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {countOptions.map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </label>
            </div>
          )}

          {mode === 'commerce' && task !== 'product-retouch' && (
            <label className="settings-field">
              <span>目标语言</span>
              <Select value={outputLanguage} onValueChange={onSetOutputLanguage}>
                <SelectTrigger aria-label="目标语言"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {languageOptions.map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}
                </SelectContent>
              </Select>
            </label>
          )}

          {task === 'viral-recreate' && (
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

          {task === 'product-retouch' && (
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

          <div className="settings-grid">
            <label className="settings-field">
              <span>分辨率</span>
              <Select value={resolution} onValueChange={onSetResolution}>
                <SelectTrigger aria-label="分辨率"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {resolutionOptions.map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}
                </SelectContent>
              </Select>
            </label>
            <label className="settings-field">
              <span>生图模型</span>
              <Select value={model} onValueChange={(value) => onSetModel(value as GenerationModel)}>
                <SelectTrigger aria-label="生图模型"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {modelOptions.map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}
                </SelectContent>
              </Select>
            </label>
          </div>
        </div>
      )}
    </section>
  )
}
