import { Controller, Get } from '@nestjs/common'

@Controller('health')
export class HealthController {
  @Get()
  getHealth() {
    return {
      service: 'istudio-api',
      status: 'ok',
      aiProviderConfigured: Boolean(process.env.BANANA_ROUTER_API_KEY),
      timestamp: new Date().toISOString(),
    }
  }
}

