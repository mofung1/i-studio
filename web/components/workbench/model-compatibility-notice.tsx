'use client'

import {
  compatibleImageParameters,
  modelCompatibilityIssue,
  type ImageModelParameters,
  type PublicImageModel,
} from '@/lib/generation-models'

export function ModelCompatibilityNotice({
  model,
  parameters,
  onApply,
}: {
  model: PublicImageModel | undefined
  parameters: ImageModelParameters
  onApply: (parameters: { aspectRatio: string; resolution: string }) => void
}) {
  const issue = modelCompatibilityIssue(model, parameters)
  if (!issue) return null
  const compatible = compatibleImageParameters(model, parameters)
  const canAdjust =
    compatible.aspectRatio !== parameters.aspectRatio ||
    compatible.resolution !== parameters.resolution
  return (
    <div className="model-compatibility-notice">
      <p className="form-notice error" role="alert">
        {issue}
      </p>
      {canAdjust && (
        <button type="button" className="studio-secondary" onClick={() => onApply(compatible)}>
          使用 {compatible.aspectRatio} · {compatible.resolution}
        </button>
      )}
    </div>
  )
}
