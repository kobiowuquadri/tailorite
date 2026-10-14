import { Module } from '@nestjs/common';
import { ExtractionJobsController } from './extraction-jobs.controller.js';
import { ExtractionJobsService } from './extraction-jobs.service.js';

/** API side of AI processing: start, observe and retry durable jobs. */
@Module({
  controllers: [ExtractionJobsController],
  providers: [ExtractionJobsService],
})
export class JobsModule {}
