import 'reflect-metadata';
import { Logger, LogLevel } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { configureApp } from './bootstrap';
import { loadConfig } from './config/env';

const LEVELS: LogLevel[] = ['fatal', 'error', 'warn', 'log', 'debug', 'verbose'];

async function main(): Promise<void> {
  const config = loadConfig();
  const level = LEVELS.indexOf(config.logLevel as LogLevel);
  const app = await NestFactory.create(AppModule, { logger: LEVELS.slice(0, level < 0 ? 4 : level + 1) });
  configureApp(app, config);
  app.enableShutdownHooks();
  if (config.swaggerEnabled) {
    const doc = SwaggerModule.createDocument(
      app,
      new DocumentBuilder()
        .setTitle('Bâjet Combined-Credit Payment Platform')
        .setDescription('REST API: merchant integration, consumer checkout, callbacks and admin control plane. Amounts are integer Toman.')
        .setVersion('1.0')
        .addApiKey({ type: 'apiKey', in: 'header', name: 'X-Bajet-Signature' }, 'merchant-hmac')
        .addCookieAuth('bajet_admin', { type: 'apiKey', in: 'cookie' }, 'admin-session')
        .addCookieAuth('bajet_chk', { type: 'apiKey', in: 'cookie' }, 'checkout-session')
        .build(),
    );
    SwaggerModule.setup('v1/docs', app, doc, { jsonDocumentUrl: 'v1/docs/openapi.json' });
  }
  await app.listen(config.port, '0.0.0.0');
  new Logger('Main').log(`API listening on :${config.port}`);
}

void main();
