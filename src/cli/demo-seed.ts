import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { loadConfig } from '../bootstrap.js';
import { AppModule } from '../app.module.js';
import { DemoService } from '../demo/demo.service.js';
import { JsonLogger, setSharedLogger } from '../common/logging/json-logger.js';

// Guarded, repeatable seed of the synthetic presenter studio "Amina Atelier".
//   pnpm build && pnpm demo:seed
const config = loadConfig();
setSharedLogger(new JsonLogger('warn', 'demo-seed'));
const app = await NestFactory.createApplicationContext(AppModule.register(config), { logger: false });
try {
  const result = await app.get(DemoService).seedPresenterStudio();
  console.log(`\nSynthetic demo studio "Amina Atelier" is ready.`);
  console.log(`  Sign in:   ${config.env.APP_ORIGIN}/login`);
  console.log(`  Email:     ${result.email}`);
  console.log('  Password:  the DEMO_OWNER_PASSWORD value in your .env');
  console.log(`  Demo order: ${config.env.APP_ORIGIN}/orders/${result.demoOrderId}/brief\n`);
} catch (error) {
  console.error(`\n${(error as Error).message}\n`);
  process.exitCode = 1;
} finally {
  await app.close();
}
