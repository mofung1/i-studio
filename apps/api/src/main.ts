import { NestFactory } from '@nestjs/core'

import { AppModule } from './app.module'

async function bootstrap() {
  const app = await NestFactory.create(AppModule)
  const port = Number(process.env.API_PORT ?? 4000)

  app.setGlobalPrefix('v1')
  app.enableCors({
    origin: [/^http:\/\/(127\.0\.0\.1|localhost):\d+$/],
    credentials: true,
  })

  await app.listen(port, '127.0.0.1')
}

void bootstrap()

