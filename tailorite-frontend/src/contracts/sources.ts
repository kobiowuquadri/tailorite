// GENERATED FILE — do not edit. Source of truth: tailorite-backend/src/contracts.
// Run `pnpm contracts:sync` after changing the backend contracts.
import { z } from 'zod';
import { IdempotencyKey, optionalText, Uuid } from './common';

export const SourceKind = z.enum(['TEXT', 'IMAGE', 'AUDIO']);
export type SourceKind = z.infer<typeof SourceKind>;

export const SourceProcessingState = z.enum(['NOT_PROCESSED', 'QUEUED', 'PROCESSING', 'PROCESSED', 'FAILED']);
export type SourceProcessingState = z.infer<typeof SourceProcessingState>;

export const SOURCE_STATE_LABELS: Record<SourceProcessingState, string> = {
  NOT_PROCESSED: 'Not processed',
  QUEUED: 'Queued',
  PROCESSING: 'Processing',
  PROCESSED: 'Processed',
  FAILED: 'Processing failed',
};

/** Accepted upload formats (validated server-side by content, not by extension). */
export const ACCEPTED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;
export const ACCEPTED_AUDIO_TYPES = [
  'audio/mpeg',
  'audio/wav',
  'audio/ogg',
  'audio/webm',
  'audio/mp4',
  'audio/aac',
  'audio/flac',
] as const;
export const AUDIO_FORMAT_HELP = 'MP3, M4A/AAC, WAV, OGG/Opus, WebM or FLAC';

export const AddTextSourceInput = z.object({
  text: z.string().trim().min(1, 'Paste the message text').max(20_000, 'Messages can be at most 20,000 characters'),
  label: optionalText(80),
  sender: optionalText(80),
  context: optionalText(300),
  idempotencyKey: IdempotencyKey.optional(),
});
export type AddTextSourceInput = z.infer<typeof AddTextSourceInput>;

/** Multipart fields that accompany a file upload. */
export const FileSourceFields = z.object({
  label: optionalText(80),
  sender: optionalText(80),
  context: optionalText(300),
  origin: z.enum(['UPLOADED', 'RECORDED']).default('UPLOADED'),
  idempotencyKey: IdempotencyKey.optional(),
});
export type FileSourceFields = z.infer<typeof FileSourceFields>;

export const UpdateSourceInput = z.object({
  label: z.string().trim().min(1).max(80).optional(),
  sender: optionalText(80),
  context: optionalText(300),
});
export type UpdateSourceInput = z.infer<typeof UpdateSourceInput>;

export const TranscriptCorrectionInput = z.object({
  text: z.string().trim().min(1, 'The transcript cannot be empty').max(20_000),
  basedOnTranscriptId: Uuid.nullable(),
});
export type TranscriptCorrectionInput = z.infer<typeof TranscriptCorrectionInput>;

export type TranscriptSegment = { startMs: number; endMs: number; text: string };

export type TranscriptDto = {
  id: string;
  origin: 'MACHINE' | 'FIXTURE' | 'HUMAN';
  text: string;
  segments: TranscriptSegment[] | null;
  provider: string | null;
  model: string | null;
  createdAt: string;
  correctsId: string | null;
};

export type SourceDto = {
  id: string;
  kind: SourceKind;
  origin: 'PASTED' | 'UPLOADED' | 'RECORDED' | 'SEEDED';
  label: string;
  sender: string | null;
  context: string | null;
  addedAt: string;
  processingState: SourceProcessingState;
  processingError: string | null;
  mimeType: string | null;
  byteSize: number | null;
  width: number | null;
  height: number | null;
  durationMs: number | null;
  originalName: string | null;
  /** Original text (TEXT sources only). */
  text: string | null;
  /** Authorized, same-origin URLs for the original file and sanitized preview. */
  contentUrl: string | null;
  previewUrl: string | null;
  transcript: TranscriptDto | null;
  transcriptVersions: number;
  /** Retained because an agreement version references it. */
  retainedByVersion: boolean;
  isSynthetic: boolean;
};

export type UploadPolicyDto = {
  imageMaxBytes: number;
  audioMaxBytes: number;
  audioMaxSeconds: number;
  recordingMaxSeconds: number;
  orderMaxBytes: number;
  orderUsedBytes: number;
  maxSources: number;
  sourceCount: number;
  textMaxChars: number;
  acceptedImageTypes: readonly string[];
  acceptedAudioTypes: readonly string[];
  audioFormatHelp: string;
};

export type SourcesDto = { sources: SourceDto[]; policy: UploadPolicyDto };
