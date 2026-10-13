import { Module } from '@nestjs/common';
import { ChangesController } from './changes.controller.js';
import { ChangesService } from './changes.service.js';
import { BriefsCoreModule } from '../briefs/briefs-core.module.js';

@Module({
  imports: [BriefsCoreModule],
  controllers: [ChangesController],
  providers: [ChangesService],
})
export class ChangesModule {}
