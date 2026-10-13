import { Module, type DynamicModule } from '@nestjs/common';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { ConfigModule } from './config/config.module.js';
import type { AppConfig } from './config/app-config.js';
import { PrismaModule } from './common/prisma/prisma.module.js';
import { CommonModule } from './common/common.module.js';
import { AuditModule } from './audit/audit.module.js';
import { StorageModule } from './storage/storage.module.js';
import { QueueModule } from './jobs/queue.module.js';
import { AuthModule } from './auth/auth.module.js';
import { StudiosModule } from './studios/studios.module.js';
import { HealthModule } from './health/health.module.js';
import { CustomersModule } from './customers/customers.module.js';
import { OrdersModule } from './orders/orders.module.js';
import { SourcesModule } from './sources/sources.module.js';
import { BriefsModule } from './briefs/briefs.module.js';
import { CsrfGuard } from './common/security/csrf.guard.js';
import { SessionGuard } from './auth/session.guard.js';
import { AllExceptionsFilter } from './common/errors/http-exception.filter.js';

/** API root module (the worker uses WorkerModule with the shared domain providers). */
@Module({})
export class AppModule {
  static register(config?: AppConfig): DynamicModule {
    return {
      module: AppModule,
      imports: [
        ConfigModule.forRoot(config),
        PrismaModule,
        CommonModule,
        AuditModule,
        StorageModule,
        QueueModule,
        AuthModule,
        StudiosModule,
        CustomersModule,
        OrdersModule,
        SourcesModule,
        BriefsModule,
        HealthModule,
      ],
      providers: [
        // Guards run in registration order: origin/CSRF check first, then the session.
        { provide: APP_GUARD, useClass: CsrfGuard },
        { provide: APP_GUARD, useClass: SessionGuard },
        { provide: APP_FILTER, useClass: AllExceptionsFilter },
      ],
    };
  }
}
