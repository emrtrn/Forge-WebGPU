import { MeshBuilder } from "../../src/engine/procgen/mesh.ts";
import type { ProcMesh } from "../../src/engine/procgen/mesh.ts";
import { noise3 } from "../../src/engine/procgen/noise.ts";
import { createStream } from "../../src/engine/procgen/random.ts";
import { pointAt, unit } from "../../src/engine/procgen/vector.ts";
import type { Vec3 } from "../../src/engine/procgen/vector.ts";

interface RootSite {
  /** Original trunk pivot in world space. Mesh vertices are relative to it. */
  readonly origin: Vec3;
  readonly scale: number;
  readonly yaw: number;
  readonly seed: number;
  heightAt(x: number, z: number): number | null;
}

interface RootArm {
  readonly angle: number;
  readonly start: number;
  readonly length: number;
  readonly width: number;
  readonly height: number;
  readonly curve: number;
  readonly phase: number;
}

const TAU = Math.PI * 2;
const LEAF_TONES = [
  [0.36, 0.21, 0.09], [0.24, 0.11, 0.041], [0.44, 0.28, 0.12], [0.32, 0.18, 0.073],
] as const;

function ground(site: RootSite, x: number, z: number): number {
  const height = site.heightAt(site.origin[0] + x, site.origin[2] + z);
  if (height === null) throw new Error("Surface root extends past the sampled terrain");
  return height - site.origin[1];
}

/** Small folded leaves following the ground under the root gaps and along stone edges. */
export function bakeRootLitter(
  site: RootSite,
  centres: readonly { readonly x: number; readonly z: number; readonly radius: number }[],
  coarse: boolean,
): ProcMesh {
  const rng = createStream(site.seed, "forest-ground/root-litter");
  const mesh = new MeshBuilder();
  for (const centre of centres) {
    const count = coarse ? 4 : 12;
    for (let leaf = 0; leaf < count; leaf++) {
      const theta = rng.range(0, TAU), distance = Math.sqrt(rng.next()) * centre.radius;
      const x = centre.x + Math.cos(theta) * distance, z = centre.z + Math.sin(theta) * distance;
      const a = rng.range(0, TAU), c = Math.cos(a), s = Math.sin(a);
      const length = site.scale * rng.range(0.023, 0.056), width = length * rng.range(0.25, 0.52);
      const rise = rng.range(0.003, 0.018);
      const tone = LEAF_TONES[rng.int(0, LEAF_TONES.length - 1)]!;
      const add = (u: number, v: number, lift: number, shade: number): number => {
        const lx = x + c * u - s * v, lz = z + s * u + c * v;
        return mesh.addVertex([lx, ground(site, lx, lz) + rise + lift, lz], undefined,
          [tone[0] * shade, tone[1] * shade, tone[2] * shade, 1]);
      };
      const base = add(-length, 0, 0, 0.79);
      const left = add(-0.12 * length, width, 0.004, 0.91);
      const tip = add(length, width * 0.13, 0.008, 0.81);
      const right = add(0.16 * length, -width * 0.83, 0.002, 0.76);
      const ridge = add(0, 0, 0.009, 1.04);
      mesh.addTriangle(base, left, ridge);
      mesh.addTriangle(left, tip, ridge);
      mesh.addTriangle(tip, right, ridge);
      mesh.addTriangle(right, base, ridge);
    }
  }
  return mesh.build();
}

/** Bark saddles open underneath. The edges and tips follow the same terrain query as placement. */
export function bakeForestSurfaceRoots(site: RootSite, coarse = false): {
  wood: ProcMesh;
  uvs: Float32Array;
  litter: ProcMesh;
  arms: readonly RootArm[];
  tipClearances: readonly number[];
} {
  const rng = createStream(site.seed, "forest-ground/surface-roots");
  const rootCount = rng.int(4, 6);
  const startAngle = site.yaw + rng.range(0, TAU);
  const arms: RootArm[] = Array.from({ length: rootCount }, (_, i) => {
    const long = i === 0 || i === 2;
    return {
      angle: startAngle + i * TAU / rootCount + rng.range(-0.32, 0.32),
      start: 0.13 * site.scale,
      length: site.scale * (long ? rng.range(1.12, 1.81) : rng.range(0.68, 1.29)),
      width: site.scale * (long ? rng.range(0.22, 0.33) : rng.range(0.13, 0.22)),
      height: site.scale * rng.range(0.44, 0.61),
      curve: rng.range(-0.31, 0.37),
      phase: rng.next(),
    };
  });
  const wood = new MeshBuilder();
  const uvs: number[] = [];
  const tipClearances: number[] = [];
  const spans = coarse ? 6 : 12;
  const across = coarse ? 4 : 8;
  const edgeBurial = 0.036 * site.scale;

  for (const arm of arms) {
    let previous: number[] = [];
    for (let i = 0; i <= spans; i++) {
      const t = i / spans;
      const angle = arm.angle + arm.curve * t * t;
      const radial = arm.start + t * arm.length;
      const x = Math.cos(angle) * radial, z = Math.sin(angle) * radial;
      const twist = angle + arm.curve * 0.43 * t;
      const width = arm.width * (0.055 + 0.945 * (1 - t) ** 1.05);
      const ridge = arm.height * (0.66 * (1 - t) ** 3.1 + 0.34 * (1 - t) ** 1.5);
      const ring: number[] = [];
      for (let j = 0; j <= across; j++) {
        const u = j / across, side = u * 2 - 1;
        const lateral = width * side * (1 + 0.17 * Math.sin(t * 6 + arm.phase * TAU) * side);
        const rx = x - Math.sin(twist) * lateral, rz = z + Math.cos(twist) * lateral;
        const terrain = ground(site, rx, rz);
        const lift = ridge * Math.max(0, Math.cos(side * Math.PI / 2)) ** 1.13;
        const y = terrain + lift - edgeBurial;
        ring.push(wood.addVertex([rx, y, rz]));
        uvs.push(arm.phase + (u - 0.5) * 0.33, arm.phase * 0.13 + radial / (2.2 * site.scale));
        if (i === spans) tipClearances.push(y - terrain);
        if (i > 0 && j > 0) {
          wood.addTriangle(previous[j - 1]!, previous[j]!, ring[j - 1]!);
          wood.addTriangle(previous[j]!, ring[j]!, ring[j - 1]!);
        }
      }
      previous = ring;
    }
  }

  const gaps = arms.map((arm, i) => {
    const next = i === arms.length - 1 ? arms[0]!.angle + TAU : arms[i + 1]!.angle;
    const angle = (arm.angle + next) * 0.5, distance = site.scale * rng.range(0.48, 0.81);
    return { x: distance * Math.cos(angle), z: distance * Math.sin(angle), radius: site.scale * rng.range(0.18, 0.33) };
  });
  const bark = wood.build();
  for (let i = 0; i < bark.positions.length / 3; i++) {
    const [x, , z] = pointAt(bark.positions, i);
    const distance = Math.hypot(x, z);
    // Ease the lighting from the vertical trunk to the rounded root saddle.
    const t = Math.max(0, Math.min(1, (0.75 - distance / site.scale) / 0.52));
    const blend = 0.85 * t * t * (3 - 2 * t);
    const [nx, ny, nz] = pointAt(bark.normals, i);
    const [rx, ry, rz] = unit([x, distance * 0.28, z]);
    bark.normals.set(unit([
      nx * (1 - blend) + rx * blend,
      ny * (1 - blend) + ry * blend,
      nz * (1 - blend) + rz * blend,
    ]), i * 3);
  }
  return { wood: bark, uvs: new Float32Array(uvs), litter: bakeRootLitter(site, gaps, coarse), arms, tipClearances };
}

/** Conform a broken moss patch to the baked stone's LOD0 triangles. The output
 * uses the stone's world-space pivot with its rotation and scale baked in. */
export function bakeForestStoneMoss(site: RootSite, stone: ProcMesh, matrix: readonly number[]): ProcMesh {
  const mesh = new MeshBuilder();
  const rng = createStream(site.seed, "forest-ground/stone-moss");
  const bearing = rng.range(0, TAU), c = Math.cos(bearing), s = Math.sin(bearing);
  const transform = ([x, y, z]: Vec3): Vec3 => [
    matrix[0]! * x + matrix[4]! * y + matrix[8]! * z,
    matrix[1]! * x + matrix[5]! * y + matrix[9]! * z,
    matrix[2]! * x + matrix[6]! * y + matrix[10]! * z,
  ];
  const field = ([x, y, z]: Vec3, frequency: number) => noise3(
    x * frequency / site.scale, y * frequency / site.scale, z * frequency / site.scale, site.seed,
  );
  const add = (p: Vec3, n: Vec3): number => {
    const tint = 0.88 + 0.43 * field(p, 38) + 0.24 * field(p, 71);
    const offset = 0.0025 + 0.003 * (0.5 + field(p, 42));
    return mesh.addVertex([p[0] + n[0] * offset, p[1] + n[1] * offset, p[2] + n[2] * offset], n,
      [0.075 * tint, 0.117 * tint, 0.027 * tint, 1]);
  };
  const divisions = 4;
  for (let i = 0; i < stone.indices.length; i += 3) {
    const corners = Array.from(stone.indices.subarray(i, i + 3));
    const positions = corners.map(index => transform(pointAt(stone.positions, index)));
    const normals = corners.map(index => unit(transform(pointAt(stone.normals, index))));
    if (normals.every(normal => normal[1] < 0.24)) continue;
    const lerpTriangle = (data: Vec3[], u: number, v: number): Vec3 => [0, 1, 2].map(axis =>
      (data[0]![axis]! * (divisions - u - v) + data[1]![axis]! * u + data[2]![axis]! * v) / divisions,
    ) as Vec3;
    const emit = (a: [number, number], b: [number, number], d: [number, number]): void => {
      const u = (a[0] + b[0] + d[0]) / 3, v = (a[1] + b[1] + d[1]) / 3;
      const p = lerpTriangle(positions, u, v);
      if (lerpTriangle(normals, u, v)[1] < 0.24 || p[1] - ground(site, p[0], p[2]) < 0.018) return;
      const x = (c * p[0] + s * p[2]) / site.scale, z = (-s * p[0] + c * p[2]) / site.scale;
      const main = ((x - 0.17) / 0.40) ** 2 + ((z + 0.10) / 0.31) ** 2;
      const lobe = ((x + 0.29) / 0.18) ** 2 + ((z - 0.19) / 0.21) ** 2;
      const footprint = Math.min(main, lobe);
      if (footprint > 0.89 + 1.5 * field(p, 6) + 0.67 * field(p, 26) ||
          (footprint > 0.35 && field(p, 43) < -0.20)) return;
      const index = ([du, dv]: [number, number]) => add(lerpTriangle(positions, du, dv), unit(lerpTriangle(normals, du, dv)));
      mesh.addTriangle(index(a), index(b), index(d));
    };
    for (let u = 0; u < divisions; u++) {
      for (let v = 0; v < divisions - u; v++) {
        emit([u, v], [u + 1, v], [u, v + 1]);
        if (u + v < divisions - 1) emit([u + 1, v], [u + 1, v + 1], [u, v + 1]);
      }
    }
  }
  return mesh.build();
}
