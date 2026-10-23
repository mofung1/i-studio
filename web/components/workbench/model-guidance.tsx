import type { PublicImageModel } from '@/lib/generation-models'

export function ModelGuidance({ model }: { model?: PublicImageModel }) {
  if (!model) return null
  const hint = model.usageHint?.trim()
  if (!hint) return null
  return (
    <div className="model-guidance" key={model.id}>
      <p className="model-usage-hint">{hint}</p>
    </div>
  )
}
