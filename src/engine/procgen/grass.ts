import { MeshBuilder } from "./mesh.ts";
import { createStream } from "./random.ts";
import type { Vec3 } from "./vector.ts";

export interface GrassShape {
  readonly height: number;
  readonly width: number;
  readonly bend: number;
  readonly bladeCount: number;
}

const FULL_SECTIONS = [0, 0.22, 0.46, 0.68, 0.85];
const COARSE_SECTIONS = [0, 0.57];

/** Curved, tapering ribbons sharing a root zone, with a nested low-poly silhouette. */
export function generateGrass(shape: GrassShape, seed: number) {
  const stream = createStream(seed, "grass");
  const direction = stream.range(0, Math.PI * 2);
  const count = Math.round(shape.bladeCount);
  const blades = Array.from({ length: count }, (_, index) => {
    const rng = stream.fork(String(index));
    const angle = direction + (index + rng.range(-0.38, 0.38)) * (Math.PI * 2 / count);
    const height = shape.height * rng.range(0.62, 1.15);
    return {
      angle, height, width: shape.width * rng.range(0.69, 1.16),
      reach: shape.bend * height * rng.range(0.42, 1.35),
      root: shape.width * rng.range(0.05, 0.75),
      droop: shape.bend * rng.range(0.12, 0.52),
      phase: rng.next(), shade: rng.range(0.70, 1.23),
    };
  });

  const coarseCount = Math.min(count, 6);
  const coarse = Array.from({ length: coarseCount }, (_, i) => blades[Math.floor(i * count / coarseCount)]!);
  function build(selected: typeof blades, sections: number[]) {
    const builder = new MeshBuilder(), wind: number[] = [];
    // Coarse ribbons recover part of the area of the omitted blades.
    const widthScale = selected === blades ? 1 : Math.min(1.9, count / coarseCount * 1.08);
    for (const blade of selected) {
      const x = Math.cos(blade.angle), z = Math.sin(blade.angle);
      const vertex = (t: number, side: number) => {
        const radial = blade.root + blade.reach * t ** 1.8;
        const across = side * blade.width * widthScale * (0.38 + 1.35 * t) * (1 - t) ** 0.82 * 0.5;
        const y = blade.height * (t - blade.droop * t ** 3);
        const position: Vec3 = [x * radial - z * across, y, z * radial + x * across];
        const shade = blade.shade;
        wind.push(t * t, 0.32 * t * t, blade.phase, 0.15 * t ** 3);
        return builder.addVertex(position, undefined, [
          shade * (0.055 + 0.13 * t), shade * (0.097 + 0.21 * t), shade * (0.018 + 0.039 * t), 1,
        ]);
      };
      let left = vertex(0, -1), right = vertex(0, 1);
      for (const t of sections.slice(1)) {
        const nextLeft = vertex(t, -1), nextRight = vertex(t, 1);
        builder.addTriangle(left, nextLeft, right);
        builder.addTriangle(right, nextLeft, nextRight);
        left = nextLeft;
        right = nextRight;
      }
      builder.addTriangle(left, vertex(1, 0), right);
    }
    return { mesh: builder.build(), wind: new Float32Array(wind) };
  }
  return [build(blades, FULL_SECTIONS), build(coarse, COARSE_SECTIONS)] as const;
}
