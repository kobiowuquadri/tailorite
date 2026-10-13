import { Module } from '@nestjs/common';
import { PortalController } from './portal.controller.js';
import { PortalService } from './portal.service.js';
import { PortalSessionGuard } from './portal.guard.js';
import { BriefsCoreModule } from '../briefs/briefs-core.module.js';
import { SourcesModule } from '../sources/sources.module.js';

@Module({
  imports: [BriefsCoreModule, SourcesModule],
  controllers: [PortalController],
  providers: [PortalService, PortalSessionGuard],
})
export class PortalModule {}
