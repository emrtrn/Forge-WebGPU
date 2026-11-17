// Procedural geometry of `forge.shape` without three (plan 5c R1): the HLOD
// builder bakes shapes in Node. Each generator follows three r187's
// BoxGeometry / SphereGeometry / CylinderGeometry / ConeGeometry /
// PlaneGeometry vertex order, normals and indices with the sizes and segment
// counts of render/resources/shapes.ts; a render test checks the two agree.
// UVs are left out: proxies are untextured.

export type ShapePrimitiveName = "cube" | "sphere" | "cylinder" | "cone" | "plane";

/** Forge's SHAPE_PRIMITIVE_SIZE (the schema's SHAPE_BASE_SIZE). */
export const SHAPE_SOLID_SIZE = 0.5;
/** Forge's SHAPE_PLANE_SIZE. */
export const SHAPE_PLANE_SIZE = 1;
export const SHAPE_RADIAL_SEGMENTS = 32;
export const SHAPE_SPHERE_HEIGHT_SEGMENTS = 16;

export interface ShapeMesh {
  /** xyz per vertex. */
  readonly positions: Float32Array;
  readonly normals: Float32Array;
  readonly indices: Uint32Array;
}

interface Builder { positions: number[]; normals: number[]; indices: number[] }
const builder = (): Builder => ({ positions: [], normals: [], indices: [] });
const finish = (b: Builder): ShapeMesh => ({
  positions: new Float32Array(b.positions), normals: new Float32Array(b.normals), indices: new Uint32Array(b.indices),
});

function box(size: number): ShapeMesh {
  const b = builder();
  const axes = { x: 0, y: 1, z: 2 } as const;
  type Axis = keyof typeof axes;
  const plane = (u: Axis, v: Axis, w: Axis, udir: number, vdir: number, width: number, height: number, depth: number): void => {
    const start = b.positions.length / 3;
    for (let iy = 0; iy < 2; iy += 1) {
      const y = iy * height - height / 2;
      for (let ix = 0; ix < 2; ix += 1) {
        const x = ix * width - width / 2;
        const vertex = [0, 0, 0], normal = [0, 0, 0];
        vertex[axes[u]] = x * udir; vertex[axes[v]] = y * vdir; vertex[axes[w]] = depth / 2;
        normal[axes[w]] = depth > 0 ? 1 : -1;
        b.positions.push(...vertex); b.normals.push(...normal);
      }
    }
    const a = start, bb = start + 2, c = start + 3, d = start + 1;
    b.indices.push(a, bb, d, bb, c, d);
  };
  plane("z", "y", "x", -1, -1, size, size, size);
  plane("z", "y", "x", 1, -1, size, size, -size);
  plane("x", "z", "y", 1, 1, size, size, size);
  plane("x", "z", "y", 1, -1, size, size, -size);
  plane("x", "y", "z", 1, -1, size, size, size);
  plane("x", "y", "z", -1, -1, size, size, -size);
  return finish(b);
}

function sphere(radius: number, widthSegments: number, heightSegments: number): ShapeMesh {
  const b = builder();
  const grid: number[][] = [];
  let index = 0;
  for (let iy = 0; iy <= heightSegments; iy += 1) {
    const row: number[] = [];
    const theta = (iy / heightSegments) * Math.PI;
    const y = radius * Math.cos(theta);
    const ring = Math.sqrt(radius * radius - y * y);
    for (let ix = 0; ix <= widthSegments; ix += 1) {
      const phi = (ix / widthSegments) * Math.PI * 2;
      const x = -ring * Math.cos(phi), z = ring * Math.sin(phi);
      b.positions.push(x, y, z);
      const length = Math.hypot(x, y, z) || 1;
      b.normals.push(x / length, y / length, z / length);
      row.push(index++);
    }
    grid.push(row);
  }
  for (let iy = 0; iy < heightSegments; iy += 1) {
    for (let ix = 0; ix < widthSegments; ix += 1) {
      const a = grid[iy]![ix + 1]!, bb = grid[iy]![ix]!, c = grid[iy + 1]![ix]!, d = grid[iy + 1]![ix + 1]!;
      if (iy !== 0) b.indices.push(a, bb, d);
      if (iy !== heightSegments - 1) b.indices.push(bb, c, d);
    }
  }
  return finish(b);
}

function cylinder(radiusTop: number, radiusBottom: number, height: number, radialSegments: number): ShapeMesh {
  const b = builder();
  const half = height / 2;
  const slope = (radiusBottom - radiusTop) / height;
  let index = 0;
  const rows: number[][] = [];
  for (let y = 0; y <= 1; y += 1) {
    const row: number[] = [];
    const radius = y * (radiusBottom - radiusTop) + radiusTop;
    for (let x = 0; x <= radialSegments; x += 1) {
      const theta = (x / radialSegments) * Math.PI * 2;
      const sin = Math.sin(theta), cos = Math.cos(theta);
      b.positions.push(radius * sin, -y * height + half, radius * cos);
      const length = Math.hypot(sin, slope, cos) || 1;
      b.normals.push(sin / length, slope / length, cos / length);
      row.push(index++);
    }
    rows.push(row);
  }
  for (let x = 0; x < radialSegments; x += 1) {
    const a = rows[0]![x]!, bb = rows[1]![x]!, c = rows[1]![x + 1]!, d = rows[0]![x + 1]!;
    if (radiusTop > 0) b.indices.push(a, bb, d);
    if (radiusBottom > 0) b.indices.push(bb, c, d);
  }
  const cap = (top: boolean): void => {
    const radius = top ? radiusTop : radiusBottom, sign = top ? 1 : -1;
    const centers = index;
    for (let x = 1; x <= radialSegments; x += 1) { b.positions.push(0, half * sign, 0); b.normals.push(0, sign, 0); index += 1; }
    const ring = index;
    for (let x = 0; x <= radialSegments; x += 1) {
      const theta = (x / radialSegments) * Math.PI * 2;
      b.positions.push(radius * Math.sin(theta), half * sign, radius * Math.cos(theta));
      b.normals.push(0, sign, 0);
      index += 1;
    }
    for (let x = 0; x < radialSegments; x += 1) {
      const c = centers + x, i = ring + x;
      if (top) b.indices.push(i, i + 1, c);
      else b.indices.push(i + 1, i, c);
    }
  };
  if (radiusTop > 0) cap(true);
  if (radiusBottom > 0) cap(false);
  return finish(b);
}

/** PlaneGeometry(size, size) faces +Z; shapes.ts lays it on XZ with rotateX(-π/2). */
function plane(size: number): ShapeMesh {
  const half = size / 2;
  const cos = Math.cos(-Math.PI / 2), sin = Math.sin(-Math.PI / 2);
  const b = builder();
  for (let iy = 0; iy < 2; iy += 1) {
    const y = iy * size - half;
    for (let ix = 0; ix < 2; ix += 1) {
      const x = ix * size - half;
      const py = -y, pz = 0;
      b.positions.push(x, cos * py - sin * pz, sin * py + cos * pz);
      const ny = cos * 0 - sin * 1, nz = sin * 0 + cos * 1;
      const length = Math.hypot(ny, nz);
      b.normals.push(0, ny / length, nz / length);
    }
  }
  b.indices.push(0, 2, 1, 2, 3, 1);
  return finish(b);
}

export function shapeMesh(primitive: ShapePrimitiveName): ShapeMesh {
  const size = SHAPE_SOLID_SIZE;
  switch (primitive) {
    case "cube": return box(size);
    case "sphere": return sphere(size / 2, SHAPE_RADIAL_SEGMENTS, SHAPE_SPHERE_HEIGHT_SEGMENTS);
    case "cylinder": return cylinder(size / 2, size / 2, size, SHAPE_RADIAL_SEGMENTS);
    case "cone": return cylinder(0, size / 2, size, SHAPE_RADIAL_SEGMENTS);
    case "plane": return plane(SHAPE_PLANE_SIZE);
  }
}

/** Half the bounding box diagonal, as the HLOD builder measures model assets. */
export function shapeBoundingRadius(primitive: ShapePrimitiveName): number {
  const { positions } = shapeMesh(primitive);
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  for (let index = 0; index < positions.length; index += 1) {
    const axis = index % 3, value = positions[index]!;
    if (value < min[axis]!) min[axis] = value;
    if (value > max[axis]!) max[axis] = value;
  }
  return Math.hypot(max[0]! - min[0]!, max[1]! - min[1]!, max[2]! - min[2]!) / 2;
}

/** Whether the shape is seen from both sides (shape/render.ts: the plane is). */
export const shapeDoubleSided = (primitive: ShapePrimitiveName): boolean => primitive === "plane";
