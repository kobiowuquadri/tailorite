import { createApiApp, loadConfig } from './bootstrap.js';
import { logger } from './common/logging/json-logger.js';
import { queueBackendLabel } from './jobs/queue.js';

const config = loadConfig();
const app = await createApiApp(config);
await app.listen(config.env.PORT);

const ai = config.aiAvailability();
logger().event('info', 'api_started', {
  port: config.env.PORT,
  appOrigin: config.env.APP_ORIGIN,
  storage: config.env.STORAGE_DRIVER,
  queue: queueBackendLabel(config),
  aiMode: ai.mode,
  aiAvailable: ai.available,
});
