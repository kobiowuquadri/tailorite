import { Module } from '@nestjs/common';
import { AgreementStateService } from './agreement-state.service.js';

/** Shared agreement-state logic used by orders, briefs, approvals, changes and the worker. */
@Module({
  providers: [AgreementStateService],
  exports: [AgreementStateService],
})
export class BriefsCoreModule {}
