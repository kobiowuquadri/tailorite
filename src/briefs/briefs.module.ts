import { Module } from '@nestjs/common';
import { BriefsController } from './briefs.controller.js';
import { BriefsService } from './briefs.service.js';
import { BriefsCoreModule } from './briefs-core.module.js';

@Module({
  imports: [BriefsCoreModule],
  controllers: [BriefsController],
  providers: [BriefsService],
  exports: [BriefsService],
})
export class BriefsModule {}
