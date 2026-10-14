import { Injectable, type OnModuleDestroy } from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../generated/prisma/client.js';
import { AppConfig } from '../../config/app-config.js';

/** Single Prisma client per process, backed by a bounded node-postgres pool. */
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleDestroy {
  constructor(config: AppConfig) {
    super({
      adapter: new PrismaPg({
        connectionString: config.env.DATABASE_URL,
        max: config.env.DATABASE_POOL_MAX,
        connectionTimeoutMillis: 10_000,
        idleTimeoutMillis: 30_000,
      }),
      // Hosted databases add network latency to every statement and small plans allow only a
      // couple of pooled connections, so allow longer transactions and waits than Prisma's 5 s / 2 s.
      transactionOptions: { timeout: 30_000, maxWait: 15_000 },
    });
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}

/** Transaction client type for services that participate in a caller's transaction. */
export type Tx = Omit<
  PrismaClient,
  '$connect' | '$disconnect' | '$on' | '$transaction' | '$extends'
>;
