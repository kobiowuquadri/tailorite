import sharp from 'sharp';
import { parseBuffer } from 'music-metadata';

export type SniffedMedia = {
  kind: 'IMAGE' | 'AUDIO';
  /** MIME type stored and served for the original file. */
  mime: string;
  ext: string;
  /** MIME type to declare to the AI provider (Gemini's supported list). */
  providerMime: string;
};

const ascii = (buf: Buffer, start: number, end: number) => buf.subarray(start, end).toString('latin1');

/**
 * Identifies uploads by their content (magic bytes), never by file name or client-declared type.
 * Only the formats the product supports are recognised; everything else is rejected.
 */
export function sniffMedia(buf: Buffer): SniffedMedia | null {
  if (buf.length < 12) return null;
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) {
    return { kind: 'IMAGE', mime: 'image/jpeg', ext: 'jpg', providerMime: 'image/jpeg' };
  }
  if (buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return { kind: 'IMAGE', mime: 'image/png', ext: 'png', providerMime: 'image/png' };
  }
  if (ascii(buf, 0, 4) === 'RIFF' && ascii(buf, 8, 12) === 'WEBP') {
    return { kind: 'IMAGE', mime: 'image/webp', ext: 'webp', providerMime: 'image/webp' };
  }
  if (ascii(buf, 0, 4) === 'RIFF' && ascii(buf, 8, 12) === 'WAVE') {
    return { kind: 'AUDIO', mime: 'audio/wav', ext: 'wav', providerMime: 'audio/wav' };
  }
  if (ascii(buf, 0, 4) === 'OggS') return { kind: 'AUDIO', mime: 'audio/ogg', ext: 'ogg', providerMime: 'audio/ogg' };
  if (ascii(buf, 0, 4) === 'fLaC') return { kind: 'AUDIO', mime: 'audio/flac', ext: 'flac', providerMime: 'audio/flac' };
  if (buf[0] === 0x1a && buf[1] === 0x45 && buf[2] === 0xdf && buf[3] === 0xa3) {
    return { kind: 'AUDIO', mime: 'audio/webm', ext: 'webm', providerMime: 'audio/webm' };
  }
  if (ascii(buf, 4, 8) === 'ftyp') {
    return { kind: 'AUDIO', mime: 'audio/mp4', ext: 'm4a', providerMime: 'audio/m4a' };
  }
  if (ascii(buf, 0, 3) === 'ID3') return { kind: 'AUDIO', mime: 'audio/mpeg', ext: 'mp3', providerMime: 'audio/mp3' };
  if (buf[0] === 0xff && (buf[1] & 0xf6) === 0xf0) {
    return { kind: 'AUDIO', mime: 'audio/aac', ext: 'aac', providerMime: 'audio/aac' };
  }
  // MPEG audio frame sync with layer III bits.
  if (buf[0] === 0xff && (buf[1] & 0xe0) === 0xe0 && (buf[1] & 0x06) === 0x02) {
    return { kind: 'AUDIO', mime: 'audio/mpeg', ext: 'mp3', providerMime: 'audio/mp3' };
  }
  return null;
}

export const PROVIDER_MIME_BY_STORED: Record<string, string> = {
  'image/jpeg': 'image/jpeg',
  'image/png': 'image/png',
  'image/webp': 'image/webp',
  'audio/wav': 'audio/wav',
  'audio/ogg': 'audio/ogg',
  'audio/flac': 'audio/flac',
  'audio/webm': 'audio/webm',
  'audio/mp4': 'audio/m4a',
  'audio/mpeg': 'audio/mp3',
  'audio/aac': 'audio/aac',
};

export class MediaRejected extends Error {}

export type ProcessedImage = { width: number; height: number; preview: Buffer };

/**
 * Decodes the image (rejecting corrupt or decompression-bomb files) and produces a display
 * derivative: orientation applied, max 1600px, WebP, all metadata (EXIF/GPS) stripped.
 */
export async function processImage(buf: Buffer): Promise<ProcessedImage> {
  try {
    const image = sharp(buf, { limitInputPixels: 40_000_000, failOn: 'error', animated: false });
    const meta = await image.metadata();
    if (!meta.width || !meta.height) throw new MediaRejected('The image has no readable dimensions.');
    const preview = await image
      .autoOrient()
      .resize({ width: 1600, height: 1600, fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 82 })
      .toBuffer();
    const oriented = (meta.orientation ?? 1) >= 5;
    return {
      width: oriented ? meta.height : meta.width,
      height: oriented ? meta.width : meta.height,
      preview,
    };
  } catch (error) {
    if (error instanceof MediaRejected) throw error;
    throw new MediaRejected('This image could not be read. Upload a JPEG, PNG or WebP picture.');
  }
}

export type ProbedAudio = { durationMs: number | null };

/** Reads the audio duration when the container reports it reliably; rejects video files. */
export async function probeAudio(buf: Buffer, mime: string): Promise<ProbedAudio> {
  try {
    const meta = await parseBuffer(new Uint8Array(buf), { mimeType: mime, size: buf.length }, { duration: true, skipCovers: true });
    if (meta.format.hasVideo) throw new MediaRejected('Video files are not supported. Upload an audio recording.');
    const seconds = meta.format.duration;
    return { durationMs: seconds && Number.isFinite(seconds) && seconds > 0 ? Math.round(seconds * 1000) : null };
  } catch (error) {
    if (error instanceof MediaRejected) throw error;
    // Some valid recordings (e.g. browser WebM) do not declare a duration; timing is then treated as unknown.
    return { durationMs: null };
  }
}

/** Keeps a readable, harmless file name for display (never used as a storage path). */
export function sanitizeFileName(name: string | undefined): string | null {
  if (!name) return null;
  const base = name.split(/[\\/]/).pop() ?? '';
  const cleaned = base.normalize('NFC').replace(/[^\p{L}\p{N} ._()-]/gu, '_').replace(/\s+/g, ' ').trim();
  return cleaned.slice(0, 120) || null;
}
