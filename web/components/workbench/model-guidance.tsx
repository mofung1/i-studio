import type { PublicImageModel } from '@/lib/generation-models'
import { formatCredits } from '@/lib/credits'

export function ModelGuidance({ model }: { model?: PublicImageModel }) {
  if (!model) return null
  const hint = model.usageHint?.trim()
  const capabilities = model.capabilities
  const hasPrice = typeof model.priceMinor === 'number' && Number.isFinite(model.priceMinor)
  if (!hint && !capabilities && !hasPrice) return null
  return (
    <div className="model-guidance" key={model.id}>
      {hint && <p className="model-usage-hint">{hint}</p>}
      {(capabilities || hasPrice) && (
        <details>
          <summary>查看模型能力与单价</summary>
          <dl>
            {capabilities && (
              <>
                <div>
                  <dt>图片输入</dt>
                  <dd>{capabilities.referenceImages ? '支持参考图' : '仅文字输入'}</dd>
                </div>
                <div>
                  <dt>画面比例</dt>
                  <dd>{capabilities.aspectRatios.join('、')}</dd>
                </div>
                <div>
                  <dt>清晰度</dt>
                  <dd>{capabilities.resolutions.join('、')}</dd>
                </div>
              </>
            )}
            {hasPrice && (
              <div>
                <dt>单张消耗</dt>
                <dd>
                  {formatCredits(model.priceMinor!)} {model.creditName ?? '积分'}/张
                </dd>
              </div>
            )}
          </dl>
          <p>生成前可查看当前任务的预计消耗，按实际交付结算。</p>
        </details>
      )}
    </div>
  )
}
