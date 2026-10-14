import { Body, Controller, Get, Patch, Post } from '@nestjs/common';
import { StudiosService } from './studios.service.js';
import { actorOf, AllowWithoutStudio, Auth, StudioId } from '../auth/decorators.js';
import { ZodPipe } from '../common/validation/zod.pipe.js';
import {
  OnboardingInput,
  UpdateStudioInput,
  type AiStatusDto,
  type StudioDto,
  type UsageDto,
} from '../contracts/studio.js';
import type { AuthContext } from '../common/http/request-context.js';

@Controller()
export class StudiosController {
  constructor(private readonly studios: StudiosService) {}

  /** Onboarding: creates the studio and the owner's membership. */
  @AllowWithoutStudio()
  @Post('studios')
  create(@Auth() auth: AuthContext, @Body(new ZodPipe(OnboardingInput)) body: OnboardingInput): Promise<StudioDto> {
    return this.studios.createForUser(auth.userId, auth.userName, body);
  }

  @Get('studio')
  get(@StudioId() studioId: string): Promise<StudioDto> {
    return this.studios.get(studioId);
  }

  @Patch('studio')
  update(
    @StudioId() studioId: string,
    @Auth() auth: AuthContext,
    @Body(new ZodPipe(UpdateStudioInput)) body: UpdateStudioInput,
  ): Promise<StudioDto> {
    return this.studios.update(studioId, actorOf(auth), body);
  }

  @Get('studio/usage')
  usage(@StudioId() studioId: string): Promise<UsageDto> {
    return this.studios.usage(studioId);
  }

  @Get('ai/status')
  aiStatus(@StudioId() studioId: string): Promise<AiStatusDto> {
    return this.studios.aiStatus(studioId);
  }
}
