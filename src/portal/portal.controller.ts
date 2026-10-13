import { Body, Controller, Get, HttpCode, Param, Post, Req, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import { z } from 'zod';
import { Public } from '../auth/decorators.js';
import { ZodPipe } from '../common/validation/zod.pipe.js';
import { IdPipe } from '../common/validation/id.pipe.js';
import { AppConfig } from '../config/app-config.js';
import {
  PortalChangeRequestInput,
  PortalDecisionInput,
  type PortalReviewDto,
  type PortalSessionDto,
} from '../contracts/approvals.js';
import { PortalService } from './portal.service.js';
import { PortalSessionGuard, type PortalRequest } from './portal.guard.js';
import { setPortalCookie } from './portal-session.js';
import { sendStoredFile } from '../sources/send-file.js';

const ExchangeBody = z.object({ token: z.string().min(20).max(200) });

/**
 * Customer review portal. No account: possession of the link is the authentication mechanism,
 * exchanged once for a short-lived session cookie scoped to this access.
 */
@Public()
@Controller('portal/:accessId')
export class PortalController {
  constructor(
    private readonly portal: PortalService,
    private readonly config: AppConfig,
  ) {}

  @Post('session')
  @HttpCode(200)
  async exchange(
    @Param('accessId', new IdPipe('Link')) accessId: string,
    @Body(new ZodPipe(ExchangeBody)) body: z.infer<typeof ExchangeBody>,
    @Req() req: PortalRequest,
    @Res({ passthrough: true }) res: Response,
  ): Promise<PortalSessionDto> {
    const { cookieValue, expiresAt } = await this.portal.exchange(accessId, body.token, req.ip ?? 'unknown');
    setPortalCookie(res, cookieValue, accessId, this.config.env.COOKIE_SECURE, expiresAt);
    return { accessId, expiresAt: expiresAt.toISOString() };
  }

  @UseGuards(PortalSessionGuard)
  @Get('review')
  review(@Param('accessId', new IdPipe('Link')) accessId: string): Promise<PortalReviewDto> {
    return this.portal.review(accessId);
  }

  @UseGuards(PortalSessionGuard)
  @Get('media/:sourceId')
  async media(
    @Param('accessId', new IdPipe('Link')) accessId: string,
    @Param('sourceId', new IdPipe('Image')) sourceId: string,
    @Res() res: Response,
  ) {
    sendStoredFile(res, await this.portal.media(accessId, sourceId));
  }

  @UseGuards(PortalSessionGuard)
  @Post('decision')
  @HttpCode(200)
  decide(
    @Param('accessId', new IdPipe('Link')) accessId: string,
    @Body(new ZodPipe(PortalDecisionInput)) body: PortalDecisionInput,
    @Req() req: PortalRequest,
  ): Promise<PortalReviewDto> {
    return this.portal.decide(accessId, body, { userAgent: req.header('user-agent') });
  }

  @UseGuards(PortalSessionGuard)
  @Post('change-requests')
  @HttpCode(200)
  requestChange(
    @Param('accessId', new IdPipe('Link')) accessId: string,
    @Body(new ZodPipe(PortalChangeRequestInput)) body: PortalChangeRequestInput,
  ): Promise<PortalReviewDto> {
    return this.portal.requestChange(accessId, body);
  }
}
