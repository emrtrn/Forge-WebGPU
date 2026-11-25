// Mesh building blocks of a generated tree: vertices with wind and leaf
// attributes, and the tube around a stem.

import { MeshBuilder } from "../mesh.ts";
import type { ProcMesh } from "../mesh.ts";
import { hashString } from "../random.ts";
import { cross, dot, unit, type Vec3 } from "../vector.ts";
import { addScaled, perpendicular, type StemSample, type TreeStem } from "./stems.ts";

export interface TreeMeshAttributes {
  /** Per vertex: trunk bend, branch sway, phase, flutter. */
  wind: Float32Array;
  /** Per vertex: a leaf's shedding threshold or the wood's share of twig colour, then the crown light. */
  leaf: Float32Array;
}

export type TreeMesh = ProcMesh & { uvs: Float32Array; attributes: TreeMeshAttributes };

export interface TreeLodMesh {
  wood: TreeMesh;
  leaves: TreeMesh | null;
}

export interface Tube { index: number; segments: number; spans: number }

const TAU = 2 * Math.PI;
export const hash01 = (id: string): number => hashString(id) / 4294967296;

export class TreeMeshBuilder {
  readonly geometry = new MeshBuilder();
  readonly uvs: number[] = [];
  readonly wind: number[] = [];
  readonly leaf: number[] = [];

  addVertex(position: Vec3, normal: Vec3, u: number, v: number, wind: readonly number[], leaf: readonly [number, number]): number {
    this.uvs.push(u, v);
    this.wind.push(...wind);
    this.leaf.push(...leaf);
    return this.geometry.addVertex(position, normal);
  }

  build(): TreeMesh {
    return { ...this.geometry.build(), uvs: new Float32Array(this.uvs), attributes: { wind: new Float32Array(this.wind), leaf: new Float32Array(this.leaf) } };
  }
}

function transport(normal: Vec3, from: Vec3, to: Vec3): Vec3 {
  // Minimal rotation taking the previous tangent to the next tangent.
  const cosine = dot(from, to);
  const axis = cross(from, to);
  if (cosine > -0.999999) {
    const first = cross(axis, normal);
    normal = addScaled(addScaled(normal, first, 1), cross(axis, first), 1 / (1 + cosine));
  }
  return unit(addScaled(normal, to, -dot(normal, to)));
}

/** What a tube's vertex carries, from its place, the ring's share of the stem and the ring's radius. */
export type TubeWeights = (position: Vec3, t: number, radius: number) => { wind: readonly number[]; leaf: readonly [number, number] };

export function addTube(
  builder: TreeMeshBuilder, stem: TreeStem, { segments, spans }: Tube, sample: (t: number) => StemSample, weights: TubeWeights,
): void {
  const circumference = TAU * stem.radii[0]!;
  let lastRing = 0;
  let { point, tangent, radius } = sample(0);
  let normal = perpendicular(tangent);
  const vertex = (position: Vec3, direction: Vec3, u: number, t: number): number => {
    const { wind, leaf } = weights(position, t, radius);
    return builder.addVertex(position, direction, u, t * stem.length / circumference, wind, leaf);
  };
  for (let i = 0; i <= spans; i++) {
    const t = i / spans;
    if (i > 0) {
      const next = sample(t);
      normal = transport(normal, tangent, next.tangent);
      ({ point, tangent, radius } = next);
    }
    const binormal = cross(tangent, normal);
    // Keep rings distinct when a tiny radius would round off in Float32 positions.
    const representableRadius = Math.max(radius, Math.max(...point.map(Math.abs)) * 2 ** -22);
    let ring = 0;
    for (let j = 0; j <= segments; j++) {
      const angle = TAU * (j % segments) / segments;
      const radial = addScaled(
        addScaled([0, 0, 0], normal, Math.cos(angle)), binormal, Math.sin(angle),
      );
      const added = vertex(addScaled(point, radial, representableRadius), radial, j / segments, t);
      if (j === 0) ring = added;
    }
    if (i > 0) for (let j = 0; j < segments; j++) {
      builder.geometry.addTriangle(lastRing + j, lastRing + j + 1, ring + j);
      builder.geometry.addTriangle(lastRing + j + 1, ring + j + 1, ring + j);
    }
    lastRing = ring;
  }
  const tip = vertex(point, tangent, 0.5, 1);
  for (let j = 0; j < segments; j++) builder.geometry.addTriangle(lastRing + j, lastRing + j + 1, tip);
}
