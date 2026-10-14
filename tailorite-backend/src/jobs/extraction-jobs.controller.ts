import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { actorOf, Auth, StudioId } from '../auth/decorators.js';
import { ZodPipe } from '../common/validation/zod.pipe.js';
import { IdPipe } from '../common/validation/id.pipe.js';
import { StartExtractionInput, type ExtractionJobDto, type ExtractionOverviewDto } from '../contracts/extraction.js';
import type { AuthContext } from '../common/http/request-context.js';
import { ExtractionJobsService } from './extraction-jobs.service.js';

@Controller('orders/:orderId/extractions')
export class ExtractionJobsController {
  constructor(private readonly jobs: ExtractionJobsService) {}

  @Get()
  overview(@StudioId() studioId: string, @Param('orderId', new IdPipe('Order')) orderId: string): Promise<ExtractionOverviewDto> {
    return this.jobs.overview(studioId, orderId);
  }

  @Post()
  start(
    @StudioId() studioId: string,
    @Auth() auth: AuthContext,
    @Param('orderId', new IdPipe('Order')) orderId: string,
    @Body(new ZodPipe(StartExtractionInput)) body: StartExtractionInput,
  ): Promise<ExtractionJobDto> {
    return this.jobs.start(studioId, actorOf(auth), orderId, body);
  }

  @Post(':jobId/retry')
  retry(
    @StudioId() studioId: string,
    @Auth() auth: AuthContext,
    @Param('orderId', new IdPipe('Order')) orderId: string,
    @Param('jobId', new IdPipe('Processing job')) jobId: string,
  ): Promise<ExtractionJobDto> {
    return this.jobs.retry(studioId, actorOf(auth), orderId, jobId);
  }
}
