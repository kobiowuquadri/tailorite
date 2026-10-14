import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Req,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import type { Response } from 'express';
import { SourcesService } from './sources.service.js';
import { SourceUploadInterceptor } from './upload.interceptor.js';
import { actorOf, Auth, StudioId } from '../auth/decorators.js';
import { ZodPipe } from '../common/validation/zod.pipe.js';
import { IdPipe } from '../common/validation/id.pipe.js';
import {
  AddTextSourceInput,
  FileSourceFields,
  TranscriptCorrectionInput,
  UpdateSourceInput,
  type SourceDto,
  type SourcesDto,
} from '../contracts/sources.js';
import type { AppRequest, AuthContext } from '../common/http/request-context.js';
import { sendStoredFile } from './send-file.js';

/** The parts of a multer in-memory file this API uses. */
type UploadedFileBuffer = { buffer: Buffer; originalname?: string; size: number };

@Controller('orders/:orderId/sources')
export class SourcesController {
  constructor(private readonly sources: SourcesService) {}

  @Get()
  list(@StudioId() studioId: string, @Param('orderId', new IdPipe('Order')) orderId: string): Promise<SourcesDto> {
    return this.sources.list(studioId, orderId);
  }

  @Post('text')
  async addText(
    @StudioId() studioId: string,
    @Auth() auth: AuthContext,
    @Param('orderId', new IdPipe('Order')) orderId: string,
    @Body(new ZodPipe(AddTextSourceInput)) body: AddTextSourceInput,
  ): Promise<{ source: SourceDto; duplicate: boolean }> {
    return this.sources.addText(studioId, actorOf(auth), orderId, body);
  }

  @Post('files')
  @UseInterceptors(SourceUploadInterceptor)
  async addFile(
    @StudioId() studioId: string,
    @Auth() auth: AuthContext,
    @Param('orderId', new IdPipe('Order')) orderId: string,
    @UploadedFile() file: UploadedFileBuffer | undefined,
    @Body(new ZodPipe(FileSourceFields)) fields: FileSourceFields,
  ): Promise<{ source: SourceDto; duplicate: boolean }> {
    return this.sources.addFile(studioId, actorOf(auth), orderId, file, fields);
  }

  @Get(':sourceId')
  get(
    @StudioId() studioId: string,
    @Param('orderId', new IdPipe('Order')) orderId: string,
    @Param('sourceId', new IdPipe('Source')) sourceId: string,
  ): Promise<SourceDto> {
    return this.sources.get(studioId, orderId, sourceId);
  }

  @Patch(':sourceId')
  update(
    @StudioId() studioId: string,
    @Auth() auth: AuthContext,
    @Param('orderId', new IdPipe('Order')) orderId: string,
    @Param('sourceId', new IdPipe('Source')) sourceId: string,
    @Body(new ZodPipe(UpdateSourceInput)) body: UpdateSourceInput,
  ): Promise<SourceDto> {
    return this.sources.update(studioId, actorOf(auth), orderId, sourceId, body);
  }

  @Delete(':sourceId')
  @HttpCode(200)
  remove(
    @StudioId() studioId: string,
    @Auth() auth: AuthContext,
    @Param('orderId', new IdPipe('Order')) orderId: string,
    @Param('sourceId', new IdPipe('Source')) sourceId: string,
  ) {
    return this.sources.remove(studioId, actorOf(auth), orderId, sourceId);
  }

  @Get(':sourceId/content')
  async content(
    @StudioId() studioId: string,
    @Param('orderId', new IdPipe('Order')) orderId: string,
    @Param('sourceId', new IdPipe('Source')) sourceId: string,
    @Req() req: AppRequest,
    @Res() res: Response,
  ) {
    const file = await this.sources.openContent(studioId, orderId, sourceId, 'original', req.header('range'));
    sendStoredFile(res, file);
  }

  @Get(':sourceId/preview')
  async preview(
    @StudioId() studioId: string,
    @Param('orderId', new IdPipe('Order')) orderId: string,
    @Param('sourceId', new IdPipe('Source')) sourceId: string,
    @Res() res: Response,
  ) {
    const file = await this.sources.openContent(studioId, orderId, sourceId, 'preview', undefined);
    sendStoredFile(res, file);
  }

  @Post(':sourceId/transcripts')
  correctTranscript(
    @StudioId() studioId: string,
    @Auth() auth: AuthContext,
    @Param('orderId', new IdPipe('Order')) orderId: string,
    @Param('sourceId', new IdPipe('Source')) sourceId: string,
    @Body(new ZodPipe(TranscriptCorrectionInput)) body: TranscriptCorrectionInput,
  ): Promise<SourceDto> {
    return this.sources.correctTranscript(studioId, actorOf(auth), orderId, sourceId, body);
  }
}
