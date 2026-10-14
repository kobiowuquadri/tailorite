import { Global, Module } from '@nestjs/common';
import { AiProviderFactory } from './ai-provider.factory.js';

@Global()
@Module({
  providers: [AiProviderFactory],
  exports: [AiProviderFactory],
})
export class AiModule {}
