import { Module } from '@nestjs/common';
import { ApprovalsController } from './approvals.controller.js';
import { PublicationService } from './publication.service.js';
import { LinksService } from './links.service.js';
import { VersionsService } from './versions.service.js';
import { BriefsCoreModule } from '../briefs/briefs-core.module.js';

@Module({
  imports: [BriefsCoreModule],
  controllers: [ApprovalsController],
  providers: [PublicationService, LinksService, VersionsService],
  exports: [PublicationService],
})
export class ApprovalsModule {}
