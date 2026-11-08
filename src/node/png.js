// PNG encoder for Node: the shared core encoder (indexed when the image has ≤ 256 colours) with node:zlib.
import { deflateSync } from 'node:zlib';
import { pngBytes } from '../core/png.js';

/** PNG file bytes (Buffer) for w×h RGBA pixels. */
export function encodePNG(w, h, rgba) {
  const bytes = pngBytes(w, h, rgba, (raw) => deflateSync(raw, { level: 9 }));
  return Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);
}
