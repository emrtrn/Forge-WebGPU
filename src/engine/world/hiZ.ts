/** CPU Hi-Z reference: farthest-depth reduction and conservative sphere occlusion. */
export interface HiZLevel { readonly width: number; readonly height: number; readonly data: Float32Array }
export interface HiZ { readonly reversed: boolean; readonly levels: readonly HiZLevel[] }

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
