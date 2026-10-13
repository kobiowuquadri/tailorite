import { Global, Module, type DynamicModule } from '@nestjs/common';
import { AppConfig } from './app-config.js';

@Global()
@Module({})
export class ConfigModule {
  /** Provides AppConfig. Tests pass a prebuilt config; entrypoints parse process.env. */
  static forRoot(config?: AppConfig): DynamicModule {
    return {
      module: ConfigModule,
      providers: [{ provide: AppConfig, useFactory: () => config ?? AppConfig.fromProcessEnv() }],
      exports: [AppConfig],
    };
  }
}
