import { Controller, HttpCode, Post, Req, Res } from '@nestjs/common';
import type { Response } from 'express';
import { Public } from '../auth/decorators.js';
import { SessionService } from '../auth/session.service.js';
import type { AppRequest } from '../common/http/request-context.js';
import type { DemoSessionDto } from '../contracts/timeline.js';
import { DemoService } from './demo.service.js';

@Controller('demo')
export class DemoController {
  constructor(
    private readonly demo: DemoService,
    private readonly sessions: SessionService,
  ) {}

  /** Creates an isolated, temporary demo studio with synthetic data and signs the visitor into it. */
  @Public()
  @Post('sessions')
  @HttpCode(201)
  async start(@Req() req: AppRequest, @Res({ passthrough: true }) res: Response): Promise<DemoSessionDto> {
    const { token, expiresAt, redirectTo } = await this.demo.createSandbox({
      ip: req.ip ?? 'unknown',
      userAgent: req.header('user-agent'),
    });
    this.sessions.setCookie(res, token, expiresAt);
    return { redirectTo };
  }
}
