import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/** Synthetic demonstration scenario ("Amina Atelier" / "Ada Okafor"). All people are fictional. */
export const DEMO = {
  seedKey: 'amina-atelier',
  studioName: 'Amina Atelier',
  ownerName: 'Amina Bello',
  customerName: 'Ada Okafor',
  customerPhone: '08030000000',
  orderTitle: 'Navy evening dress',
  garmentType: 'Dress',
  /** Source A — selected text. */
  textA: 'I want a navy-blue floor-length dress with a square neckline.\nPlease make the sleeves long and fitted. No slit.\nI will provide the fabric.',
  /** Source B — what the voice note says (the audio file is a real recording of this sentence). */
  voiceNoteB: 'Please make the sleeves elbow length. Keep the square neckline and no slit. Can we add light beading around the neckline?',
} as const;

export const DEMO_ASSET_DIR = resolve(process.env.TAILORITE_DEMO_ASSETS ?? 'fixtures/demo');
export const DEMO_AUDIO_FILE = resolve(DEMO_ASSET_DIR, 'voice-note-ada.wav');
export const DEMO_AUDIO_TIMING_FILE = resolve(DEMO_ASSET_DIR, 'voice-note-ada.timing.json');
export const DEMO_IMAGE_FILE = resolve(DEMO_ASSET_DIR, 'reference-navy-gown.png');

const sha = (buf: Buffer | string) => createHash('sha256').update(buf).digest('hex');

let cached: { audio: string | null; image: string | null } | null = null;

/** Content hashes of the bundled demo files (null when a teammate has not generated them yet). */
export function demoAssetHashes() {
  cached ??= {
    audio: existsSync(DEMO_AUDIO_FILE) ? sha(readFileSync(DEMO_AUDIO_FILE)) : null,
    image: existsSync(DEMO_IMAGE_FILE) ? sha(readFileSync(DEMO_IMAGE_FILE)) : null,
  };
  return cached;
}

export const normalizeText = (s: string) => s.replace(/\s+/g, ' ').trim().toLowerCase();

/** Sentence timings measured while the demo voice note was synthesised (see scripts/generate-demo-assets.mjs). */
export function demoAudioTiming(): { startMs: number; endMs: number; text: string }[] | null {
  if (!existsSync(DEMO_AUDIO_TIMING_FILE)) return null;
  try {
    return JSON.parse(readFileSync(DEMO_AUDIO_TIMING_FILE, 'utf8')).segments ?? null;
  } catch {
    return null;
  }
}
