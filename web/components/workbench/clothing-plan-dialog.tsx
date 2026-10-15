'use client'

import { GenerationCost, useGenerationCost } from '../generation-cost'
import { LoaderCircle, Sparkles, X } from 'lucide-react'
import { useEffect, useRef } from 'react'
import type { ClothingPlan } from '@/lib/contracts'

interface ClothingPlanDialogProps {
  modelId: string
  plan: ClothingPlan
  busy: boolean
  canAnalyze: boolean
  message: string
  contextLabel: string
  requirements: string
  onChange: (plan: ClothingPlan) => void
  onAnalyze: () => void
  onManual: () => void
  onClose: () => void
  onConfirm: () => void
}

export function ClothingPlanDialog({
  modelId,
  plan,
  busy,
  canAnalyze,
  message,
  contextLabel,
  requirements,
  onChange,
  onAnalyze,
  onManual,
  onClose,
  onConfirm,
}: ClothingPlanDialogProps) {
  const cost = useGenerationCost(modelId, plan.shots.length)
  const ref = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    ref.current?.showModal()
  }, [])
  const valid = plan.shots.every((shot) => shot.label.trim() && shot.description.trim())
  function field(index: number, patch: Partial<ClothingPlan['shots'][number]>) {
    onChange({
      ...plan,
      shots: plan.shots.map((shot, position) =>
        position === index ? { ...shot, ...patch } : shot,
      ),
    })
  }
  return (
    <dialog
      ref={ref}
      className="clothing-plan-dialog"
      aria-labelledby="clothing-plan-title"
      onCancel={(event) => {
        event.preventDefault()
        onClose()
      }}
    >
      <header className="clothing-plan-heading">
        <div>
          <span>确认后开始生成</span>
          <h2 id="clothing-plan-title">拍摄规划 · {plan.shots.length} 张</h2>
        </div>
        <button type="button" className="settings-icon" aria-label="关闭拍摄规划" onClick={onClose}>
          <X size={20} aria-hidden="true" />
        </button>
      </header>
      <div className="clothing-plan-body">
        <p className="clothing-plan-context">{contextLabel}</p>
        {requirements.trim() && (
          <details className="clothing-plan-requirements">
            <summary>本组补充需求</summary>
            <p>{requirements}</p>
          </details>
        )}
        <div className="clothing-plan-tools">
          {busy ? (
            <>
              <span role="status">
                <LoaderCircle size={16} className="settings-spinner" aria-hidden="true" />
                正在分析服装与拍摄方向
              </span>
              <button type="button" className="settings-command" onClick={onManual}>
                改用手动规划
              </button>
            </>
          ) : (
            <>
              <p>{plan.summary}</p>
              <button
                type="button"
                className="settings-command"
                disabled={!canAnalyze}
                title={canAnalyze ? undefined : '在 AI 设置中配置支持图片识别的 Prompt 服务后可用'}
                onClick={onAnalyze}
              >
                <Sparkles size={15} aria-hidden="true" />
                AI 分析规划
              </button>
            </>
          )}
        </div>
        {message && (
          <p className="clothing-plan-message" role="alert">
            {message}
          </p>
        )}
        {plan.warnings.length > 0 && (
          <ul className="clothing-plan-warnings">
            {plan.warnings.map((warning, index) => (
              <li key={index}>{warning}</li>
            ))}
          </ul>
        )}
        <fieldset className="clothing-plan-shots" disabled={busy}>
          {plan.shots.map((shot, index) => (
            <section className="clothing-plan-shot" key={shot.id}>
              <span className="clothing-shot-number" aria-hidden="true">
                {String(index + 1).padStart(2, '0')}
              </span>
              <div>
                <label htmlFor={`${shot.id}-label`}>图片名称</label>
                <input
                  id={`${shot.id}-label`}
                  aria-label={`第 ${index + 1} 张图片名称`}
                  value={shot.label}
                  maxLength={80}
                  onChange={(event) => field(index, { label: event.target.value })}
                />
                <label htmlFor={`${shot.id}-description`}>拍摄要求</label>
                <textarea
                  id={`${shot.id}-description`}
                  aria-label={`第 ${index + 1} 张拍摄要求`}
                  value={shot.description}
                  maxLength={2000}
                  rows={3}
                  onChange={(event) => field(index, { description: event.target.value })}
                />
              </div>
            </section>
          ))}
        </fieldset>
      </div>
      <footer className="clothing-plan-footer">
        <GenerationCost {...cost} />
        <div>
          <button type="button" className="settings-command" onClick={onClose}>
            返回设置
          </button>
          <button
            type="button"
            className="settings-primary"
            disabled={
              busy || !valid || (cost.authenticated && (!cost.quote || !cost.quote.canAfford))
            }
            onClick={onConfirm}
          >
            确认生成 {plan.shots.length} 张
          </button>
        </div>
      </footer>
    </dialog>
  )
}
