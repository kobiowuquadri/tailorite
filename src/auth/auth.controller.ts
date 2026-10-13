import { Body, Controller, Get, HttpCode, Post, Req, Res } from '@nestjs/common';
import type { Response } from 'express';
import { AuthService } from './auth.service.js';
import { SessionService } from './session.service.js';
import { AllowWithoutStudio, Auth, Public } from './decorators.js';
import { ZodPipe } from '../common/validation/zod.pipe.js';
import { LoginInput, RegisterInput, type SessionDto } from '../contracts/auth.js';
import type { AppRequest, AuthContext } from '../common/http/request-context.js';
import type { Ok } from '../contracts/common.js';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly sessions: SessionService,
  ) {}

  @Public()
  @Post('register')
  async register(
    @Body(new ZodPipe(RegisterInput)) body: RegisterInput,
    @Req() req: AppRequest,
    @Res({ passthrough: true }) res: Response,
  ): Promise<SessionDto> {
    const { token, expiresAt } = await this.auth.register(body, { ip: req.ip ?? 'unknown', userAgent: req.header('user-agent') });
    this.sessions.setCookie(res, token, expiresAt);
    const resolved = await this.sessions.resolve(token);
    return this.auth.sessionInfo(resolved!);
  }

  @Public()
  @Post('login')
  @HttpCode(200)
  async login(
    @Body(new ZodPipe(LoginInput)) body: LoginInput,
    @Req() req: AppRequest,
    @Res({ passthrough: true }) res: Response,
  ): Promise<SessionDto> {
    const { token, expiresAt } = await this.auth.login(body, { ip: req.ip ?? 'unknown', userAgent: req.header('user-agent') });
    this.sessions.setCookie(res, token, expiresAt);
    const resolved = await this.sessions.resolve(token);
    return this.auth.sessionInfo(resolved!);
  }

  @Public()
  @Post('logout')
  @HttpCode(200)
  async logout(@Req() req: AppRequest, @Res({ passthrough: true }) res: Response): Promise<Ok> {
    if (req.auth) await this.sessions.revoke(req.auth.sessionId);
    this.sessions.clearCookie(res);
    return { ok: true };
  }

  @AllowWithoutStudio()
  @Get('session')
  session(@Auth() auth: AuthContext): Promise<SessionDto> {
    return this.auth.sessionInfo(auth);
  }
}
