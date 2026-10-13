import { Body, Controller, Get, HttpCode, Param, Post, Put } from '@nestjs/common';
import { BriefsService } from './briefs.service.js';
import { actorOf, Auth, StudioId } from '../auth/decorators.js';
import { ZodPipe } from '../common/validation/zod.pipe.js';
import { IdPipe } from '../common/validation/id.pipe.js';
import {
  AcceptSuggestionInput,
  CopyMeasurementsInput,
  CreateIssueInput,
  DismissIssueInput,
  ResolveIssueInput,
  SaveBriefInput,
  type BriefDto,
} from '../contracts/brief.js';
import type { AuthContext } from '../common/http/request-context.js';

@Controller('orders/:orderId')
export class BriefsController {
  constructor(private readonly briefs: BriefsService) {}

  @Get('brief')
  get(@StudioId() studioId: string, @Param('orderId', new IdPipe('Order')) orderId: string): Promise<BriefDto> {
    return this.briefs.get(studioId, orderId);
  }

  /** Full-content save guarded by the expected draft revision (409 STALE_REVISION on conflict). */
  @Put('brief')
  save(
    @StudioId() studioId: string,
    @Auth() auth: AuthContext,
    @Param('orderId', new IdPipe('Order')) orderId: string,
    @Body(new ZodPipe(SaveBriefInput)) body: SaveBriefInput,
  ): Promise<BriefDto> {
    return this.briefs.save(studioId, actorOf(auth), orderId, body);
  }

  @Post('brief/measurements/copy')
  @HttpCode(200)
  copyMeasurements(
    @StudioId() studioId: string,
    @Auth() auth: AuthContext,
    @Param('orderId', new IdPipe('Order')) orderId: string,
    @Body(new ZodPipe(CopyMeasurementsInput)) body: CopyMeasurementsInput,
  ): Promise<BriefDto> {
    return this.briefs.copyMeasurements(studioId, actorOf(auth), orderId, body);
  }

  @Post('brief/reset')
  @HttpCode(200)
  reset(
    @StudioId() studioId: string,
    @Auth() auth: AuthContext,
    @Param('orderId', new IdPipe('Order')) orderId: string,
  ): Promise<BriefDto> {
    return this.briefs.resetToActive(studioId, actorOf(auth), orderId);
  }

  @Post('issues')
  createIssue(
    @StudioId() studioId: string,
    @Auth() auth: AuthContext,
    @Param('orderId', new IdPipe('Order')) orderId: string,
    @Body(new ZodPipe(CreateIssueInput)) body: CreateIssueInput,
  ): Promise<BriefDto> {
    return this.briefs.createIssue(studioId, actorOf(auth), orderId, body);
  }

  @Post('issues/:issueId/resolve')
  @HttpCode(200)
  resolveIssue(
    @StudioId() studioId: string,
    @Auth() auth: AuthContext,
    @Param('orderId', new IdPipe('Order')) orderId: string,
    @Param('issueId', new IdPipe('Question')) issueId: string,
    @Body(new ZodPipe(ResolveIssueInput)) body: ResolveIssueInput,
  ): Promise<BriefDto> {
    return this.briefs.resolveIssue(studioId, actorOf(auth), orderId, issueId, body);
  }

  @Post('issues/:issueId/dismiss')
  @HttpCode(200)
  dismissIssue(
    @StudioId() studioId: string,
    @Auth() auth: AuthContext,
    @Param('orderId', new IdPipe('Order')) orderId: string,
    @Param('issueId', new IdPipe('Question')) issueId: string,
    @Body(new ZodPipe(DismissIssueInput)) body: DismissIssueInput,
  ): Promise<BriefDto> {
    return this.briefs.dismissIssue(studioId, actorOf(auth), orderId, issueId, body);
  }

  @Post('suggestions/:suggestionId/accept')
  @HttpCode(200)
  acceptSuggestion(
    @StudioId() studioId: string,
    @Auth() auth: AuthContext,
    @Param('orderId', new IdPipe('Order')) orderId: string,
    @Param('suggestionId', new IdPipe('Suggestion')) suggestionId: string,
    @Body(new ZodPipe(AcceptSuggestionInput)) body: AcceptSuggestionInput,
  ): Promise<BriefDto> {
    return this.briefs.acceptSuggestion(studioId, actorOf(auth), orderId, suggestionId, body);
  }

  @Post('suggestions/:suggestionId/reject')
  @HttpCode(200)
  rejectSuggestion(
    @StudioId() studioId: string,
    @Auth() auth: AuthContext,
    @Param('orderId', new IdPipe('Order')) orderId: string,
    @Param('suggestionId', new IdPipe('Suggestion')) suggestionId: string,
  ): Promise<BriefDto> {
    return this.briefs.rejectSuggestion(studioId, actorOf(auth), orderId, suggestionId);
  }
}
