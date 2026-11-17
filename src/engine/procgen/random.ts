import type { Vec3 } from "./vector.ts";

/** FNV-1a over UTF-16 code units, followed by a 32-bit avalanche. */
export function hashString(text: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) hash = Math.imul(hash ^ text.charCodeAt(i), 0x01000193);
  hash = Math.imul(hash ^ (hash >>> 16), 0x85ebca6b);
  hash = Math.imul(hash ^ (hash >>> 13), 0xc2b2ae35);
  return (hash ^ (hash >>> 16)) >>> 0;
}

export function streamSeed(seed: number, path: string): number {
  return hashString(`${seed >>> 0}:${path.length}:${path}`);
}

export interface RandomStream {
  next(): number;
  range(min: number, max: number): number;
  int(min: number, maxInclusive: number): number;
  unitVector(): Vec3;
  fork(childPath: string): RandomStream;
}

/** Mulberry32 (same PRNG family as worldbuilder/parcels.ts; no shared state/import).
 * Forks use a length-prefixed path tree and the original seed, never PRNG state.
 */
export function createStream(seed: number, path: string): RandomStream {
  let state = streamSeed(seed, path);
  const next = (): number => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = Math.imul(state ^ (state >>> 15), 1 | state);
    value ^= value + Math.imul(value ^ (value >>> 7), 61 | value);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    range: (min, max) => min + (max - min) * next(),
    int: (min, max) => Math.floor(min) + Math.floor(next() * (Math.floor(max) - Math.floor(min) + 1)),
    unitVector: () => {
      const y = next() * 2 - 1;
      const angle = next() * Math.PI * 2;
      const radius = Math.sqrt(1 - y * y);
      return [radius * Math.cos(angle), y, radius * Math.sin(angle)];
    },
    fork: child => createStream(seed, `${path.length}:${path}${child.length}:${child}`),
  };
}
