import { Module } from '@nestjs/common'

import { GenerationModule } from './generation/generation.module'
import { HealthController } from './health.controller'

@Module({
  imports: [GenerationModule],
  controllers: [HealthController],
})
export class AppModule {}

