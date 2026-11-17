/** Hi-Z reduction, projection edge cases, and a deterministic level-0 oracle. */
import { describe, expect, test } from "vitest";
import { buildHiZ, hiZLayout, packHiZ, sphereOccluded, sphereOccludedPacked, type HiZ } from "./hiZ.ts";

/** Column-major WebGPU perspective, looking down -Z. */
function perspective(reversed: boolean, far = 100): number[] {
  const near = 0.1;
  const m = new Array<number>(16).fill(0);
  m[0] = 1;
  m[5] = 1;
  m[11] = -1;
  if (reversed && far === Infinity) { m[10] = 0; m[14] = near; }
  else if (reversed) { m[10] = near / (far - near); m[14] = far * near / (far - near); }
  else { m[10] = far / (near - far); m[14] = near * far / (near - far); }
  return m;
}

function multiply(a: readonly number[], b: readonly number[]): number[] {
  const out = new Array<number>(16).fill(0);
  for (let c = 0; c < 4; c += 1) for (let r = 0; r < 4; r += 1) for (let k = 0; k < 4; k += 1) {
    out[c * 4 + r]! += a[k * 4 + r]! * b[c * 4 + k]!;
  }
  return out;
}

const identity = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
const depthAt = (m: readonly number[], z: number): number => (m[10]! * z + m[14]!) / -z;

/** Independent projection and exhaustive pixel comparison; never samples a reduced level. */
function bruteOccluded(hiz: HiZ, m: readonly number[], center: readonly [number, number, number], radius: number, epsilon = 1e-6): boolean {
  const corners: number[][] = [];
  for (const dx of [-radius, radius]) for (const dy of [-radius, radius]) for (const dz of [-radius, radius]) {
    const p = [center[0] + dx, center[1] + dy, center[2] + dz, 1];
    const clip = [0, 1, 2, 3].map(row => p.reduce((sum, v, col) => sum + v * m[col * 4 + row]!, 0));
    if (clip[3]! <= 1e-6) return false;
    corners.push(clip.slice(0, 3).map(v => v / clip[3]!));
  }
  const xs = corners.map(p => p[0]!), ys = corners.map(p => p[1]!), zs = corners.map(p => p[2]!);
  if (Math.max(...xs) < -1 || Math.min(...xs) > 1 || Math.max(...ys) < -1 || Math.min(...ys) > 1) return false;
  const base = hiz.levels[0]!;
  const clamp = (v: number): number => Math.max(-1, Math.min(1, v));
  const px = xs.map(x => (clamp(x) + 1) * base.width / 2);
  const py = ys.map(y => (1 - clamp(y)) * base.height / 2);
  const x0 = Math.min(base.width - 1, Math.max(0, Math.floor(Math.min(...px))));
  const x1 = Math.max(x0, Math.min(base.width - 1, Math.ceil(Math.max(...px)) - 1));
  const y0 = Math.min(base.height - 1, Math.max(0, Math.floor(Math.min(...py))));
  const y1 = Math.max(y0, Math.min(base.height - 1, Math.ceil(Math.max(...py)) - 1));
  const nearest = hiz.reversed ? Math.max(...zs) : Math.min(...zs);
  for (let y = y0; y <= y1; y += 1) for (let x = x0; x <= x1; x += 1) {
    const depth = base.data[y * base.width + x]!;
    if (!(hiz.reversed ? nearest < depth - epsilon : nearest > depth + epsilon)) return false;
  }
  return true;
}

describe("buildHiZ", () => {
  for (const reversed of [true, false]) {
    test(`7 × 5 farthest reduction and odd edges (reversed=${reversed})`, () => {
      const depth = Float32Array.from({ length: 35 }, (_, i) => (i + 1) / 64);
      const hiz = buildHiZ(depth, 7, 5, reversed);
      expect(hiz.reversed).toBe(reversed);
      expect(hiz.levels.map(l => [l.width, l.height])).toEqual([[7, 5], [4, 3], [2, 2], [1, 1]]);
      expect(hiz.levels[0]!.data).toEqual(depth);
      expect(hiz.levels[0]!.data).not.toBe(depth);
      // Expected values in units of 1/64, including partial right/bottom blocks.
      const expected = reversed
        ? [[1, 3, 5, 7, 15, 17, 19, 21, 29, 31, 33, 35], [1, 5, 29, 33], [1]]
        : [[9, 11, 13, 14, 23, 25, 27, 28, 30, 32, 34, 35], [25, 28, 32, 35], [35]];
      expected.forEach((values, i) => expect(Array.from(hiz.levels[i + 1]!.data)).toEqual(values.map(v => v / 64)));
      depth[0] = 0;
      expect(hiz.levels[0]!.data[0]).toBe(1 / 64);
    });
  }

  test("1 × 1 stops immediately; single-axis images keep their odd edge", () => {
    expect(buildHiZ([0.5], 1, 1, true).levels).toHaveLength(1);
    for (const [width, height] of [[1, 5], [5, 1]]) {
      const hiz = buildHiZ([0.5, 0.75, 0.25, 1, 0], width!, height!, true);
      expect(hiz.levels.map(l => Array.from(l.data))).toEqual([[0.5, 0.75, 0.25, 1, 0], [0.5, 0.25, 0], [0.25, 0], [0]]);
    }
  });

  test("rejects invalid dimensions and mismatched depth lengths", () => {
    for (const dimension of [0, -1, 1.5, NaN, Infinity]) {
      expect(() => buildHiZ([], dimension, 1, true)).toThrow(/^hiz: /);
      expect(() => buildHiZ([], 1, dimension, false)).toThrow(/^hiz: /);
    }
    for (const depth of [[], [0], [0, 0, 0]]) expect(() => buildHiZ(depth, 2, 1, true)).toThrow(/^hiz: /);
  });
});

describe("hiZLayout", () => {
  test.each([
    { width: 1, height: 1, sizes: [[1, 1]], total: 1 },
    { width: 7, height: 5, sizes: [[7, 5], [4, 3], [2, 2], [1, 1]], total: 52 },
    {
      width: 1920, height: 1080,
      sizes: [[1920, 1080], [960, 540], [480, 270], [240, 135], [120, 68], [60, 34],
        [30, 17], [15, 9], [8, 5], [4, 3], [2, 2], [1, 1]],
      total: 2764902,
    },
  ])("$width × $height has the expected sizes and cumulative offsets", ({ width, height, sizes, total }) => {
    const layout = hiZLayout(width, height);
    expect([layout.width, layout.height]).toEqual([width, height]);
    expect(layout.levels.map(level => [level.width, level.height])).toEqual(sizes);
    let offset = 0;
    for (const level of layout.levels) {
      expect(level.offset).toBe(offset);
      offset += level.width * level.height;
    }
    expect(layout.total).toBe(offset);
    expect(layout.total).toBe(total);
  });

  test("rejects invalid dimensions", () => {
    for (const dimension of [0, -1, 1.5, NaN, Infinity]) {
      expect(() => hiZLayout(dimension, 1)).toThrow(/^hiz: /);
      expect(() => hiZLayout(1, dimension)).toThrow(/^hiz: /);
    }
  });
});

describe("packHiZ", () => {
  test.each([true, false])("concatenates the exact data of each level (reversed=%s)", reversed => {
    const depth = Float32Array.from({ length: 35 }, (_, i) => (i + 1) / 64);
    const hiz = buildHiZ(depth, 7, 5, reversed);
    const layout = hiZLayout(7, 5);
    const data = packHiZ(hiz);
    expect(data).toBeInstanceOf(Float32Array);
    expect(data).toHaveLength(layout.total);
    layout.levels.forEach(({ offset, width, height }, i) => {
      expect(data.slice(offset, offset + width * height)).toEqual(hiz.levels[i]!.data);
    });
  });

  test("rejects missing levels, extra levels, and mismatched sizes", () => {
    const hiz = buildHiZ(new Float32Array(35), 7, 5, false);
    const level = hiz.levels[1]!;
    for (const levels of [
      [],
      hiz.levels.slice(0, -1),
      [...hiz.levels, hiz.levels.at(-1)!],
      [hiz.levels[0]!, { ...level, width: level.height, height: level.width }, ...hiz.levels.slice(2)],
      [hiz.levels[0]!, { ...level, data: level.data.slice(1) }, ...hiz.levels.slice(2)],
    ]) {
      expect(() => packHiZ({ reversed: hiz.reversed, levels })).toThrow(/^hiz: /);
    }
  });
});

describe("sphereOccludedPacked", () => {
  test.each([true, false])("matches the reference across randomized pyramids and spheres (reversed=%s)", reversed => {
    let seed = 0x5b213;
    const random = (): number => {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      return seed / 4294967296;
    };
    const projection = perspective(reversed);
    let hidden = 0;
    let visible = 0;
    for (const [width, height] of [[1, 1], [7, 5], [32, 24], [31, 23], [1, 17]] as const) {
      const layout = hiZLayout(width, height);
      for (let image = 0; image < 4; image += 1) {
        const depth = Float32Array.from({ length: width * height }, random);
        const hiz = buildHiZ(depth, width, height, reversed);
        const data = packHiZ(hiz);
        for (let i = 0; i < 30; i += 1) {
          const z = i % 6 === 0 ? random() * 5 : -(0.15 + random() * 30);
          const spread = (i % 5 === 0 ? 2 : 0.9) * Math.abs(z);
          const center = [(random() * 2 - 1) * spread, (random() * 2 - 1) * spread, z] as const;
          const radius = i % 7 === 0 ? 0 : random() * Math.abs(z) * 0.55;
          const epsilon = i % 3 === 0 ? random() * 0.01 : undefined;
          const expected = sphereOccluded(hiz, projection, center, radius, epsilon);
          expect(sphereOccludedPacked(data, layout, reversed, projection, center, radius, epsilon),
            `${width} × ${height}, image ${image}, sphere ${i}`).toBe(expected);
          if (expected) hidden += 1;
          else visible += 1;
        }
      }
    }
    expect(hidden).toBeGreaterThan(20);
    expect(visible).toBeGreaterThan(20);
  });
});

for (const reversed of [true, false]) describe(`sphereOccluded (reversed=${reversed})`, () => {
  const m = perspective(reversed);
  const sky = reversed ? 0 : 1;
  const wall = depthAt(m, -2);
  const fullWall = (): HiZ => buildHiZ(new Float32Array(32 * 24).fill(wall), 32, 24, reversed);

  test("a full wall hides a sphere behind it, but not in front or intersecting it", () => {
    const hiz = fullWall();
    expect(sphereOccluded(hiz, m, [0, 0, -10], 0.5)).toBe(true);
    expect(sphereOccluded(hiz, m, [0, 0, -1], 0.1)).toBe(false);
    expect(sphereOccluded(hiz, m, [0, 0, -2.2], 0.4)).toBe(false);
    // Clipping a partly off-screen rectangle must still allow a conservative query.
    expect(sphereOccluded(hiz, m, [10, 0, -10], 1)).toBe(true);
  });

  test("a half wall cannot hide a sphere straddling its edge", () => {
    const depth = Float32Array.from({ length: 32 * 24 }, (_, i) => i % 32 < 16 ? wall : sky);
    const hiz = buildHiZ(depth, 32, 24, reversed);
    expect(sphereOccluded(hiz, m, [0, 0, -10], 0.5)).toBe(false);
    expect(sphereOccluded(hiz, m, [-5, 0, -10], 0.5)).toBe(true);
  });

  test("sky cannot hide near or far spheres", () => {
    const hiz = buildHiZ(new Float32Array(32 * 24).fill(sky), 32, 24, reversed);
    for (const z of [-0.2, -1, -10, -99]) expect(sphereOccluded(hiz, m, [0, 0, z], 0.05)).toBe(false);
  });

  test("eye-plane crossings, tiny w, behind-camera and fully off-screen boxes stay visible", () => {
    const hiz = fullWall();
    expect(sphereOccluded(hiz, m, [0, 0, -0.1], 0.2)).toBe(false);
    expect(sphereOccluded(hiz, m, [0, 0, 1], 0.2)).toBe(false);
    expect(sphereOccluded(hiz, m, [0, 0, -1e-6], 0)).toBe(false);
    for (const center of [[30, 0, -10], [-30, 0, -10], [0, 30, -10], [0, -30, -10]] as const) {
      expect(sphereOccluded(hiz, m, center, 0.5)).toBe(false);
    }
  });

  test("top-row orientation, exact pixel edges and degenerate rectangles", () => {
    const depth = new Float32Array(16).fill(sky);
    depth[1] = reversed ? 0.875 : 0.125; // Row 0, column 1.
    const hiz = buildHiZ(depth, 4, 4, reversed);
    const z = reversed ? 0.25 : 0.75;
    expect(sphereOccluded(hiz, identity, [-0.25, 0.75, z], 0.25)).toBe(true);
    expect(sphereOccluded(hiz, identity, [-0.25, -0.75, z], 0)).toBe(false);
    expect(sphereOccluded(hiz, identity, [-0.25, 0.75, z], 0)).toBe(true);
    expect(sphereOccluded(hiz, identity, [-0.25, 0.75, z], 0.251)).toBe(false);
    const single = buildHiZ([0.5], 1, 1, reversed);
    expect(sphereOccluded(single, identity, [1, 1, z], 0)).toBe(true);
    expect(sphereOccluded(single, identity, [-1, -1, z], 0)).toBe(true);
  });

  test("depth equality and the strict epsilon margin", () => {
    const hiz = buildHiZ([0.5], 1, 1, reversed);
    const farther = (delta: number): number => 0.5 + (reversed ? -delta : delta);
    expect(sphereOccluded(hiz, identity, [0, 0, 0.5], 0, 0)).toBe(false);
    expect(sphereOccluded(hiz, identity, [0, 0, farther(0.5e-6)], 0)).toBe(false);
    expect(sphereOccluded(hiz, identity, [0, 0, farther(2e-6)], 0)).toBe(true);
    expect(sphereOccluded(hiz, identity, [0, 0, farther(0.125)], 0, 0.125)).toBe(false);
    expect(sphereOccluded(hiz, identity, [0, 0, farther(0.125)], 0, 0.0625)).toBe(true);
  });

  test("deterministic random walls and spheres never contradict exhaustive level 0", () => {
    let seed = 0x5c09a;
    const random = (): number => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
    let hidden = 0, visible = 0;
    for (let i = 0; i < 500; i += 1) {
      const width = i % 2 === 0 ? 32 : 31, height = i % 2 === 0 ? 24 : 23;
      const depth = new Float32Array(width * height).fill(i % 4 === 0 ? wall : sky);
      for (let patch = 0; patch < 8; patch += 1) {
        const x0 = Math.floor(random() * width), y0 = Math.floor(random() * height);
        const x1 = x0 + 1 + Math.floor(random() * (width - x0));
        const y1 = y0 + 1 + Math.floor(random() * (height - y0));
        const value = random() < 0.1 ? sky : depthAt(m, -(0.2 + random() * 15));
        for (let y = y0; y < y1; y += 1) for (let x = x0; x < x1; x += 1) depth[y * width + x] = value;
      }
      const angle = random() * Math.PI * 2, c = Math.cos(angle), s = Math.sin(angle);
      const view = [c, 0, -s, 0, 0, 1, 0, 0, s, 0, c, 0, random() * 2 - 1, random() * 2 - 1, -random() * 3, 1];
      const vp = multiply(perspective(reversed, reversed && i % 3 === 0 ? Infinity : 100), view);
      const center: [number, number, number] = [random() * 30 - 15, random() * 24 - 12, random() * 40 - 30];
      const radius = i % 17 === 0 ? 0 : random() * 4;
      const epsilon = i % 7 === 0 ? 0 : 1e-6;
      const hiz = buildHiZ(depth, width, height, reversed);
      if (sphereOccluded(hiz, vp, center, radius, epsilon)) {
        hidden += 1;
        expect(bruteOccluded(hiz, vp, center, radius, epsilon), `case ${i}`).toBe(true);
      } else visible += 1;
    }
    expect(hidden).toBeGreaterThan(20);
    expect(visible).toBeGreaterThan(20);
  });
});
