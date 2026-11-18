// An 8-bit RGBA PNG encoder for generated textures (vegetation plan PG1):
// deterministic bytes (fixed zlib level, per-row filter chosen by the usual
// minimum-sum-of-absolute-differences rule), no metadata chunks. And the
// matching decoder (PG3: the bake reads a material's texture): 8-bit RGB /
// RGBA / grey (+ alpha), not interlaced; anything else returns null.

import { deflateSync, inflateSync } from "node:zlib";

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) crc = CRC_TABLE[(crc ^ byte) & 0xff]! ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Uint8Array): Uint8Array {
  const out = new Uint8Array(12 + data.length);
  const view = new DataView(out.buffer);
  view.setUint32(0, data.length);
  for (let i = 0; i < 4; i += 1) out[4 + i] = type.charCodeAt(i);
  out.set(data, 8);
  view.setUint32(8 + data.length, crc32(out.subarray(4, 8 + data.length)));
  return out;
}

const paeth = (a: number, b: number, c: number): number => {
  const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
  return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
};

/** `rgba` is width × height × 4 bytes, row-major from the top. */
export function encodeRgbaPng(width: number, height: number, rgba: Uint8Array): Uint8Array {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1 || rgba.length !== width * height * 4) {
    throw new Error(`encodeRgbaPng: ${rgba.length} bytes do not make a ${width} × ${height} RGBA image`);
  }
  const stride = width * 4;
  const raw = new Uint8Array((stride + 1) * height);
  const candidate = new Uint8Array(stride);
  const best = new Uint8Array(stride);
  for (let y = 0; y < height; y += 1) {
    const row = rgba.subarray(y * stride, (y + 1) * stride);
    const up = y > 0 ? rgba.subarray((y - 1) * stride, y * stride) : null;
    let bestFilter = 0, bestScore = Infinity;
    for (let filter = 0; filter < 5; filter += 1) {
      let score = 0;
      for (let x = 0; x < stride; x += 1) {
        const a = x >= 4 ? row[x - 4]! : 0, b = up ? up[x]! : 0, c = up && x >= 4 ? up[x - 4]! : 0;
        const predictor = filter === 0 ? 0 : filter === 1 ? a : filter === 2 ? b : filter === 3 ? (a + b) >> 1 : paeth(a, b, c);
        const value = (row[x]! - predictor) & 0xff;
        candidate[x] = value;
        score += value < 128 ? value : 256 - value;
      }
      if (score < bestScore) { bestScore = score; bestFilter = filter; best.set(candidate); }
    }
    raw[y * (stride + 1)] = bestFilter;
    raw.set(best, y * (stride + 1) + 1);
  }
  const header = new Uint8Array(13);
  const view = new DataView(header.buffer);
  view.setUint32(0, width);
  view.setUint32(4, height);
  header.set([8, 6, 0, 0, 0], 8); // 8 bit, RGBA, deflate, adaptive filtering, no interlace
  const parts = [
    Uint8Array.of(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a),
    chunk("IHDR", header),
    chunk("IDAT", new Uint8Array(deflateSync(raw, { level: 9 }))),
    chunk("IEND", new Uint8Array(0)),
  ];
  const out = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
  let offset = 0;
  for (const part of parts) { out.set(part, offset); offset += part.length; }
  return out;
}

/** Decodes an 8-bit, non-interlaced RGB / RGBA / grey / grey-alpha PNG to RGBA8; null for anything else. */
export function decodePng(bytes: Uint8Array): { width: number; height: number; rgba: Uint8Array } | null {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (bytes.length < 33 || view.getUint32(0) !== 0x89504e47) return null;
  let offset = 8, width = 0, height = 0, channels = 0;
  const data: Uint8Array[] = [];
  while (offset + 8 <= bytes.length) {
    const length = view.getUint32(offset);
    const type = String.fromCharCode(...bytes.subarray(offset + 4, offset + 8));
    const body = bytes.subarray(offset + 8, offset + 8 + length);
    if (type === "IHDR") {
      width = view.getUint32(offset + 8); height = view.getUint32(offset + 12);
      const [depth, colour, , , interlace] = body.subarray(8, 13);
      channels = colour === 6 ? 4 : colour === 2 ? 3 : colour === 4 ? 2 : colour === 0 ? 1 : 0;
      if (depth !== 8 || interlace !== 0 || channels === 0) return null;
    } else if (type === "IDAT") {
      data.push(body);
    } else if (type === "IEND") {
      break;
    }
    offset += 12 + length;
  }
  if (!width || !height) return null;
  const joined = new Uint8Array(data.reduce((sum, part) => sum + part.length, 0));
  let at = 0;
  for (const part of data) { joined.set(part, at); at += part.length; }
  const raw = new Uint8Array(inflateSync(joined));
  const stride = width * channels;
  if (raw.length < (stride + 1) * height) return null;
  const pixels = new Uint8Array(stride * height);
  for (let y = 0; y < height; y += 1) {
    const filter = raw[y * (stride + 1)]!;
    const row = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    for (let x = 0; x < stride; x += 1) {
      const a = x >= channels ? pixels[y * stride + x - channels]! : 0;
      const b = y > 0 ? pixels[(y - 1) * stride + x]! : 0;
      const c = y > 0 && x >= channels ? pixels[(y - 1) * stride + x - channels]! : 0;
      const predictor = filter === 0 ? 0 : filter === 1 ? a : filter === 2 ? b : filter === 3 ? (a + b) >> 1 : paeth(a, b, c);
      pixels[y * stride + x] = (row[x]! + predictor) & 0xff;
    }
  }
  const rgba = new Uint8Array(width * height * 4);
  for (let i = 0; i < width * height; i += 1) {
    const p = i * channels;
    const grey = channels <= 2;
    rgba[i * 4] = pixels[p]!;
    rgba[i * 4 + 1] = grey ? pixels[p]! : pixels[p + 1]!;
    rgba[i * 4 + 2] = grey ? pixels[p]! : pixels[p + 2]!;
    rgba[i * 4 + 3] = channels === 4 ? pixels[p + 3]! : channels === 2 ? pixels[p + 1]! : 255;
  }
  return { width, height, rgba };
}
