import { BadRequestException, Body, Controller, Get, NotFoundException, Param, Post } from '@nestjs/common'
import { randomUUID } from 'node:crypto'
import {
  commerceTaskCapabilities,
  generationModelSchema,
  generationInputSchema,
  type GenerationInput,
} from '@istudio/contracts'

@Controller('generation')
export class GenerationController {
  private readonly tasks = new Map<string, { id: string; status: 'queued'; createdAt: string; input: GenerationInput }>()

  @Get('capabilities')
  getCapabilities() {
    return {
      aiEnabled: false,
      provider: 'bananarouter',
      models: generationModelSchema.options,
      modes: {
        general: {
          title: '通用生图',
          defaultCount: 1,
        },
        commerce: commerceTaskCapabilities,
      },
    }
  }

  @Post('validate')
  validateGenerationInput(@Body() body: unknown): { valid: true; data: GenerationInput } {
    const result = generationInputSchema.safeParse(body)

    if (!result.success) {
      throw new BadRequestException({
        code: 'GENERATION_INPUT_INVALID',
        message: '生成参数不完整或格式不正确',
        fields: result.error.flatten().fieldErrors,
      })
    }

    return { valid: true, data: result.data }
  }

  @Post('tasks')
  createTask(@Body() body: unknown) {
    const result = generationInputSchema.safeParse(body)

    if (!result.success) {
      throw new BadRequestException({
        code: 'GENERATION_INPUT_INVALID',
        message: '生成参数不完整或格式不正确',
        fields: result.error.flatten().fieldErrors,
      })
    }

    const task = {
      id: randomUUID(),
      status: 'queued' as const,
      createdAt: new Date().toISOString(),
      input: result.data,
    }
    this.tasks.set(task.id, task)

    return {
      task,
      aiEnabled: false,
      message: '任务已创建，等待 AI 服务接入后执行。',
    }
  }

  @Get('tasks/:id')
  getTask(@Param('id') id: string) {
    const task = this.tasks.get(id)
    if (!task) throw new NotFoundException({ code: 'GENERATION_TASK_NOT_FOUND', message: '生成任务不存在' })
    return { task, aiEnabled: false }
  }
}
