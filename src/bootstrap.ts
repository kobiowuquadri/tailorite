import 'reflect-metadata';
import { config as loadDotenv } from 'dotenv';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import cookieParser from 'cookie-parser';
import { AppModule } from './app.module.js';
import { AppConfig } from './config/app-config.js';
import { ConfigError } from './config/env.js';
import { JsonLogger, setSharedLogger } from './common/logging/json-logger.js';
import { requestIdMiddleware } from './common/http/request-id.middleware.js';
import { parseTrustProxy, securityHeadersMiddleware } from './common/http/security-headers.middleware.js';
import { installZodErrorMessages } from './contracts/common.js';

installZodErrorMessages();

/** Loads `.env` (without overriding real environment variables) and validates configuration. */
export function loadConfig(overrides: Record<string, string | undefined> = {}): AppConfig {
  loadDotenv({ quiet: true });
  try {
    return AppConfig.fromProcessEnv(overrides);
  } catch (error) {
    if (error instanceof ConfigError) {
      console.error(`\n${error.message}\n\nSee .env.example for every supported variable.\n`);
      process.exit(1);
    }
    throw error;
  }
}

/** Builds the HTTP application. Shared by main.ts and integration tests. */
export async function createApiApp(config: AppConfig, opts: { logger?: JsonLogger | false } = {}) {
  const logger = opts.logger ?? new JsonLogger(config.env.LOG_LEVEL, 'api');
  if (logger) setSharedLogger(logger);
  const app = await NestFactory.create<NestExpressApplication>(AppModule.register(config), {
    logger: logger || false,
    bodyParser: false,
  });
  app.set('trust proxy', parseTrustProxy(config.env.TRUST_PROXY));
  app.disable('x-powered-by');
  app.use(requestIdMiddleware);
  app.use(securityHeadersMiddleware);
  app.use(cookieParser());
  app.useBodyParser('json', { limit: '512kb' });
  app.setGlobalPrefix('api');
  app.enableShutdownHooks();
  return app;
}
