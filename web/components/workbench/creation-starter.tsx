import { ArrowUpRight, ChevronDown } from 'lucide-react'
import Link from 'next/link'
import { DropdownMenu } from 'radix-ui'
import { useRef } from 'react'
import { CommerceExampleGallery } from '@/components/commerce-example-gallery'
import {
  commerceRecipeUrl,
  getCommerceRecipeForTask,
  type CommerceRecipe,
} from '@/lib/commerce-recipe'
import type { CommerceTaskType } from '@/lib/contracts'
import { creationExamples, type CreationExample } from '@/lib/creation-examples'
import { CommerceCasePreview } from './commerce-case-preview'
import { taskMeta } from './shared'

function DescriptionExamplesMenu({
  examples,
  disabled,
  onApply,
}: {
  examples: CreationExample[]
  disabled?: boolean
  onApply: (example: CreationExample) => void
}) {
  const applied = useRef(false)

  return (
    <DropdownMenu.Root modal={false}>
      <DropdownMenu.Trigger asChild>
        <button
          type="button"
          className="studio-secondary commerce-description-trigger"
          disabled={disabled}
        >
          填入描述示例
          <ChevronDown size={14} aria-hidden="true" />
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          className="commerce-description-menu"
          align="end"
          sideOffset={8}
          collisionPadding={12}
          onCloseAutoFocus={(event) => {
            // The workbench moves focus to the editor after an example is applied.
            if (applied.current) event.preventDefault()
            applied.current = false
          }}
        >
          {examples.map((example) => (
            <DropdownMenu.Item
              key={example.title}
              className="commerce-description-option"
              disabled={disabled}
              onSelect={() => {
                applied.current = true
                onApply(example)
              }}
            >
              {example.title}
            </DropdownMenu.Item>
          ))}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  )
}

export function CreationStarter({
  mode,
  task,
  canApply,
  projectId,
  recipePreview,
  disabled,
  onApply,
  onOpenRecipe,
}: {
  mode: 'general' | 'commerce'
  task: CommerceTaskType
  canApply: boolean
  projectId?: string | null
  recipePreview?: CommerceRecipe
  disabled?: boolean
  onApply: (example: CreationExample) => void
  onOpenRecipe: (href: string) => void
}) {
  if (recipePreview) {
    const title = `${recipePreview.title}案例效果`
    return (
      <section className="creation-starter creation-starter-recipe" aria-label={title}>
        <h2>{title}</h2>
        <CommerceExampleGallery
          recipeId={recipePreview.id}
          sizes="(max-width: 560px) 45vw, (max-width: 780px) 24vw, 252px"
        />
      </section>
    )
  }

  const examples = creationExamples(mode, task)

  if (mode === 'commerce') {
    const recipe = getCommerceRecipeForTask(task)
    const project = projectId ? new URLSearchParams({ projectId }) : undefined
    const recipeHref = recipe ? commerceRecipeUrl(recipe, project) : undefined
    return (
      <section
        className="creation-starter creation-starter-commerce"
        aria-label={`${taskMeta[task].title}效果示例`}
      >
        <h2>效果示例</h2>
        <CommerceCasePreview task={task} />
        {(recipeHref || canApply) && (
          <div className="commerce-starter-actions">
            {recipeHref && (
              <Link
                className="studio-secondary"
                href={recipeHref}
                aria-disabled={disabled || undefined}
                onNavigate={(event) => {
                  event.preventDefault()
                  if (!disabled) onOpenRecipe(recipeHref)
                }}
              >
                用我的商品做同款
                <ArrowUpRight size={15} aria-hidden="true" />
              </Link>
            )}
            {canApply && (
              <DescriptionExamplesMenu examples={examples} disabled={disabled} onApply={onApply} />
            )}
          </div>
        )}
      </section>
    )
  }

  return (
    <section className="creation-starter" aria-label="创作入门">
      <h2>{canApply ? '从一个想法开始' : '继续完善这次创作'}</h2>
      <p className="creation-starter-lead">
        {canApply
          ? '写下主体、场景和风格，也可以从下面的描述示例开始。'
          : '描述可继续编辑，也可以按需添加参考图片；准备好后再确认参数与积分。'}
      </p>
      {canApply && (
        <div className="creation-example-list" aria-label="描述示例">
          {examples.map((example) => (
            <button
              key={example.title}
              type="button"
              disabled={disabled}
              onClick={() => onApply(example)}
            >
              <span>{example.title}</span>
              <ArrowUpRight size={16} aria-hidden="true" />
            </button>
          ))}
        </div>
      )}
      {canApply && <p className="creation-starter-note">点击示例只填入描述，确认后再生成。</p>}
    </section>
  )
}
