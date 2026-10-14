export function pgBinaries(): Promise<{ pg_ctl: string; initdb: string; postgres: string }>;
export function pgIsRunning(dataDir: string): Promise<boolean>;
export function pgStart(options: { dataDir: string; port: number; logFile: string }): Promise<void>;
export function pgStop(dataDir: string): Promise<void>;
