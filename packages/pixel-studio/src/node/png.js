// PNG for Node: the shared core encoder (indexed when the image has ≤ 256 colours) and decoder, with node:zlib.
import { deflateSync, inflateSync } from 'node:zlib';
import { pngBytes, pngPixels } from '../core/png.js';

/** PNG file bytes (Buffer) for w×h RGBA pixels. */
export function encodePNG(w, h, rgba) {
  const bytes = pngBytes(w, h, rgba, (raw) => deflateSync(raw, { level: 9 }));
  return Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);
}

/** {width, height, rgba} from PNG file bytes. */
export function decodePNG(bytes) {
  return pngPixels(bytes, (z) => inflateSync(z));
}
