import { Injectable } from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service.js';
import { StorageService } from '../storage/storage.service.js';
import { AuditService } from '../audit/audit.service.js';
import { AgreementStateService } from '../briefs/agreement-state.service.js';
import { AiProviderFactory } from '../ai/ai-provider.factory.js';
import { AiProviderError, type AiProvider, type AiUsage, type ExtractSource } from '../ai/provider.js';
import { AiExtraction } from '../ai/schema.js';
import { segmentSpans, type EvidenceSource } from '../ai/evidence.js';
import { normalizeExtraction, type NormalizedResult } from '../ai/normalize.js';
import { PROVIDER_MIME_BY_STORED } from '../sources/media.js';
import { QueueService } from './queue.service.js';
import { AppConfig } from '../config/app-config.js';
import { backoffMs, currentInputSet, ownJobs, processedInputSet, type InputSource, type ResultValidation } from './extraction-common.js';
import { BriefContent } from '../contracts/brief.js';
import type { TranscriptSegment } from '../contracts/sources.js';
import type { Prisma } from '../generated/prisma/client.js';
import { lockOrder } from '../orders/order-lock.js';
import { logger } from '../common/logging/json-logger.js';

const LEASE_MS = 10 * 60_000;
const JOB_TIMEOUT_MS = 8 * 60_000;

type JobRow = Prisma.ExtractionJobGetPayload<{ include: { order: { include: { studio: true } } } }>;

type Outcome = {
  normalized: NormalizedResult;
  usage: AiUsage;
  model: string;
};

function addUsage(a: AiUsage, b: AiUsage): AiUsage {
  const sum = (x: number | null, y: number | null) => (x === null && y === null ? null : (x ?? 0) + (y ?? 0));
  return { inputTokens: sum(a.inputTokens, b.inputTokens), outputTokens: sum(a.outputTokens, b.outputTokens) };
}

/**
 * Runs one durable extraction job. Claiming is a status-conditioned update with a lease, so a
 * duplicate delivery (BullMQ redelivery, recovery sweep) is a no-op. Results never change the
 * draft: they become suggestions and questions the tailor reviews.
 */
@Injectable()
export class ExtractionProcessor {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly audit: AuditService,
    private readonly agreementState: AgreementStateService,
    private readonly providers: AiProviderFactory,
    private readonly queue: QueueService,
    private readonly config: AppConfig,
  ) {}

  async process(jobId: string): Promise<'processed' | 'skipped'> {
    const now = new Date();
    const claimed = await this.prisma.extractionJob.updateMany({
      where: { id: jobId, status: 'QUEUED', nextAttemptAt: { lte: new Date(now.getTime() + 1000) }, AND: [ownJobs(this.config.deploymentId)] },
      data: {
        status: 'RUNNING',
        attempts: { increment: 1 },
        startedAt: now,
        leaseExpiresAt: new Date(now.getTime() + LEASE_MS),
      },
    });
    if (claimed.count === 0) return 'skipped';

    const job = await this.prisma.extractionJob.findUniqueOrThrow({
      where: { id: jobId },
      include: { order: { include: { studio: true } } },
    });
    const sourceIds = (job.inputSources as InputSource[]).map((s) => s.sourceId);
    await this.prisma.sourceAsset.updateMany({ where: { id: { in: sourceIds } }, data: { processingState: 'PROCESSING' } });

    const started = performance.now();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), JOB_TIMEOUT_MS);
    let provider: AiProvider | null = null;
    try {
      provider = this.providers.get(job.mode);
      const outcome = await this.run(job, provider, controller.signal);
      const durationMs = Math.round(performance.now() - started);
      await this.persistSuccess(job, provider, outcome, durationMs);
      logger().event('info', 'extraction_succeeded', {
        jobId,
        orderId: job.orderId,
        studioId: job.studioId,
        mode: job.mode,
        provider: provider.name,
        model: outcome.model,
        attempt: job.attempts,
        durationMs,
        inputTokens: outcome.usage.inputTokens,
        outputTokens: outcome.usage.outputTokens,
        suggestions: outcome.normalized.suggestions.length,
        issues: outcome.normalized.issues.length,
        evidenceRejected: outcome.normalized.stats.evidenceRejected,
      });
    } catch (error) {
      await this.handleFailure(job, provider, error, Math.round(performance.now() - started));
    } finally {
      clearTimeout(timer);
    }
    return 'processed';
  }

  private async readFile(key: string | null): Promise<Buffer> {
    if (!key) throw new AiProviderError('STORAGE', 'A source file is missing.', false);
    try {
      return await this.storage.getBuffer(key);
    } catch {
      throw new AiProviderError('STORAGE', 'A source file could not be read from storage.', true);
    }
  }

  private async run(job: JobRow, provider: AiProvider, signal: AbortSignal): Promise<Outcome> {
    const inputs = job.inputSources as InputSource[];
    const rows = await this.prisma.sourceAsset.findMany({ where: { id: { in: inputs.map((i) => i.sourceId) }, orderId: job.orderId } });
    const byId = new Map(rows.map((r) => [r.id, r]));
    let usage: AiUsage = { inputTokens: null, outputTokens: null };
    let model = '';

    const extractSources: ExtractSource[] = [];
    const evidenceSources = new Map<string, EvidenceSource>();
    let n = 0;
    for (const input of inputs) {
      const source = byId.get(input.sourceId);
      if (!source || source.contentDeletedAt) continue;
      const ref = `S${++n}`;
      const meta = { ref, label: source.label, sender: source.sender, context: source.context, sha256: source.sha256 };
      if (source.kind === 'TEXT') {
        const text = source.textContent ?? '';
        extractSources.push({ ...meta, kind: 'TEXT', text });
        evidenceSources.set(ref, { ref, sourceId: source.id, kind: 'TEXT', text, transcriptId: null, segmentSpans: null });
      } else if (source.kind === 'IMAGE') {
        const image = await this.readFile(source.previewKey ?? source.storageKey);
        extractSources.push({ ...meta, kind: 'IMAGE', image, mimeType: source.previewKey ? 'image/webp' : (source.mimeType ?? 'image/jpeg') });
        evidenceSources.set(ref, { ref, sourceId: source.id, kind: 'IMAGE', text: null, transcriptId: null, segmentSpans: null });
      } else {
        // Use the transcript chosen when the job was created (a human correction wins), a transcript an
        // earlier attempt of this job already produced, or transcribe now.
        let transcript = input.transcriptId
          ? await this.prisma.transcript.findUnique({ where: { id: input.transcriptId } })
          : await this.prisma.transcript.findFirst({ where: { sourceId: source.id, jobId: job.id } });
        if (!transcript) {
          const audio = await this.readFile(source.storageKey);
          const mimeType = PROVIDER_MIME_BY_STORED[source.mimeType ?? ''] ?? source.mimeType ?? 'audio/mpeg';
          const result = await provider.transcribeAudio({ audio, mimeType, durationMs: source.durationMs, label: source.label }, signal);
          usage = addUsage(usage, result.usage);
          transcript = await this.prisma.transcript.create({
            data: {
              studioId: job.studioId,
              sourceId: source.id,
              origin: provider.mode === 'FIXTURE' ? 'FIXTURE' : 'MACHINE',
              text: result.text,
              segments: (result.segments ?? undefined) as Prisma.InputJsonValue | undefined,
              language: result.language,
              provider: provider.name,
              model: result.model,
              jobId: job.id,
            },
          });
        }
        extractSources.push({ ...meta, kind: 'AUDIO', transcript: transcript.text, transcriptOrigin: transcript.origin });
        evidenceSources.set(ref, {
          ref,
          sourceId: source.id,
          kind: 'AUDIO',
          text: transcript.text,
          transcriptId: transcript.id,
          segmentSpans: segmentSpans((transcript.segments as TranscriptSegment[] | null) ?? null),
        });
      }
    }
    if (extractSources.length === 0) throw new AiProviderError('INVALID_REQUEST', 'None of the selected sources are available any more.', false);

    const output = await provider.extractBrief(
      { orderTitle: job.order.title, garmentType: job.order.garmentType, sources: extractSources },
      signal,
    );
    usage = addUsage(usage, output.usage);
    model = output.model;
    const parsed = AiExtraction.safeParse(output.raw);
    if (!parsed.success) {
      throw new AiProviderError('INVALID_RESPONSE', 'The AI response did not match the expected structure.', true);
    }
    const draft = await this.prisma.briefDraft.findUniqueOrThrow({ where: { orderId: job.orderId } });
    const normalized = normalizeExtraction(parsed.data, evidenceSources, BriefContent.parse(draft.content));
    return { normalized, usage, model };
  }

  private async persistSuccess(job: JobRow, provider: AiProvider, outcome: Outcome, durationMs: number) {
    await this.prisma.$transaction(
      async (tx) => {
        const existing = await tx.extractionResult.findUnique({ where: { jobId: job.id } });
        const processed = await processedInputSet(tx, job.id, job.inputSources as InputSource[]);
        if (!existing) {
          await lockOrder(tx, job.studioId, job.orderId);
          const now = new Date();
          const draft = await tx.briefDraft.findUniqueOrThrow({ where: { orderId: job.orderId } });
          const input = await currentInputSet(tx, job.orderId);
          const staleReason =
            draft.revision !== job.draftRevision
              ? 'The brief was edited while this was processing. Check each suggestion against the current values before accepting.'
              : input.hash !== processed.hash
                ? 'Sources were added or changed while this was processing. Process again to include them.'
                : null;
          const { normalized } = outcome;
          const validation: ResultValidation = {
            evidenceRejected: normalized.stats.evidenceRejected,
            downgraded: normalized.stats.downgraded,
            dropped: normalized.stats.dropped,
            warnings: normalized.warnings,
            stale: staleReason !== null,
            staleReason,
          };

          // Only the newest run's suggestions and AI questions stay open.
          await tx.briefSuggestion.updateMany({ where: { orderId: job.orderId, status: 'PENDING' }, data: { status: 'SUPERSEDED' } });
          await tx.clarificationIssue.updateMany({
            where: { orderId: job.orderId, status: 'OPEN', origin: 'AI' },
            data: { status: 'DISMISSED', resolutionNote: 'Replaced by a newer AI run', resolvedAt: now },
          });

          const result = await tx.extractionResult.create({
            data: {
              studioId: job.studioId,
              orderId: job.orderId,
              jobId: job.id,
              schemaVersion: '1',
              mode: job.mode,
              payload: normalized as unknown as Prisma.InputJsonValue,
              validation: validation as unknown as Prisma.InputJsonValue,
              provider: provider.name,
              model: outcome.model,
              promptVersion: provider.promptVersion,
              durationMs,
              inputTokens: outcome.usage.inputTokens,
              outputTokens: outcome.usage.outputTokens,
              draftRevisionAtStart: job.draftRevision,
              inputHash: processed.hash,
            },
          });
          if (normalized.suggestions.length) {
            await tx.briefSuggestion.createMany({
              data: normalized.suggestions.map((s) => ({
                studioId: job.studioId,
                orderId: job.orderId,
                resultId: result.id,
                fieldKey: s.fieldKey,
                proposedValue: s.proposedValue,
                unit: s.unit,
                basis: s.basis,
                evidence: s.evidence as unknown as Prisma.InputJsonValue,
                needsHumanReview: s.needsHumanReview,
              })),
            });
          }
          for (const issue of normalized.issues) {
            await tx.clarificationIssue.create({
              data: {
                studioId: job.studioId,
                orderId: job.orderId,
                kind: issue.kind,
                origin: 'AI',
                fieldKey: issue.fieldKey,
                question: issue.question,
                candidates: issue.kind === 'CONFLICT' ? (issue.candidates as unknown as Prisma.InputJsonValue) : undefined,
                resultId: result.id,
              },
            });
          }
          await tx.sourceAsset.updateMany({
            where: { id: { in: (job.inputSources as InputSource[]).map((s) => s.sourceId) } },
            data: { processingState: 'PROCESSED', processingError: null },
          });
          await this.audit.record(tx, {
            studioId: job.studioId,
            orderId: job.orderId,
            actor: { type: 'SYSTEM', label: job.mode === 'FIXTURE' ? 'Demo fixture' : 'AI processing' },
            type: 'EXTRACTION_SUCCEEDED',
            summary: `${job.mode === 'FIXTURE' ? 'Example results' : 'AI suggestions'} ready: ${normalized.suggestions.length} suggestion${normalized.suggestions.length === 1 ? '' : 's'}, ${normalized.issues.length} question${normalized.issues.length === 1 ? '' : 's'}${staleReason ? ' (inputs changed during processing)' : ''}`,
            data: { jobId: job.id, model: outcome.model },
          });
          await this.agreementState.refresh(tx, job.studioId, job.orderId);
        }
        await tx.extractionJob.update({
          where: { id: job.id },
          data: {
            status: 'SUCCEEDED',
            // Record what was actually processed, including transcripts this job produced.
            inputHash: processed.hash,
            inputSources: processed.sources,
            finishedAt: new Date(),
            durationMs,
            provider: provider.name,
            model: outcome.model,
            promptVersion: provider.promptVersion,
            leaseExpiresAt: null,
            errorCode: null,
            errorMessage: null,
          },
        });
      },
      { timeout: 30_000 },
    );
  }

  private async handleFailure(job: JobRow, provider: AiProvider | null, error: unknown, durationMs: number) {
    const err =
      error instanceof AiProviderError
        ? error
        : (error as Error)?.message?.includes('GEMINI_API_KEY')
          ? new AiProviderError('NOT_CONFIGURED', 'AI extraction is not configured.', false)
          : new AiProviderError('INTERNAL', 'Processing failed unexpectedly.', false);
    const fresh = await this.prisma.extractionJob.findUniqueOrThrow({ where: { id: job.id } });
    const sourceIds = (job.inputSources as InputSource[]).map((s) => s.sourceId);
    const retry = err.retryable && fresh.attempts < fresh.maxAttempts;
    logger().event(retry ? 'warn' : 'error', 'extraction_failed', {
      jobId: job.id,
      orderId: job.orderId,
      studioId: job.studioId,
      provider: provider?.name,
      attempt: fresh.attempts,
      durationMs,
      errorCode: err.code,
      willRetry: retry,
      ...(err.code === 'INTERNAL' ? { error: (error as Error)?.message } : {}),
    });

    if (retry) {
      const delay = backoffMs(fresh.attempts, this.config.env.EXTRACTION_RETRY_BASE_MS);
      await this.prisma.$transaction([
        this.prisma.extractionJob.update({
          where: { id: job.id },
          data: {
            status: 'QUEUED',
            nextAttemptAt: new Date(Date.now() + delay),
            leaseExpiresAt: null,
            dispatchedAt: null,
            errorCode: err.code,
            errorMessage: `${err.message} Retrying automatically.`,
          },
        }),
        this.prisma.sourceAsset.updateMany({ where: { id: { in: sourceIds } }, data: { processingState: 'QUEUED' } }),
      ]);
      if (await this.queue.dispatchExtraction(job.id, fresh.attempts + 1, delay)) {
        await this.prisma.extractionJob.updateMany({ where: { id: job.id, status: 'QUEUED' }, data: { dispatchedAt: new Date() } });
      }
      return;
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.extractionJob.update({
        where: { id: job.id },
        data: {
          status: 'FAILED',
          finishedAt: new Date(),
          durationMs,
          leaseExpiresAt: null,
          errorCode: err.code,
          errorMessage: err.message,
          provider: provider?.name ?? null,
        },
      });
      await tx.sourceAsset.updateMany({
        where: { id: { in: sourceIds } },
        data: { processingState: 'FAILED', processingError: err.message },
      });
      await this.audit.record(tx, {
        studioId: job.studioId,
        orderId: job.orderId,
        actor: { type: 'SYSTEM', label: 'AI processing' },
        type: 'EXTRACTION_FAILED',
        summary: `AI processing failed: ${err.message} The brief was not changed.`,
        data: { jobId: job.id, errorCode: err.code },
      });
    });
  }
}
