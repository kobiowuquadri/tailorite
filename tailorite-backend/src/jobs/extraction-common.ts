import type { Prisma } from '../generated/prisma/client.js';
import type { Tx } from '../common/prisma/prisma.service.js';
import { contentHash } from '../common/canonical-json.js';
import { RETRYABLE_CODES, type AiErrorCode } from '../ai/provider.js';
import type { ExtractionJobDto } from '../contracts/extraction.js';

export type InputSource = {
  sourceId: string;
  kind: 'TEXT' | 'IMAGE' | 'AUDIO';
  sha256: string;
  /** Transcript the job should use (latest at job creation); null means "transcribe first". */
  transcriptId: string | null;
};

/** The fixed input set a job processes: current sources and their current transcripts. */
export async function currentInputSet(db: Tx, orderId: string): Promise<{ sources: InputSource[]; hash: string; bytes: number }> {
  const rows = await db.sourceAsset.findMany({
    where: { orderId, removedAt: null },
    orderBy: [{ addedAt: 'asc' }, { id: 'asc' }],
    include: { transcripts: { orderBy: { createdAt: 'desc' }, take: 1, select: { id: true } } },
  });
  const sources = rows.map((s) => ({
    sourceId: s.id,
    kind: s.kind,
    sha256: s.sha256,
    transcriptId: s.kind === 'AUDIO' ? (s.transcripts[0]?.id ?? null) : null,
  }));
  return {
    sources,
    hash: contentHash(sources),
    bytes: rows.reduce((sum, s) => sum + (s.byteSize ?? 0), 0),
  };
}

/**
 * The input set a job actually processed. Audio sources that had no transcript when the job was
 * created use the transcript this job produced, so a job's own transcription never makes its
 * result look out of date.
 */
export async function processedInputSet(db: Tx, jobId: string, inputs: InputSource[]): Promise<{ sources: InputSource[]; hash: string }> {
  const untranscribed = inputs.filter((i) => i.kind === 'AUDIO' && !i.transcriptId).map((i) => i.sourceId);
  const produced = untranscribed.length
    ? await db.transcript.findMany({
        where: { jobId, sourceId: { in: untranscribed } },
        orderBy: { createdAt: 'desc' },
        select: { id: true, sourceId: true },
      })
    : [];
  const bySource = new Map<string, string>();
  for (const t of produced) if (!bySource.has(t.sourceId)) bySource.set(t.sourceId, t.id);
  const sources = inputs.map((i) =>
    i.kind === 'AUDIO' && !i.transcriptId ? { ...i, transcriptId: bySource.get(i.sourceId) ?? null } : i,
  );
  return { sources, hash: contentHash(sources) };
}

export const jobInclude = {
  result: { include: { _count: { select: { suggestions: true, issues: true } } } },
} satisfies Prisma.ExtractionJobInclude;

type JobRow = Prisma.ExtractionJobGetPayload<{ include: typeof jobInclude }>;

export type ResultValidation = {
  evidenceRejected: number;
  downgraded: number;
  dropped: number;
  warnings: string[];
  stale: boolean;
  staleReason: string | null;
};

export function toJobDto(job: JobRow): ExtractionJobDto {
  const validation = (job.result?.validation as ResultValidation | undefined) ?? null;
  return {
    id: job.id,
    status: job.status,
    mode: job.mode,
    attempts: job.attempts,
    maxAttempts: job.maxAttempts,
    sourceCount: (job.inputSources as InputSource[]).length,
    errorCode: job.errorCode,
    errorMessage: job.errorMessage,
    retryable: job.status === 'FAILED' && RETRYABLE_CODES.has(job.errorCode as AiErrorCode),
    createdAt: job.createdAt.toISOString(),
    startedAt: job.startedAt?.toISOString() ?? null,
    finishedAt: job.finishedAt?.toISOString() ?? null,
    durationMs: job.durationMs,
    provider: job.provider,
    model: job.model,
    result: job.result
      ? {
          id: job.result.id,
          suggestionCount: job.result._count.suggestions,
          issueCount: job.result._count.issues,
          warnings: validation?.warnings ?? [],
          stale: validation?.stale ?? false,
          staleReason: validation?.staleReason ?? null,
          isExample: job.mode === 'FIXTURE',
          evidenceRejected: validation?.evidenceRejected ?? 0,
        }
      : null,
  };
}

/** Exponential backoff for temporary failures: 20 s, 80 s, 5 min … (bounded). */
export function backoffMs(attempt: number, baseMs = 20_000): number {
  return Math.min(baseMs * 4 ** Math.max(0, attempt - 1), 10 * 60_000);
}
