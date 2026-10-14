import { Module } from '@nestjs/common';
import { DemoController } from './demo.controller.js';
import { DemoService } from './demo.service.js';
import { DemoScenarioService } from './demo-scenario.service.js';
import { DemoPurgeService } from './demo-purge.service.js';
import { StudiosModule } from '../studios/studios.module.js';
import { CustomersModule } from '../customers/customers.module.js';
import { OrdersModule } from '../orders/orders.module.js';
import { SourcesModule } from '../sources/sources.module.js';
import { BriefsModule } from '../briefs/briefs.module.js';
import { ApprovalsModule } from '../approvals/approvals.module.js';
import { PortalModule } from '../portal/portal.module.js';
import { PaymentsModule } from '../payments/payments.module.js';

@Module({
  imports: [StudiosModule, CustomersModule, OrdersModule, SourcesModule, BriefsModule, ApprovalsModule, PortalModule, PaymentsModule],
  controllers: [DemoController],
  providers: [DemoService, DemoScenarioService, DemoPurgeService],
  exports: [DemoService],
})
export class DemoModule {}
