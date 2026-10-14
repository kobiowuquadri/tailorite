import { Module } from '@nestjs/common';
import { StudiosController } from './studios.controller.js';
import { StudiosService } from './studios.service.js';

@Module({
  controllers: [StudiosController],
  providers: [StudiosService],
  exports: [StudiosService],
})
export class StudiosModule {}
