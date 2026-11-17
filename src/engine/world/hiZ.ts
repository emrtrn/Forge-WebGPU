/** CPU Hi-Z reference: farthest-depth reduction and conservative sphere occlusion. */
export interface HiZLevel { readonly width: number; readonly height: number; readonly data: Float32Array }
export interface HiZ { readonly reversed: boolean; readonly levels: readonly HiZLevel[] }
export interface HiZLayoutLevel { readonly width: number; readonly height: number; readonly offset: number }
export interface HiZLayout {
  readonly width: number;
  readonly height: number;
  readonly levels: readonly HiZLayoutLevel[];
  readonly total: number;
}

/** Level 0 copies the depth; ceil-halved levels keep the farthest child, through 1 × 1. */
export function buildHiZ(depth: ArrayLike<number>, width: number, height: number, reversed: boolean): HiZ {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0) {
    throw new Error("hiz: width and height must be positive integers");
  }
  if (depth.length !== width * height) throw new Error("hiz: depth length must equal width * height");
  let level: HiZLevel = { width, height, data: Float32Array.from(depth) };
  const levels: HiZLevel[] = [level];
  while (level.width > 1 || level.height > 1) {
    const nextWidth = Math.max(1, Math.ceil(level.width / 2));
    const nextHeight = Math.max(1, Math.ceil(level.height / 2));
    const data = new Float32Array(nextWidth * nextHeight);
    for (let y = 0; y < nextHeight; y += 1) {
      for (let x = 0; x < nextWidth; x += 1) {
        let farthest = reversed ? Infinity : -Infinity;
        for (let cy = 2 * y; cy < Math.min(2 * y + 2, level.height); cy += 1) {
          for (let cx = 2 * x; cx < Math.min(2 * x + 2, level.width); cx += 1) {
            const depthValue = level.data[cy * level.width + cx]!;
            farthest = reversed ? Math.min(farthest, depthValue) : Math.max(farthest, depthValue);
          }
        }
        data[y * nextWidth + x] = farthest;
      }
    }
    level = { width: nextWidth, height: nextHeight, data };
    levels.push(level);
  }
  return { reversed, levels };
}

/** True only when the whole sphere is certainly behind the depth in the Hi-Z. */
export function sphereOccluded(
  hiz: HiZ,
  viewProjection: ArrayLike<number>,
  center: readonly [number, number, number],
  radius: number,
  epsilon = 1e-6,
): boolean {
  const m = viewProjection;
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  let nearest = hiz.reversed ? -Infinity : Infinity;
  // Positive w makes the projected box bounds conservative for its enclosed sphere.
  for (let corner = 0; corner < 8; corner += 1) {
    const x = center[0] + ((corner & 1) === 0 ? -radius : radius);
    const y = center[1] + ((corner & 2) === 0 ? -radius : radius);
    const z = center[2] + ((corner & 4) === 0 ? -radius : radius);
    const w = m[3]! * x + m[7]! * y + m[11]! * z + m[15]!;
    if (w <= 1e-6) return false;
    const ndcX = (m[0]! * x + m[4]! * y + m[8]! * z + m[12]!) / w;
    const ndcY = (m[1]! * x + m[5]! * y + m[9]! * z + m[13]!) / w;
    const depth = (m[2]! * x + m[6]! * y + m[10]! * z + m[14]!) / w;
    minX = Math.min(minX, ndcX);
    maxX = Math.max(maxX, ndcX);
    minY = Math.min(minY, ndcY);
    maxY = Math.max(maxY, ndcY);
    nearest = hiz.reversed ? Math.max(nearest, depth) : Math.min(nearest, depth);
  }
  if (maxX < -1 || minX > 1 || maxY < -1 || minY > 1) return false;
  minX = Math.max(-1, minX);
  maxX = Math.min(1, maxX);
  minY = Math.max(-1, minY);
  maxY = Math.min(1, maxY);

  const base = hiz.levels[0]!;
  let x0 = Math.max(0, Math.min(base.width - 1, Math.floor((minX * 0.5 + 0.5) * base.width)));
  let x1 = Math.max(x0, Math.min(base.width - 1, Math.ceil((maxX * 0.5 + 0.5) * base.width) - 1));
  let y0 = Math.max(0, Math.min(base.height - 1, Math.floor((0.5 - maxY * 0.5) * base.height)));
  let y1 = Math.max(y0, Math.min(base.height - 1, Math.ceil((0.5 - minY * 0.5) * base.height) - 1));
  let levelIndex = 0;
  while ((x1 - x0 > 1 || y1 - y0 > 1) && levelIndex < hiz.levels.length - 1) {
    x0 = Math.floor(x0 / 2);
    x1 = Math.floor(x1 / 2);
    y0 = Math.floor(y0 / 2);
    y1 = Math.floor(y1 / 2);
    levelIndex += 1;
  }
  const level = hiz.levels[levelIndex]!;
  x0 = Math.min(x0, level.width - 1);
  x1 = Math.min(x1, level.width - 1);
  y0 = Math.min(y0, level.height - 1);
  y1 = Math.min(y1, level.height - 1);
  let farthest = hiz.reversed ? Infinity : -Infinity;
  for (let y = y0; y <= y1; y += 1) {
    for (let x = x0; x <= x1; x += 1) {
      const depth = level.data[y * level.width + x]!;
      farthest = hiz.reversed ? Math.min(farthest, depth) : Math.max(farthest, depth);
    }
  }
  return hiz.reversed ? nearest < farthest - epsilon : nearest > farthest + epsilon;
}

/** Level sizes exactly as buildHiZ makes them (ceil halving to 1 × 1), offsets in floats, level 0 first. */
export function hiZLayout(width: number, height: number): HiZLayout {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0) {
    throw new Error("hiz: width and height must be positive integers");
  }
  const levels: HiZLayoutLevel[] = [];
  let levelWidth = width;
  let levelHeight = height;
  let total = 0;
  while (true) {
    levels.push({ width: levelWidth, height: levelHeight, offset: total });
    total += levelWidth * levelHeight;
    if (levelWidth === 1 && levelHeight === 1) break;
    levelWidth = Math.ceil(levelWidth / 2);
    levelHeight = Math.ceil(levelHeight / 2);
  }
  return { width, height, levels, total };
}

/** The pyramid's levels concatenated in layout order (a Float32Array of layout.total). */
export function packHiZ(hiz: HiZ): Float32Array {
  const base = hiz.levels[0];
  if (!base) throw new Error("hiz: missing base level");
  const layout = hiZLayout(base.width, base.height);
  if (hiz.levels.length !== layout.levels.length) throw new Error("hiz: level count does not match layout");
  for (let i = 0; i < layout.levels.length; i += 1) {
    const expected = layout.levels[i]!;
    const level = hiz.levels[i];
    if (!level || level.width !== expected.width || level.height !== expected.height || level.data.length !== expected.width * expected.height) {
      throw new Error(`hiz: level ${i} size does not match layout`);
    }
  }
  const data = new Float32Array(layout.total);
  for (let i = 0; i < layout.levels.length; i += 1) {
    data.set(hiz.levels[i]!.data, layout.levels[i]!.offset);
  }
  return data;
}

/** sphereOccluded on a packed buffer, with the same projection, selection and depth comparison. */
export function sphereOccludedPacked(
  data: ArrayLike<number>,
  layout: HiZLayout,
  reversed: boolean,
  viewProjection: ArrayLike<number>,
  center: readonly [number, number, number],
  radius: number,
  epsilon = 1e-6,
): boolean {
  const m = viewProjection;
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  let nearest = reversed ? -Infinity : Infinity;
  for (let corner = 0; corner < 8; corner += 1) {
    const x = center[0] + ((corner & 1) === 0 ? -radius : radius);
    const y = center[1] + ((corner & 2) === 0 ? -radius : radius);
    const z = center[2] + ((corner & 4) === 0 ? -radius : radius);
    const w = m[3]! * x + m[7]! * y + m[11]! * z + m[15]!;
    if (w <= 1e-6) return false;
    const ndcX = (m[0]! * x + m[4]! * y + m[8]! * z + m[12]!) / w;
    const ndcY = (m[1]! * x + m[5]! * y + m[9]! * z + m[13]!) / w;
    const depth = (m[2]! * x + m[6]! * y + m[10]! * z + m[14]!) / w;
    minX = Math.min(minX, ndcX);
    maxX = Math.max(maxX, ndcX);
    minY = Math.min(minY, ndcY);
    maxY = Math.max(maxY, ndcY);
    nearest = reversed ? Math.max(nearest, depth) : Math.min(nearest, depth);
  }
  if (maxX < -1 || minX > 1 || maxY < -1 || minY > 1) return false;
  minX = Math.max(-1, minX);
  maxX = Math.min(1, maxX);
  minY = Math.max(-1, minY);
  maxY = Math.min(1, maxY);

  const base = layout.levels[0]!;
  let x0 = Math.max(0, Math.min(base.width - 1, Math.floor((minX * 0.5 + 0.5) * base.width)));
  let x1 = Math.max(x0, Math.min(base.width - 1, Math.ceil((maxX * 0.5 + 0.5) * base.width) - 1));
  let y0 = Math.max(0, Math.min(base.height - 1, Math.floor((0.5 - maxY * 0.5) * base.height)));
  let y1 = Math.max(y0, Math.min(base.height - 1, Math.ceil((0.5 - minY * 0.5) * base.height) - 1));
  let levelIndex = 0;
  while ((x1 - x0 > 1 || y1 - y0 > 1) && levelIndex < layout.levels.length - 1) {
    x0 = Math.floor(x0 / 2);
    x1 = Math.floor(x1 / 2);
    y0 = Math.floor(y0 / 2);
    y1 = Math.floor(y1 / 2);
    levelIndex += 1;
  }
  const level = layout.levels[levelIndex]!;
  x0 = Math.min(x0, level.width - 1);
  x1 = Math.min(x1, level.width - 1);
  y0 = Math.min(y0, level.height - 1);
  y1 = Math.min(y1, level.height - 1);
  // Selection stops when each endpoint pair differs by at most one, or at the
  // 1 × 1 level. Clamping cannot widen the range, so at most 2 × 2 texels are read.
  let farthest = reversed ? Infinity : -Infinity;
  for (let dy = 0; dy < 2 && y0 + dy <= y1; dy += 1) {
    const y = y0 + dy;
    for (let dx = 0; dx < 2 && x0 + dx <= x1; dx += 1) {
      const x = x0 + dx;
      const depth = data[level.offset + y * level.width + x]!;
      farthest = reversed ? Math.min(farthest, depth) : Math.max(farthest, depth);
    }
  }
  return reversed ? nearest < farthest - epsilon : nearest > farthest + epsilon;
}
