// Bake the starter Forest ground foliage: node tools/procgen/forestGroundDetails.ts
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { writeGlb } from "../../src/engine/procgen/glb.ts";
import { MeshBuilder, validateMesh, type ProcMesh } from "../../src/engine/procgen/mesh.ts";
import { createStream } from "../../src/engine/procgen/random.ts";
import { cross, sub, unit, type Vec3 } from "../../src/engine/procgen/vector.ts";
import { GENERATED_MODEL_OPTIMIZE, outputId } from "./outputs.ts";

const directory = new URL("../../content/packs/starter/procgen/ground/details/", import.meta.url);
const assetId = (name: string) => outputId("starter/forest-ground", name);
const write = (file: string, data: unknown) =>
  writeFileSync(new URL(file, directory), JSON.stringify(data, null, 2) + "\n");

function fernCluster(seed: number, pairs: number): ProcMesh {
  const rng = createStream(seed, "fern");
  const mesh = new MeshBuilder();
  const plants: Vec3[] = seed === 71
    ? [[-0.31, 1, -0.18], [0.22, 0.83, 0.18], [0.43, 0.59, -0.22]]
    : [[0.14, 1.06, -0.25], [-0.32, 0.72, 0.23]];
  for (const [x, scale, z] of plants) {
    const rotation = rng.range(0, Math.PI * 2);
    for (let i = 0; i < 6; i++) {
      const heading = rotation + i * Math.PI / 3 + rng.range(-0.28, 0.28);
      const length = scale * rng.range(0.43, 0.67);
      const rise = scale * rng.range(0.33, 0.59);
      const tone = rng.range(0.72, 1.23);
      const plantPoint = (t: number, across = 0, lift = 0): Vec3 => [
        x + Math.cos(heading) * length * t - Math.sin(heading) * across,
        -0.055 + rise * (2.55 * t - 1.95 * t * t) + lift,
        z + Math.sin(heading) * length * t + Math.cos(heading) * across,
      ];
      const leaf = (t: number, across: number, lift: number, value: number) =>
        mesh.addVertex(plantPoint(t, across, lift), [0, 1, 0], [0.13 * value, 0.25 * value, 0.045 * value, 1]);
      const stemLeft = leaf(0, 0.006 * scale, 0, tone * 0.62);
      const stemRight = leaf(0, -0.006 * scale, 0, tone * 0.62);
      const firstLeft = leaf(0.16, 0.006 * scale, 0, tone * 0.85);
      const firstRight = leaf(0.16, -0.006 * scale, 0, tone * 0.85);
      mesh.addTriangle(stemLeft, firstLeft, stemRight);
      mesh.addTriangle(firstLeft, firstRight, stemRight);
      for (let p = 0; p < pairs; p++) {
        const t = 0.16 + p * (0.75 / pairs);
        const end = t + 0.75 / pairs;
        const rachis = 0.007 * (1 - t) * scale;
        const a = leaf(t, rachis, 0, tone * 0.85), b = leaf(t, -rachis, 0, tone * 0.85);
        const c = leaf(end, rachis * 0.86, 0, tone), d = leaf(end, -rachis * 0.86, 0, tone);
        mesh.addTriangle(a, c, b);
        mesh.addTriangle(c, d, b);
        const spread = scale * 0.147 * Math.sin(Math.PI * t ** 0.7) * (1 - 0.43 * t);
        for (const side of [-1, 1]) {
          const base = leaf(t, 0, 0, tone * 0.66);
          const wide = leaf(t + 0.006, side * spread * 0.42, -0.01, tone);
          const tip = leaf(t + 0.11, side * spread, -0.027, tone * 1.18);
          const back = leaf(t + 0.074, side * spread * 0.49, 0.014, tone * 0.88);
          if (side > 0) {
            mesh.addTriangle(base, wide, tip);
            mesh.addTriangle(base, tip, back);
          } else {
            mesh.addTriangle(base, tip, wide);
            mesh.addTriangle(base, back, tip);
          }
        }
      }
      const left = leaf(0.91, 0.009, 0, tone), right = leaf(0.91, -0.009, 0, tone);
      mesh.addTriangle(left, leaf(1, 0, -0.018, tone), right);
    }
  }
  return mesh.build();
}

/** Closed, tapering bark tubes with lighter, broken ends. */
function branch(seed: number, main: readonly Vec3[], forks: readonly (readonly Vec3[])[]): ProcMesh {
  const rng = createStream(seed, "branch");
  const mesh = new MeshBuilder();
  const sides = 8;
  for (const [branchIndex, knots] of [main, ...forks].entries()) {
    const radius = branchIndex === 0 ? rng.range(0.038, 0.055) : rng.range(0.016, 0.027);
    const grain = Array.from({ length: sides }, () => rng.range(0.56, 1.35));
    const lowPath = knots.map(([x, y, z]): Vec3 => [x, y * 0.53, z]);
    const path = [lowPath[0]!];
    for (let i = 1; i < lowPath.length; i++) {
      const [ax, ay, az] = lowPath[i - 1]!, [bx, by, bz] = lowPath[i]!;
      const t = rng.range(0.37, 0.66);
      path.push([ax + (bx - ax) * t, ay + (by - ay) * t, az + (bz - az) * t], lowPath[i]!);
    }
    const rings: number[][] = [];
    for (const [i, p] of path.entries()) {
      const tangent = unit(sub(path[Math.min(i + 1, path.length - 1)]!, path[Math.max(0, i - 1)]!));
      const side = unit(cross([0, 1, 0], tangent));
      const up = cross(tangent, side);
      const taper = 1 - i / (path.length - 1) * 0.72;
      const ring = Array.from({ length: sides }, (_, j) => {
        const a = j / sides * Math.PI * 2;
        const normal: Vec3 = [
          side[0] * Math.cos(a) + up[0] * Math.sin(a),
          side[1] * Math.cos(a) + up[1] * Math.sin(a),
          side[2] * Math.cos(a) + up[2] * Math.sin(a),
        ];
        const r = taper * radius * rng.range(0.85, 1.17);
        const tone = grain[j]! * rng.range(0.65, 1.34);
        return mesh.addVertex([p[0] + r * normal[0], p[1] + r * normal[1], p[2] + r * normal[2]],
          normal, [0.24 * tone, 0.152 * tone, 0.086 * tone, 1]);
      });
      const last = rings.at(-1);
      if (last) for (let j = 0; j < sides; j++) {
        const next = (j + 1) % sides;
        mesh.addTriangle(last[j]!, last[next]!, ring[j]!);
        mesh.addTriangle(last[next]!, ring[next]!, ring[j]!);
      }
      if (i === 0 || i === path.length - 1) {
        const atEnd = i > 0;
        const tip: Vec3 = [p[0] + 0.018 * tangent[0], p[1] + 0.018 * tangent[1], p[2] + 0.018 * tangent[2]];
        const cap = mesh.addVertex(atEnd ? tip : p, atEnd ? tangent : unit(sub(p, path[1]!)), [0.36, 0.26, 0.15, 1]);
        for (let j = 0; j < sides; j++) {
          const next = (j + 1) % sides;
          if (atEnd) mesh.addTriangle(ring[j]!, ring[next]!, cap);
          else mesh.addTriangle(ring[next]!, ring[j]!, cap);
        }
      }
      rings.push(ring);
    }
  }
  return mesh.build();
}

function model(name: string, mesh: ProcMesh, doubleSided = false): string {
  const errors = validateMesh(mesh);
  if (errors.length > 0) throw new Error(`${name}: ${errors.join(", ")}`);
  const id = assetId(name);
  writeFileSync(new URL(`${name}.glb`, directory), writeGlb({
    nodes: [{ name, primitives: [{ mesh, material: 0 }] }],
    materials: [{ name, roughness: 0.94, doubleSided }],
    generator: "Forge Forest Ground",
  }));
  write(`${name}.glb.meta.json`, {
    schema: "forge.assetMeta/1", id, type: "forge.model@2", license: "LicenseRef-forge-project",
    source: { origin: "Forge procedural bake: tools/procgen/forestGroundDetails.ts", author: "Forge", url: "" },
    import: { optimize: GENERATED_MODEL_OPTIMIZE },
  });
  return id;
}

function foliage(name: string, data: Record<string, unknown>): void {
  write(`${name}.foliagetype.json`, {
    schema: "forge.foliageType/1", id: assetId(`${name}/foliage`),
    randomYaw: true, alignToNormal: true, castShadow: true, collision: false, ...data,
  });
}

mkdirSync(directory, { recursive: true });
for (const seed of [71, 93]) {
  const name = `ForestFern_${seed}`;
  foliage(name, {
    mesh: model(name, fernCluster(seed, 8), true),
    lods: [{ mesh: model(`${name}_lod1`, fernCluster(seed, 4), true), screenSize: 0.055 }],
    radius: 0.85, scaleMin: 0.77, scaleMax: 1.32, slopeMax: 29,
    cullStart: 29, cullEnd: 48,
    sway: { enabled: true, source: "height", amplitude: 0.1, height: 0.34, frequency: 0.78 },
  });
}
const crooked = [[-0.88, 0.027, -0.20], [-0.53, 0.062, -0.10], [-0.16, 0.087, -0.12], [0.34, 0.039, 0.02], [0.79, 0.033, 0.15]] satisfies Vec3[];
const forked = [[-0.71, 0.013, 0.03], [-0.37, 0.075, 0.07], [0.01, 0.049, -0.08], [0.41, 0.046, -0.19], [0.62, 0.027, -0.38]] satisfies Vec3[];
const snapped = [[-0.58, 0.038, 0.14], [-0.24, 0.055, -0.03], [0.19, 0.032, -0.03], [0.49, 0.033, 0.06]] satisfies Vec3[];
const branches = [
  branch(31, crooked, [[crooked[2]!, [0.11, 0.067, 0.24], [0.4, 0.027, 0.46]]]),
  branch(53, forked, [[forked[2]!, [0.32, 0.09, 0.17], [0.64, 0.03, 0.27]], [forked[1]!, [-0.10, 0.077, 0.37], [0.12, 0.026, 0.48]]]),
  branch(73, snapped, [[snapped[1]!, [0.01, 0.085, -0.12], [0.13, 0.042, -0.31]]]),
];
for (const [index, mesh] of branches.entries()) {
  const name = `ForestBranch_${index + 1}`;
  foliage(name, {
    mesh: model(name, mesh), radius: 0.7, scaleMin: 0.68, scaleMax: 1.24, slopeMax: 24,
    zOffsetMin: -0.026, zOffsetMax: -0.012, cullStart: 32, cullEnd: 48,
  });
}

for (const variant of [1, 2, 3]) {
  const rock = JSON.parse(readFileSync(new URL(`../../rocks/RockRounded/RockRounded_${variant}.foliagetype.json`, directory), "utf8"));
  foliage(`ForestStone_${variant}`, {
    mesh: rock.mesh, lods: rock.lods.map(({ mesh }: { mesh: string }, i: number) => ({ mesh, screenSize: i === 0 ? 0.065 : 0.027 })),
    radius: 0.38, scaleMin: 0.19, scaleMax: 0.40, slopeMax: 30,
    zOffsetMin: -0.096, zOffsetMax: -0.068, cullStart: 32, cullEnd: 48,
  });
}
