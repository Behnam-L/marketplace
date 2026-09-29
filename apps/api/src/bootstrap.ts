import { INestApplication } from '@nestjs/common';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { AppConfig } from './config/env';
import { HttpExceptionFilter } from './shared/errors/http-exception.filter';
import { requestIdMiddleware } from './shared/http/request-id.middleware';
import { createValidationPipe } from './shared/http/validation';

/** Applies middleware/pipes/filters shared by the server and the e2e tests. */
export function configureApp(app: INestApplication, config: AppConfig): void {
  const express = app.getHttpAdapter().getInstance() as { set: (k: string, v: unknown) => void };
  express.set('trust proxy', 1);
  app.use(requestIdMiddleware);
  app.use(helmet({ contentSecurityPolicy: false, crossOriginResourcePolicy: { policy: 'same-site' } }));
  app.use(cookieParser());
  app.setGlobalPrefix('v1');
  app.useGlobalPipes(createValidationPipe());
  app.useGlobalFilters(new HttpExceptionFilter());
  if (config.corsOrigins.length) app.enableCors({ origin: config.corsOrigins, credentials: true });
}
