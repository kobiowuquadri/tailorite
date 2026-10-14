import { Body, Controller, Get, HttpCode, Param, Post } from '@nestjs/common';
import { actorOf, Auth, StudioId } from '../auth/decorators.js';
import { ZodPipe } from '../common/validation/zod.pipe.js';
import { IdPipe } from '../common/validation/id.pipe.js';
import { DeclineChangeInput, StartChangeInput, type ChangeRequestDto } from '../contracts/changes.js';
import type { AuthContext } from '../common/http/request-context.js';
import { ChangesService } from './changes.service.js';

@Controller('orders/:orderId/change-requests')
export class ChangesController {
  constructor(private readonly changes: ChangesService) {}

  @Get()
  list(@StudioId() studioId: string, @Param('orderId', new IdPipe('Order')) orderId: string): Promise<ChangeRequestDto[]> {
    return this.changes.list(studioId, orderId);
  }

  /** Studio-initiated change proposal. Submit it with POST /orders/:orderId/versions. */
  @Post()
  start(
    @StudioId() studioId: string,
    @Auth() auth: AuthContext,
    @Param('orderId', new IdPipe('Order')) orderId: string,
    @Body(new ZodPipe(StartChangeInput)) body: StartChangeInput,
  ): Promise<ChangeRequestDto> {
    return this.changes.startFromStudio(studioId, actorOf(auth), orderId, body);
  }

  @Post(':changeRequestId/start')
  @HttpCode(200)
  startFromRequest(
    @StudioId() studioId: string,
    @Auth() auth: AuthContext,
    @Param('orderId', new IdPipe('Order')) orderId: string,
    @Param('changeRequestId', new IdPipe('Change request')) changeRequestId: string,
    @Body(new ZodPipe(StartChangeInput)) body: StartChangeInput,
  ): Promise<ChangeRequestDto> {
    return this.changes.startFromRequest(studioId, actorOf(auth), orderId, changeRequestId, body);
  }

  @Post(':changeRequestId/decline')
  @HttpCode(200)
  decline(
    @StudioId() studioId: string,
    @Auth() auth: AuthContext,
    @Param('orderId', new IdPipe('Order')) orderId: string,
    @Param('changeRequestId', new IdPipe('Change request')) changeRequestId: string,
    @Body(new ZodPipe(DeclineChangeInput)) body: DeclineChangeInput,
  ): Promise<ChangeRequestDto> {
    return this.changes.decline(studioId, actorOf(auth), orderId, changeRequestId, body);
  }
}
