import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import type { INestApplication } from '@nestjs/common';
import type { ApiConfig } from '@vms/config';

import { AppModule } from './app.module.js';
import { ApiExceptionFilter } from './common/api-exception.filter.js';
import { requestIdMiddleware } from './common/request-id.middleware.js';

export function configureApiApplication(
  application: INestApplication,
  options: Pick<ApiConfig, 'API_CORS_ORIGINS'>,
): void {
  application.setGlobalPrefix('api/v1');
  application.use(requestIdMiddleware);
  application.useGlobalFilters(new ApiExceptionFilter());
  application.useGlobalPipes(
    new ValidationPipe({
      forbidNonWhitelisted: true,
      transform: true,
      whitelist: true,
    }),
  );
  application.enableCors({
    credentials: true,
    origin: options.API_CORS_ORIGINS,
  });
  application.enableShutdownHooks();
}

export async function createApiApplication(config: ApiConfig): Promise<INestApplication> {
  const application = await NestFactory.create(AppModule, { bufferLogs: true });
  configureApiApplication(application, config);

  const openApiConfig = new DocumentBuilder()
    .setTitle('Vehicle Management API')
    .setDescription('Versioned REST API for the Vehicle Management System')
    .setVersion('1.0')
    .addBearerAuth({ type: 'http', scheme: 'bearer', bearerFormat: 'JWT' })
    .addApiKey({ type: 'apiKey', in: 'header', name: 'x-organization-id' }, 'organization')
    .build();
  SwaggerModule.setup(
    'api/docs',
    application,
    SwaggerModule.createDocument(application, openApiConfig),
  );

  return application;
}
