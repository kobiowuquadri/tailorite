import { Body, Controller, Get, HttpCode, Param, Post } from '@nestjs/common';
import { actorOf, Auth, StudioId } from '../auth/decorators.js';
import { ZodPipe } from '../common/validation/zod.pipe.js';
import { IdPipe } from '../common/validation/id.pipe.js';
import {
  CreateLinkInput,
  PublishInput,
  type PortalAccessDto,
  type PublishResultDto,
  type ShareLinkDto,
  type VersionComparisonDto,
  type VersionDetailDto,
} from '../contracts/approvals.js';
import { IssueChangeLinkInput } from '../contracts/changes.js';
import type { VersionSummaryDto } from '../contracts/orders.js';
import type { AuthContext } from '../common/http/request-context.js';
import { PublicationService } from './publication.service.js';
import { LinksService } from './links.service.js';
import { VersionsService } from './versions.service.js';

@Controller('orders/:orderId')
export class ApprovalsController {
  constructor(
    private readonly publication: PublicationService,
    private readonly links: LinksService,
    private readonly versions: VersionsService,
  ) {}

  /** Publishes the working brief as an immutable version awaiting customer approval. */
  @Post('versions')
  publish(
    @StudioId() studioId: string,
    @Auth() auth: AuthContext,
    @Param('orderId', new IdPipe('Order')) orderId: string,
    @Body(new ZodPipe(PublishInput)) body: PublishInput,
  ): Promise<PublishResultDto> {
    return this.publication.publish(studioId, actorOf(auth), orderId, body);
  }

  @Get('versions')
  listVersions(@StudioId() studioId: string, @Param('orderId', new IdPipe('Order')) orderId: string): Promise<VersionSummaryDto[]> {
    return this.versions.list(studioId, orderId);
  }

  @Get('versions/:versionId')
  version(
    @StudioId() studioId: string,
    @Param('orderId', new IdPipe('Order')) orderId: string,
    @Param('versionId', new IdPipe('Version')) versionId: string,
  ): Promise<VersionDetailDto> {
    return this.versions.detail(studioId, orderId, versionId);
  }

  @Get('compare')
  compare(@StudioId() studioId: string, @Param('orderId', new IdPipe('Order')) orderId: string): Promise<VersionComparisonDto> {
    return this.versions.compareDraft(studioId, orderId);
  }

  @Get('links')
  listLinks(@StudioId() studioId: string, @Param('orderId', new IdPipe('Order')) orderId: string): Promise<PortalAccessDto[]> {
    return this.links.list(studioId, orderId);
  }

  @Post('links/approval')
  regenerate(
    @StudioId() studioId: string,
    @Auth() auth: AuthContext,
    @Param('orderId', new IdPipe('Order')) orderId: string,
    @Body(new ZodPipe(CreateLinkInput)) body: CreateLinkInput,
  ): Promise<ShareLinkDto> {
    return this.links.regenerateApprovalLink(studioId, actorOf(auth), orderId, body);
  }

  @Post('links/change')
  issueChangeLink(
    @StudioId() studioId: string,
    @Auth() auth: AuthContext,
    @Param('orderId', new IdPipe('Order')) orderId: string,
    @Body(new ZodPipe(IssueChangeLinkInput)) body: IssueChangeLinkInput,
  ): Promise<ShareLinkDto> {
    return this.links.issueChangeLink(studioId, actorOf(auth), orderId, body);
  }

  @Post('links/:accessId/revoke')
  @HttpCode(200)
  revoke(
    @StudioId() studioId: string,
    @Auth() auth: AuthContext,
    @Param('orderId', new IdPipe('Order')) orderId: string,
    @Param('accessId', new IdPipe('Link')) accessId: string,
  ): Promise<PortalAccessDto[]> {
    return this.links.revoke(studioId, actorOf(auth), orderId, accessId);
  }
}
