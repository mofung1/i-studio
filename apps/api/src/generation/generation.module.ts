import { Module } from '@nestjs/common'

import { GenerationController } from './generation.controller'

@Module({
  controllers: [GenerationController],
})
export class GenerationModule {}

