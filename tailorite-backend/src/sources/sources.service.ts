import { Injectable } from '@nestjs/common';
import { createHash, randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { PrismaService } from '../common/prisma/prisma.service.js';
import { AppConfig } from '../config/app-config.js';
import { Errors } from '../common/errors/app-error.js';
import { AuditService } from '../audit/audit.service.js';
import { StorageService, sourceObjectKey, parseRangeHeader, type StoredObject } from '../storage/storage.service.js';
import { RATE_LIMITS, RateLimitService } from '../common/security/rate-limit.service.js';
import type { Actor, UserActor } from '../auth/decorators.js';
import type { Prisma, SourceKind } from '../generated/prisma/client.js';
import {
  ACCEPTED_AUDIO_TYPES,
  ACCEPTED_IMAGE_TYPES,
  AUDIO_FORMAT_HELP,
  type AddTextSourceInput,
  type FileSourceFields,
  type SourceDto,
  type SourcesDto,
  type TranscriptCorrectionInput,
  type TranscriptDto,
  type TranscriptSegment,
  type UpdateSourceInput,
  type UploadPolicyDto,
} from '../contracts/sources.js';
import { lockOrder } from '../orders/order-lock.js';
import { MediaRejected, probeAudio, processImage, sanitizeFileName, sniffMedia } from './media.js';
import { logger } from '../common/logging/json-logger.js';
import { DEMO_AUDIO_FILE, DEMO_IMAGE_FILE, demoAssetHashes } from '../demo/demo-content.js';

export const sourceInclude = {
  transcripts: { orderBy: { createdAt: 'desc' }, take: 1 },
  _count: { select: { transcripts: true, versionSources: true } },
} satisfies Prisma.SourceAssetInclude;

type SourceRow = Prisma.SourceAssetGetPayload<{ include: typeof sourceInclude }>;

function toTranscriptDto(t: SourceRow['transcripts'][number]): TranscriptDto {
  return {
    id: t.id,
    origin: t.origin,
    text: t.text,
    segments: (t.segments as TranscriptSegment[] | null) ?? null,
    provider: t.provider,
    model: t.model,
    createdAt: t.createdAt.toISOString(),
    correctsId: t.correctsId,
  };
}

export function toSourceDto(s: SourceRow): SourceDto {
  const base = `/api/orders/${s.orderId}/sources/${s.id}`;
  const hasFile = Boolean(s.storageKey) && !s.contentDeletedAt;
  return {
    id: s.id,
    kind: s.kind,
    origin: s.origin,
    label: s.label,
    sender: s.sender,
    context: s.context,
    addedAt: s.addedAt.toISOString(),
    processingState: s.processingState,
    processingError: s.processingError,
    mimeType: s.mimeType,
    byteSize: s.byteSize,
    width: s.width,
    height: s.height,
    durationMs: s.durationMs,
    originalName: s.originalName,
    text: s.kind === 'TEXT' ? s.textContent : null,
    contentUrl: hasFile ? `${base}/content` : null,
    previewUrl: hasFile && s.previewKey ? `${base}/preview` : null,
    transcript: s.transcripts[0] ? toTranscriptDto(s.transcripts[0]) : null,
    transcriptVersions: s._count.transcripts,
    retainedByVersion: s._count.versionSources > 0,
    isSynthetic: s.isSynthetic,
  };
}

const KIND_LABEL: Record<SourceKind, string> = { TEXT: 'Message', IMAGE: 'Reference image', AUDIO: 'Voice note' };

@Injectable()
export class SourcesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly audit: AuditService,
    private readonly config: AppConfig,
    private readonly rateLimits: RateLimitService,
  ) {}

  private async requireOpenOrder(studioId: string, orderId: string) {
    const order = await this.prisma.order.findFirst({ where: { id: orderId, studioId } });
    if (!order) throw Errors.notFound('Order');
    if (order.productionStatus === 'CANCELLED') throw Errors.invalidState('This order is cancelled.');
    if (order.archivedAt) throw Errors.invalidState('This order is archived.');
    return order;
  }

  async policy(studioId: string, orderId: string): Promise<UploadPolicyDto> {
    const limits = this.config.uploadLimits;
    const agg = await this.prisma.sourceAsset.aggregate({
      where: { orderId, studioId, removedAt: null },
      _sum: { byteSize: true },
      _count: { _all: true },
    });
    return {
      imageMaxBytes: limits.imageBytes,
      audioMaxBytes: limits.audioBytes,
      audioMaxSeconds: limits.audioSeconds,
      recordingMaxSeconds: limits.recordingSeconds,
      orderMaxBytes: limits.orderTotalBytes,
      orderUsedBytes: agg._sum.byteSize ?? 0,
      maxSources: limits.sourcesPerOrder,
      sourceCount: agg._count._all,
      textMaxChars: limits.textChars,
      acceptedImageTypes: ACCEPTED_IMAGE_TYPES,
      acceptedAudioTypes: ACCEPTED_AUDIO_TYPES,
      audioFormatHelp: AUDIO_FORMAT_HELP,
    };
  }

  async list(studioId: string, orderId: string): Promise<SourcesDto> {
    const order = await this.prisma.order.findFirst({ where: { id: orderId, studioId }, select: { id: true } });
    if (!order) throw Errors.notFound('Order');
    const rows = await this.prisma.sourceAsset.findMany({
      where: { orderId, studioId, removedAt: null },
      include: sourceInclude,
      orderBy: [{ addedAt: 'asc' }, { id: 'asc' }],
    });
    return { sources: rows.map(toSourceDto), policy: await this.policy(studioId, orderId) };
  }

  async get(studioId: string, orderId: string, sourceId: string): Promise<SourceDto> {
    const row = await this.prisma.sourceAsset.findFirst({ where: { id: sourceId, orderId, studioId }, include: sourceInclude });
    if (!row) throw Errors.notFound('Source');
    return toSourceDto(row);
  }

  /** Enforces count/size limits under the order lock so concurrent uploads cannot exceed them. */
  private async assertCapacity(tx: Prisma.TransactionClient, orderId: string, addingBytes: number) {
    const limits = this.config.uploadLimits;
    const agg = await tx.sourceAsset.aggregate({
      where: { orderId, removedAt: null },
      _sum: { byteSize: true },
      _count: { _all: true },
    });
    if (agg._count._all >= limits.sourcesPerOrder) {
      throw Errors.limitReached(`An order can hold up to ${limits.sourcesPerOrder} sources.`);
    }
    if ((agg._sum.byteSize ?? 0) + addingBytes > limits.orderTotalBytes) {
      throw Errors.payloadTooLarge(
        `This order has reached its ${Math.round(limits.orderTotalBytes / 1024 / 1024)} MB storage limit.`,
      );
    }
  }

  private async nextLabel(tx: Prisma.TransactionClient, orderId: string, kind: SourceKind) {
    const count = await tx.sourceAsset.count({ where: { orderId, kind } });
    return `${KIND_LABEL[kind]} ${count + 1}`;
  }

  async addText(studioId: string, actor: UserActor, orderId: string, input: AddTextSourceInput) {
    await this.requireOpenOrder(studioId, orderId);
    if (input.text.length > this.config.uploadLimits.textChars) {
      throw Errors.validation('This message is too long.', { text: [`Use at most ${this.config.uploadLimits.textChars} characters`] });
    }
    const sha256 = createHash('sha256').update(input.text, 'utf8').digest('hex');
    return this.prisma.$transaction(async (tx) => {
      await lockOrder(tx, studioId, orderId);
      const existing = await tx.sourceAsset.findFirst({
        where: {
          orderId,
          OR: [
            ...(input.idempotencyKey ? [{ idempotencyKey: input.idempotencyKey }] : []),
            { sha256, kind: 'TEXT', removedAt: null },
          ],
        },
        include: sourceInclude,
      });
      if (existing) return { source: toSourceDto(existing), duplicate: true };
      const bytes = Buffer.byteLength(input.text, 'utf8');
      await this.assertCapacity(tx, orderId, bytes);
      const label = input.label ?? (await this.nextLabel(tx, orderId, 'TEXT'));
      const created = await tx.sourceAsset.create({
        data: {
          studioId,
          orderId,
          kind: 'TEXT',
          origin: 'PASTED',
          label,
          sender: input.sender,
          context: input.context,
          textContent: input.text,
          mimeType: 'text/plain',
          byteSize: bytes,
          sha256,
          idempotencyKey: input.idempotencyKey,
          addedById: actor.userId,
        },
        include: sourceInclude,
      });
      await this.audit.record(tx, {
        studioId,
        orderId,
        actor,
        type: 'SOURCE_ADDED',
        summary: `Added ${label}`,
        data: { sourceId: created.id, kind: 'TEXT' },
      });
      return { source: toSourceDto(created), duplicate: false };
    });
  }

  async addFile(
    studioId: string,
    actor: UserActor,
    orderId: string,
    file: { buffer: Buffer; originalname?: string; size: number } | undefined,
    fields: FileSourceFields,
  ) {
    await this.rateLimits.consume('upload:studio', studioId, RATE_LIMITS.uploadsPerStudio);
    await this.requireOpenOrder(studioId, orderId);
    if (!file || !file.buffer?.length) throw Errors.validation('Choose a file to upload.', { file: ['No file received'] });

    const limits = this.config.uploadLimits;
    const sniffed = sniffMedia(file.buffer);
    if (!sniffed) {
      throw Errors.unsupportedMedia(`This file type is not supported. Upload JPEG, PNG or WebP images, or ${AUDIO_FORMAT_HELP} audio.`);
    }
    const maxBytes = sniffed.kind === 'IMAGE' ? limits.imageBytes : limits.audioBytes;
    if (file.buffer.length > maxBytes) {
      throw Errors.payloadTooLarge(
        `${sniffed.kind === 'IMAGE' ? 'Images' : 'Audio files'} can be at most ${Math.round(maxBytes / 1024 / 1024)} MB.`,
      );
    }

    const sha256 = createHash('sha256').update(file.buffer).digest('hex');
    const duplicate = await this.prisma.sourceAsset.findFirst({
      where: {
        orderId,
        studioId,
        OR: [
          ...(fields.idempotencyKey ? [{ idempotencyKey: fields.idempotencyKey }] : []),
          { sha256, removedAt: null },
        ],
      },
      include: sourceInclude,
    });
    if (duplicate) return { source: toSourceDto(duplicate), duplicate: true };

    let width: number | null = null;
    let height: number | null = null;
    let durationMs: number | null = null;
    let preview: Buffer | null = null;
    try {
      if (sniffed.kind === 'IMAGE') {
        const img = await processImage(file.buffer);
        width = img.width;
        height = img.height;
        preview = img.preview;
      } else {
        durationMs = (await probeAudio(file.buffer, sniffed.mime)).durationMs;
        if (durationMs !== null && durationMs > limits.audioSeconds * 1000) {
          throw new MediaRejected(`Audio can be at most ${Math.round(limits.audioSeconds / 60)} minutes long.`);
        }
      }
    } catch (error) {
      if (error instanceof MediaRejected) throw Errors.unsupportedMedia(error.message);
      throw error;
    }

    const sourceId = randomUUID();
    const storageKey = sourceObjectKey(studioId, orderId, sourceId, 'original', sniffed.ext);
    const previewKey = preview ? sourceObjectKey(studioId, orderId, sourceId, 'preview', 'webp') : null;
    try {
      await this.storage.put(storageKey, file.buffer, sniffed.mime);
      if (preview && previewKey) await this.storage.put(previewKey, preview, 'image/webp');
    } catch (error) {
      // Hosted storage can refuse a file the app itself accepts (for example a free plan's size cap).
      if (/file size too large/i.test((error as Error).message)) {
        throw Errors.payloadTooLarge('This file is larger than the storage service allows. Try a shorter recording or a smaller picture.');
      }
      throw error;
    }

    try {
      return await this.prisma.$transaction(async (tx) => {
        await lockOrder(tx, studioId, orderId);
        await this.assertCapacity(tx, orderId, file.buffer.length);
        const label = fields.label ?? (await this.nextLabel(tx, orderId, sniffed.kind));
        const created = await tx.sourceAsset.create({
          data: {
            id: sourceId,
            studioId,
            orderId,
            kind: sniffed.kind,
            origin: fields.origin,
            label,
            sender: fields.sender,
            context: fields.context,
            storageKey,
            previewKey,
            mimeType: sniffed.mime,
            byteSize: file.buffer.length,
            sha256,
            originalName: sanitizeFileName(file.originalname),
            width,
            height,
            durationMs,
            idempotencyKey: fields.idempotencyKey,
            addedById: actor.userId,
          },
          include: sourceInclude,
        });
        await this.audit.record(tx, {
          studioId,
          orderId,
          actor,
          type: 'SOURCE_ADDED',
          summary: `Added ${label}${fields.origin === 'RECORDED' ? ' (recorded in the browser)' : ''}`,
          data: { sourceId, kind: sniffed.kind, bytes: file.buffer.length },
        });
        return { source: toSourceDto(created), duplicate: false };
      });
    } catch (error) {
      // Keep storage consistent with the database when the insert fails.
      await this.storage.delete(storageKey).catch(() => undefined);
      if (previewKey) await this.storage.delete(previewKey).catch(() => undefined);
      throw error;
    }
  }

  async update(studioId: string, actor: Actor, orderId: string, sourceId: string, input: UpdateSourceInput) {
    return this.prisma.$transaction(async (tx) => {
      const source = await tx.sourceAsset.findFirst({ where: { id: sourceId, orderId, studioId } });
      if (!source) throw Errors.notFound('Source');
      const updated = await tx.sourceAsset.update({
        where: { id: sourceId },
        data: {
          label: input.label ?? undefined,
          sender: input.sender !== undefined ? input.sender : undefined,
          context: input.context !== undefined ? input.context : undefined,
        },
        include: sourceInclude,
      });
      await this.audit.record(tx, {
        studioId,
        orderId,
        actor,
        type: 'SOURCE_UPDATED',
        summary: `Updated details of ${updated.label}`,
        data: { sourceId },
      });
      return toSourceDto(updated);
    });
  }

  /**
   * Removes a source from the working set. Files that no agreement version references are erased;
   * sources used by a published version are retained so that version stays complete.
   */
  async remove(studioId: string, actor: Actor, orderId: string, sourceId: string) {
    const result = await this.prisma.$transaction(async (tx) => {
      await lockOrder(tx, studioId, orderId);
      const source = await tx.sourceAsset.findFirst({
        where: { id: sourceId, orderId, studioId },
        include: { _count: { select: { versionSources: true } } },
      });
      if (!source) throw Errors.notFound('Source');
      if (source.removedAt) return { retained: source._count.versionSources > 0, keys: [] as string[] };
      const retained = source._count.versionSources > 0;
      const now = new Date();
      await tx.sourceAsset.update({
        where: { id: sourceId },
        data: { removedAt: now, contentDeletedAt: retained || !source.storageKey ? null : now },
      });
      // Drop the reference from the working brief if it was selected for the customer.
      const draft = await tx.briefDraft.findUnique({ where: { orderId } });
      if (draft) {
        const content = draft.content as { references?: { sourceId: string }[] };
        if (content.references?.some((r) => r.sourceId === sourceId)) {
          content.references = content.references.filter((r) => r.sourceId !== sourceId);
          await tx.briefDraft.update({
            where: { orderId },
            data: { content: content as Prisma.InputJsonValue, revision: { increment: 1 } },
          });
        }
      }
      await this.audit.record(tx, {
        studioId,
        orderId,
        actor,
        type: 'SOURCE_REMOVED',
        summary: retained
          ? `Removed ${source.label} from the working set (kept because an agreement version uses it)`
          : `Removed ${source.label}`,
        data: { sourceId, retained },
      });
      const keys = retained ? [] : [source.storageKey, source.previewKey].filter((k): k is string => Boolean(k));
      return { retained, keys };
    });
    for (const key of result.keys) {
      await this.storage.delete(key).catch((error: Error) =>
        logger().event('warn', 'storage_delete_failed', { sourceId, error: error.message }),
      );
    }
    return { removed: true, retained: result.retained };
  }

  async openContent(
    studioId: string,
    orderId: string,
    sourceId: string,
    variant: 'original' | 'preview',
    rangeHeader: string | undefined,
  ): Promise<{ object: StoredObject; mime: string; fileName: string } | 'unsatisfiable'> {
    const source = await this.prisma.sourceAsset.findFirst({ where: { id: sourceId, orderId, studioId } });
    if (!source) throw Errors.notFound('Source');
    return this.openSourceFile(source, variant, rangeHeader);
  }

  /** Shared by the studio and the customer portal after their own authorization checks. */
  async openSourceFile(
    source: {
      kind: SourceKind;
      sha256: string;
      storageKey: string | null;
      previewKey: string | null;
      mimeType: string | null;
      byteSize: number | null;
      label: string;
      contentDeletedAt: Date | null;
      originalName: string | null;
    },
    variant: 'original' | 'preview',
    rangeHeader: string | undefined,
  ): Promise<{ object: StoredObject; mime: string; fileName: string } | 'unsatisfiable'> {
    if (source.contentDeletedAt) throw Errors.notFound('File');
    const key = variant === 'preview' ? source.previewKey : source.storageKey;
    if (!key) throw Errors.notFound('File');
    const mime = variant === 'preview' ? 'image/webp' : (source.mimeType ?? 'application/octet-stream');
    const fileName = source.originalName ?? `${source.label}`;
    // Range requests let browsers seek within voice notes.
    let range = null;
    if (rangeHeader && variant === 'original' && source.byteSize) {
      const parsed = parseRangeHeader(rangeHeader, source.byteSize);
      if (parsed === 'unsatisfiable') return 'unsatisfiable';
      range = parsed;
    }
    let object: StoredObject;
    try {
      object = await this.storage.get(key, range ?? undefined);
    } catch (error) {
      if (!(await this.restoreBundledDemoFile(source))) throw error;
      object = await this.storage.get(key, range ?? undefined);
    }
    return { object, mime, fileName };
  }

  /**
   * The demo voice note and picture ship with the app (fixtures/demo). When storage no longer has a copy — for
   * example a free host's temporary disk after a restart, or a demo studio seeded from another machine — the file
   * is put back from the bundled original. Only files whose checksum matches a bundled demo file qualify.
   */
  private async restoreBundledDemoFile(source: {
    kind: SourceKind;
    sha256: string;
    storageKey: string | null;
    previewKey: string | null;
    mimeType: string | null;
  }): Promise<boolean> {
    const hashes = demoAssetHashes();
    const file = source.sha256 === hashes.audio ? DEMO_AUDIO_FILE : source.sha256 === hashes.image ? DEMO_IMAGE_FILE : null;
    if (!file || !source.storageKey) return false;
    try {
      const buffer = await readFile(file);
      await this.storage.put(source.storageKey, buffer, source.mimeType ?? 'application/octet-stream');
      if (source.kind === 'IMAGE' && source.previewKey) {
        await this.storage.put(source.previewKey, (await processImage(buffer)).preview, 'image/webp');
      }
      logger().event('info', 'demo_media_restored', { storageKey: source.storageKey });
      return true;
    } catch (error) {
      logger().event('warn', 'demo_media_restore_failed', { storageKey: source.storageKey, error: (error as Error).message });
      return false;
    }
  }

  async correctTranscript(
    studioId: string,
    actor: UserActor,
    orderId: string,
    sourceId: string,
    input: TranscriptCorrectionInput,
  ): Promise<SourceDto> {
    return this.prisma.$transaction(async (tx) => {
      const source = await tx.sourceAsset.findFirst({
        where: { id: sourceId, orderId, studioId },
        include: { transcripts: { orderBy: { createdAt: 'desc' }, take: 1 } },
      });
      if (!source) throw Errors.notFound('Source');
      if (source.kind !== 'AUDIO') throw Errors.invalidState('Only voice notes have transcripts.');
      const current = source.transcripts[0] ?? null;
      if ((current?.id ?? null) !== input.basedOnTranscriptId) {
        throw Errors.conflict('The transcript changed since you opened it. Reload and apply your correction again.');
      }
      if (current && current.text === input.text) return toSourceDto(await tx.sourceAsset.findUniqueOrThrow({ where: { id: sourceId }, include: sourceInclude }));
      // Corrections never overwrite the machine transcript; they create a new, human-labelled row.
      await tx.transcript.create({
        data: {
          studioId,
          sourceId,
          origin: 'HUMAN',
          text: input.text,
          segments: undefined,
          correctsId: current?.id ?? null,
          createdById: actor.userId,
        },
      });
      await this.audit.record(tx, {
        studioId,
        orderId,
        actor,
        type: 'TRANSCRIPT_CORRECTED',
        summary: `Transcript of ${source.label} ${current ? 'corrected' : 'entered manually'}`,
        data: { sourceId },
      });
      return toSourceDto(await tx.sourceAsset.findUniqueOrThrow({ where: { id: sourceId }, include: sourceInclude }));
    });
  }
}
