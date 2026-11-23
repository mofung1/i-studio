import { z } from 'zod'
import { isCreationImage } from './creation-drafts'
import { inspirationTemplateSchema } from './inspiration-handoff'
import { clothingShotSchema } from './contracts'
import type { CreationImage } from './creation-images'

const images = (limit: number) => z.array(z.custom<CreationImage>(isCreationImage)).max(limit)
const counts = z.record(z.string().max(80), z.number().int().min(0).max(16))
const text = z.string().max(20000)
const model = {
  endpointId: z.string().max(200),
  model: z.string().max(200),
  aspectRatio: z.string().max(30),
  resolution: z.string().max(30),
}

export const standardCreationDraftSchema = z.object({
  prompt: text,
  requirements: text,
  productFiles: images(6),
  referenceFiles: images(6),
  count: z.number().int().min(1).max(16),
  ...model,
  style: z.enum([
    'unspecified',
    'studio',
    'minimal',
    'fresh',
    'technology',
    'guochao',
    'handdrawn',
  ]),
  referenceStrength: z.enum(['low', 'medium', 'high']),
  platform: z.string().max(100),
  outputLanguage: z.string().max(100),
  moduleMode: z.enum(['smart', 'custom']),
  moduleCounts: counts,
  recreateStrength: z.enum(['style', 'high']),
  enhancements: z.array(z.string().max(100)).max(20),
  inspirationTemplate: inspirationTemplateSchema.nullable().default(null),
})
export type StandardCreationDraft = z.infer<typeof standardCreationDraftSchema>

export const clothingCreationDraftSchema = z.object({
  mode: z.enum(['product', 'model']),
  style: z.enum(['studio', 'natural', 'street', 'editorial']),
  counts,
  modelCount: z.number().int().min(1).max(4),
  shots: z
    .array(clothingShotSchema.extend({ description: z.string().max(2000) }))
    .min(1)
    .max(4)
    .optional(),
  garments: images(6),
  models: images(1),
  scenes: images(1),
  requirements: text,
  platform: z.string().max(100),
  outputLanguage: z.string().max(100),
  ...model,
})
