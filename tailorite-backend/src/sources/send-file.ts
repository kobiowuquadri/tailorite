import type { Response } from 'express';
import type { StoredObject } from '../storage/storage.service.js';

/**
 * Streams a private file after the caller has authorized access. Supports single byte ranges
 * (needed for audio seeking). Files are served inline with their sniffed MIME type only.
 */
export function sendStoredFile(
  res: Response,
  file: { object: StoredObject; mime: string; fileName: string } | 'unsatisfiable',
) {
  if (file === 'unsatisfiable') {
    res.status(416).end();
    return;
  }
  const { object, mime, fileName } = file;
  res.setHeader('Content-Type', mime);
  res.setHeader('Accept-Ranges', 'bytes');
  res.setHeader('Content-Length', String(object.contentLength));
  res.setHeader('Content-Disposition', `inline; filename*=UTF-8''${encodeURIComponent(fileName)}`);
  res.setHeader('Cache-Control', 'private, no-store');
  if (object.range) {
    res.status(206);
    res.setHeader('Content-Range', `bytes ${object.range.start}-${object.range.end}/${object.size}`);
  } else {
    res.status(200);
  }
  object.stream.on('error', () => res.destroy());
  object.stream.pipe(res);
}
