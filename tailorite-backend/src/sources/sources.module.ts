import { Module } from '@nestjs/common';
import { SourcesController } from './sources.controller.js';
import { SourcesService } from './sources.service.js';
import { SourceUploadInterceptor } from './upload.interceptor.js';

@Module({
  controllers: [SourcesController],
  providers: [SourcesService, SourceUploadInterceptor],
  exports: [SourcesService],
})
export class SourcesModule {}
