import { Controller, Get, Res } from '@nestjs/common';
import type { Response } from 'express';
import { Public } from '../auth/decorators.js';
import { PrismaService } from '../common/prisma/prisma.service.js';
import { StorageService } from '../storage/storage.service.js';
import { QueueService } from '../jobs/queue.service.js';
import { AppConfig } from '../config/app-config.js';
import { queueBackendLabel, withTimeout } from '../jobs/queue.js';

type Check = { status: 'ok' | 'error'; detail?: string; latencyMs?: number };

@Public()
@Controller('health')
export class HealthController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly queue: QueueService,
    private readonly config: AppConfig,
  ) {}

  /** Liveness: the process is up and serving requests. No dependency checks. */
  @Get('live')
  live() {
    return { status: 'ok', uptimeSeconds: Math.round(process.uptime()) };
  }

  /** Readiness: required dependencies respond. AI availability is reported but never blocks readiness. */
  @Get('ready')
  async ready(@Res({ passthrough: true }) res: Response) {
    const run = async (fn: () => Promise<unknown>, label: string): Promise<Check> => {
      const started = performance.now();
      try {
        await withTimeout(fn(), 5000, label);
        return { status: 'ok', latencyMs: Math.round(performance.now() - started) };
      } catch (error) {
        return { status: 'error', detail: (error as Error).message.slice(0, 200) };
      }
    };
    const [database, storage, queue] = await Promise.all([
      run(() => this.prisma.$queryRaw`SELECT 1`, 'database'),
      run(() => this.storage.check(), 'storage'),
      run(() => this.queue.check(), 'queue'),
    ]);
    const ai = this.config.aiAvailability();
    const ok = [database, storage, queue].every((c) => c.status === 'ok');
    res.status(ok ? 200 : 503);
    return {
      status: ok ? 'ok' : 'degraded',
      checks: {
        database,
        storage: { ...storage, driver: this.storage.driver },
        queue: { ...queue, backend: queueBackendLabel(this.config) },
      },
      ai: { mode: ai.mode, available: ai.available, label: ai.label },
    };
  }
}
