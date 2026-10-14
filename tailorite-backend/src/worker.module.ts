import { Module, type DynamicModule } from '@nestjs/common';
import { ConfigModule } from './config/config.module.js';
import type { AppConfig } from './config/app-config.js';
import { PrismaModule } from './common/prisma/prisma.module.js';
import { CommonModule } from './common/common.module.js';
import { AuditModule } from './audit/audit.module.js';
import { StorageModule } from './storage/storage.module.js';
import { QueueModule } from './jobs/queue.module.js';
import { AiModule } from './ai/ai.module.js';
import { BriefsCoreModule } from './briefs/briefs-core.module.js';
import { ExtractionProcessor } from './jobs/extraction.processor.js';
import { RecoveryService } from './jobs/recovery.service.js';
import { HousekeepingService } from './jobs/housekeeping.service.js';
import { WorkerRunner } from './jobs/worker-runner.js';
import { DemoPurgeService } from './demo/demo-purge.service.js';

/** Worker root module: the same domain code as the API, without the HTTP layer. */
@Module({})
export class WorkerModule {
  static register(config?: AppConfig): DynamicModule {
    return {
      module: WorkerModule,
      imports: [
        ConfigModule.forRoot(config),
        PrismaModule,
        CommonModule,
        AuditModule,
        StorageModule,
        QueueModule,
        AiModule,
        BriefsCoreModule,
      ],
      providers: [ExtractionProcessor, RecoveryService, HousekeepingService, DemoPurgeService, WorkerRunner],
      exports: [ExtractionProcessor, RecoveryService],
    };
  }
}
