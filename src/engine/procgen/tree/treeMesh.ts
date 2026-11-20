import { MeshBuilder } from "../mesh.ts";
import type { ProcMesh } from "../mesh.ts";
import { createStream, hashString } from "../random.ts";
import { cross, dot, sub, unit } from "../vector.ts";
import type { Vec3 } from "../vector.ts";
import type { TreeLodParams, TreeParams } from "./treeParams.ts";
import { addScaled, createStemSampler, perpendicular } from "./treeSkeleton.ts";
import type { TreeStem } from "./treeSkeleton.ts";

export interface TreeMeshAttributes {
  /** Per vertex: trunk bend, branch sway, phase, flutter. */
  wind: Float32Array;
  /** Per leaf vertex: shedding threshold and colour variation. */
  leaf?: Float32Array;
}

type TreeMesh = ProcMesh & { uvs: Float32Array; attributes: TreeMeshAttributes };

export interface TreeLodMesh {
  wood: TreeMesh;
  leaves: TreeMesh | null;
}

/** A rectangle in the leaf material's UVs (flipY: v = 0 the image's bottom row): u0, v0, u1, v1. */
export type UvRect = readonly [number, number, number, number];

/** A branch-tip card of the species' library (treeCards.ts): its tile and its card in its twig's frame. */
export interface ClusterCard {
  readonly rect: UvRect;
  /** The representative twig's length, metres; a card scales with its own twig's length. */
  readonly length: number;
  /** Extent along the twig from its base and across it, metres. */
  readonly along: readonly [number, number];
  readonly across: readonly [number, number];
}

/** The leaf texture as an atlas: the single leaf card and the branch-tip cards (PG3, §6.4). */
export interface LeafAtlas {
  readonly leaf: UvRect;
  readonly clusters: readonly ClusterCard[];
}

export const FULL_RECT: UvRect = [0, 0, 1, 1];

export interface Tube { index: number; segments: number; spans: number }
interface LeafPlacement { host: number; dropped?: TreeStem }
interface LeafSource extends LeafPlacement { id: string }
interface TreeLodPlan {
  tubes: Tube[];
  sources: LeafSource[];
  /** Branch-tip card mode: the terminal stems that carry a card. */
  cardStems: number[] | null;
  clusters: number;
  triangles: number;
}

const TAU = 2 * Math.PI;
export const hash01 = (id: string): number => hashString(id) / 4294967296;
/** Largest growth of a kept branch-tip card standing in for dropped ones. */
const MAX_CARD_GROWTH = 1.5;

const clusterSides = (lod: TreeLodParams) => lod.materialBackfaces ? [1] as const : [1, -1] as const;

function eachKeptCluster(
  params: TreeParams, lod: TreeLodParams, sources: LeafSource[],
  visit: (id: string, t: number, source: LeafSource) => void,
): void {
  if (lod.leafFraction === 0) return;
  for (const source of sources) for (let i = 0; i < params.leaves.perStem; i++) {
    const id = `${source.id}/leaf/${i}`;
    if (hash01(id + "/keep") >= lod.leafFraction) continue;
    const t = source.dropped?.attach ?? (0.5 + 0.5 * (i + 0.5) / params.leaves.perStem);
    visit(id, t, source);
  }
}

/** The terminal (leaf-bearing) stems. */
export function terminalStems(stems: readonly TreeStem[]): number[] {
  const parents = new Set(stems.map(stem => stem.parent));
  return stems.flatMap((_, index) => (parents.has(index) ? [] : [index]));
}

/**
 * Count the exact triangles before allocating any vertices. `clustered`: the leaves are branch-tip cards, one
 * crossed card per kept terminal stem (`leafFraction` of them), drawn along the stem itself even where its tube
 * dropped: the card shows the twig.
 */
export function planTreeLod(params: TreeParams, { stems }: { stems: TreeStem[] }, lod: TreeLodParams, clustered = false): TreeLodPlan {
  const tubes: Tube[] = [];
  const sources: LeafSource[] = [];
  const hosts: (LeafPlacement | undefined)[] = [];
  const parents = new Set(stems.map(stem => stem.parent));
  let triangles = 0, clusters = 0;
  for (const [index, stem] of stems.entries()) {
    const parentHost = hosts[stem.parent];
    const radius = stem.radii[0]!;
    const kept = radius >= lod.minRadius && (stem.parent < 0 || parentHost?.host === stem.parent);
    if (kept) {
      const segments = Math.max(3, Math.min(lod.radialSegments, Math.round(lod.radialSegments * radius / params.trunkRadius)));
      const spans = Math.max(1, Math.ceil(stem.length * lod.ringsPerMeter));
      tubes.push({ index, segments, spans });
      triangles += segments * (2 * spans + 1);
    }
    // Descendants of a dropped stem use its attachment on the nearest kept ancestor.
    const placement = kept ? { host: index } : parentHost && { host: parentHost.host, dropped: parentHost.dropped ?? stem };
    hosts.push(placement);
    if (!parents.has(index)) {
      clusters += params.leaves.perStem;
      if (placement) sources.push({ id: stem.id, ...placement });
    }
  }
  if (clustered) {
    const cardStems = lod.leafFraction === 0 || params.leaves.perStem === 0 ? []
      : terminalStems(stems).filter((index) => hash01(stems[index]!.id + "/card") < lod.leafFraction);
    triangles += cardStems.length * 2 * clusterSides(lod).length * params.leaves.cards;
    return { tubes, sources, cardStems, clusters, triangles };
  }
  eachKeptCluster(params, lod, sources, () => { triangles += 4 * params.leaves.cards; });
  return { tubes, sources, cardStems: null, clusters, triangles };
}

export function wind(params: TreeParams, stem: TreeStem, y: number, t: number, phase: number, flutter: number): number[] {
  const bend = Math.min(1, Math.max(0, y / params.height)) ** 2;
  return [bend, t * stem.level / params.levels.length, phase, flutter];
}

export class TreeMeshBuilder {
  readonly geometry = new MeshBuilder();
  readonly uvs: number[] = [];
  readonly wind: number[] = [];
  readonly leaf: number[] = [];

  addVertex(position: Vec3, normal: Vec3, u: number, v: number, weights: number[]): number {
    this.uvs.push(u, v);
    this.wind.push(...weights);
    return this.geometry.addVertex(position, normal);
  }

  build(): TreeMesh {
    const attributes: TreeMeshAttributes = { wind: new Float32Array(this.wind) };
    if (this.leaf.length) attributes.leaf = new Float32Array(this.leaf);
    return { ...this.geometry.build(), uvs: new Float32Array(this.uvs), attributes };
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

export function addTube(
  builder: TreeMeshBuilder, params: TreeParams, stem: TreeStem, { segments, spans }: Tube,
  sample: ReturnType<typeof createStemSampler>,
): void {
  const phase = hash01(stem.id);
  const circumference = TAU * stem.radii[0]!;
  let lastRing = 0;
  let { point, tangent, radius } = sample(0);
  let normal = perpendicular(tangent);
  for (let i = 0; i <= spans; i++) {
    const t = i / spans;
    if (i > 0) {
      const next = sample(t);
      normal = transport(normal, tangent, next.tangent);
      ({ point, tangent, radius } = next);
    }
    const binormal = cross(tangent, normal);
    const v = t * stem.length / circumference;
    // Keep rings distinct when a tiny radius would round off in Float32 positions.
    const representableRadius = Math.max(radius, Math.max(...point.map(Math.abs)) * 2 ** -22);
    let ring = 0;
    for (let j = 0; j <= segments; j++) {
      const angle = TAU * (j % segments) / segments;
      const radial = addScaled(
        addScaled([0, 0, 0], normal, Math.cos(angle)), binormal, Math.sin(angle),
      );
      const position = addScaled(point, radial, representableRadius);
      const vertex = builder.addVertex(position, radial, j / segments, v, wind(params, stem, position[1], t, phase, 0));
      if (j === 0) ring = vertex;
    }
    if (i > 0) for (let j = 0; j < segments; j++) {
      builder.geometry.addTriangle(lastRing + j, lastRing + j + 1, ring + j);
      builder.geometry.addTriangle(lastRing + j + 1, ring + j + 1, ring + j);
    }
    lastRing = ring;
  }
  const tip = builder.addVertex(point, tangent, 0.5, stem.length / circumference, wind(params, stem, point[1], 1, phase, 0));
  for (let j = 0; j < segments; j++) builder.geometry.addTriangle(lastRing + j, lastRing + j + 1, tip);
}

export function addCluster(
  builder: TreeMeshBuilder, params: TreeParams, lod: TreeLodParams, stem: TreeStem, id: string, t: number,
  sample: ReturnType<typeof createStemSampler>, crown: Vec3, dropped?: TreeStem, rect: UvRect = FULL_RECT,
): void {
  const { point, tangent } = sample(t);
  const random = createStream(params.seed, id);
  const jitter = random.fork("outward").unitVector();
  const center = addScaled(point, jitter, Math.min(...params.leaves.size) * 0.28);
  const direction = dropped ? unit(sub(dropped.points[1]!, dropped.points[0]!)) : tangent;
  const outward = unit(addScaled(direction, jitter, 0.4));
  const crownDirection = unit(sub(center, crown));
  const across = perpendicular(outward), normal = cross(outward, across);
  const rotation = random.fork("rotation").range(0, TAU);
  const phase = hash01(id + "/phase"), threshold = hash01(id + "/shed"), color = hash01(id + "/color");
  const scale = 0.5 / Math.sqrt(lod.leafFraction);
  const halfWidth = params.leaves.size[0] * scale, halfHeight = params.leaves.size[1] * scale;
  for (let card = 0; card < params.leaves.cards; card++) {
    const angle = rotation + card * Math.PI / params.leaves.cards;
    let vertical = addScaled(addScaled([0, 0, 0], across, Math.cos(angle)), normal, Math.sin(angle));
    let face = cross(outward, vertical);
    if (dot(face, crownDirection) < 0) {
      vertical = addScaled([0, 0, 0], vertical, -1);
      face = addScaled([0, 0, 0], face, -1);
    }
    const lighting = unit(addScaled(face, crownDirection, 1));
    const corners = [
      addScaled(addScaled(center, outward, -halfWidth), vertical, -halfHeight),
      addScaled(addScaled(center, outward, halfWidth), vertical, -halfHeight),
      addScaled(addScaled(center, outward, halfWidth), vertical, halfHeight),
      addScaled(addScaled(center, outward, -halfWidth), vertical, halfHeight),
    ];
    for (const side of [1, -1]) {
      const litNormal = addScaled([0, 0, 0], lighting, side);
      const [a, b, c, d] = corners.map((position, i) => {
        builder.leaf.push(threshold, color);
        return builder.addVertex(position, litNormal, i === 1 || i === 2 ? rect[2] : rect[0], i < 2 ? rect[1] : rect[3],
          wind(params, stem, position[1], t, phase, 1));
      });
      if (side === 1) {
        builder.geometry.addTriangle(a!, b!, c!);
        builder.geometry.addTriangle(a!, c!, d!);
      } else {
        builder.geometry.addTriangle(a!, c!, b!);
        builder.geometry.addTriangle(a!, d!, c!);
      }
    }
  }
}

/**
 * One branch-tip card on a terminal stem: `cards` crossed quads around the stem's base → tip axis showing a
 * library tile (the representative nearest in length), scaled by the stem's length (and, standing in for
 * dropped neighbours, grown about its centre by up to `MAX_CARD_GROWTH`). `_leaf` carries the mean shedding threshold of the stem's
 * leaf clusters (the ids of `addCluster`), so the card falls with them on average.
 */
function addClusterCard(
  builder: TreeMeshBuilder, params: TreeParams, lod: TreeLodParams, stem: TreeStem, atlas: LeafAtlas, crown: Vec3,
): void {
  const card = atlas.clusters.reduce((best, entry) => (Math.abs(entry.length - stem.length) < Math.abs(best.length - stem.length) ? entry : best));
  const base = stem.points[0]!, axis = unit(sub(stem.points[stem.points.length - 1]!, base));
  // The tile scales with the twig's length; growth (standing in for dropped neighbours) about the card's centre.
  const fit = stem.length / card.length, grow = Math.min(MAX_CARD_GROWTH, 1 / Math.sqrt(Math.max(lod.leafFraction, 1e-3)));
  const around = (lo: number, hi: number): [number, number] => {
    const mid = (lo + hi) / 2 * fit, half = (hi - lo) / 2 * fit * grow;
    return [mid - half, mid + half];
  };
  const [a0, a1] = around(card.along[0], card.along[1]), [b0, b1] = around(card.across[0], card.across[1]);
  const centre = addScaled(base, axis, (a0 + a1) / 2);
  const crownDirection = unit(sub(centre, crown));
  const across = perpendicular(axis), normal = cross(axis, across);
  const rotation = createStream(params.seed, stem.id + "/card").range(0, TAU);
  let threshold = 0;
  for (let i = 0; i < params.leaves.perStem; i++) threshold += hash01(`${stem.id}/leaf/${i}/shed`);
  threshold /= Math.max(1, params.leaves.perStem);
  const phase = hash01(stem.id + "/phase"), color = hash01(stem.id + "/color");
  const [u0, v0, u1, v1] = card.rect;
  for (let k = 0; k < params.leaves.cards; k++) {
    const angle = rotation + k * Math.PI / params.leaves.cards;
    const vertical = addScaled(addScaled([0, 0, 0], across, Math.cos(angle)), normal, Math.sin(angle));
    const face = cross(axis, vertical);
    const lighting = unit(addScaled(dot(face, crownDirection) < 0 ? addScaled([0, 0, 0], face, -1) : face, crownDirection, 1));
    // Corners (along, across): base-low, tip-low, tip-high, base-high; across max is the tile's top (v1).
    const corners = [[a0, b0, u0, v0], [a1, b0, u1, v0], [a1, b1, u1, v1], [a0, b1, u0, v1]] as const;
    for (const side of clusterSides(lod)) {
      const litNormal = addScaled([0, 0, 0], lighting, side);
      const [a, b, c, d] = corners.map(([along, high, u, v]) => {
        const position = addScaled(addScaled(base, axis, along), vertical, high);
        builder.leaf.push(threshold, color);
        return builder.addVertex(position, litNormal, u, v,
          wind(params, stem, position[1], Math.min(1, Math.max(0, along / stem.length)), phase, 1));
      });
      if (side === 1) {
        builder.geometry.addTriangle(a!, b!, c!);
        builder.geometry.addTriangle(a!, c!, d!);
      } else {
        builder.geometry.addTriangle(a!, c!, b!);
        builder.geometry.addTriangle(a!, d!, c!);
      }
    }
  }
}

export function buildTreeLod(
  params: TreeParams, { stems }: { stems: TreeStem[] }, lod: TreeLodParams, plan: TreeLodPlan, atlas?: LeafAtlas,
): TreeLodMesh {
  const wood = new TreeMeshBuilder(), leaves = new TreeMeshBuilder();
  if (!plan.tubes.length) return { wood: wood.build(), leaves: null };
  const samplers = new Map<number, ReturnType<typeof createStemSampler>>();
  for (const tube of plan.tubes) {
    const stem = stems[tube.index]!;
    const sample = createStemSampler(stem);
    addTube(wood, params, stem, tube, sample);
    samplers.set(tube.index, sample);
  }
  const crown = samplers.get(0)!((1 + params.crownStart) / 2).point;
  if (plan.cardStems) {
    if (!atlas || atlas.clusters.length === 0) throw new Error("branch-tip cards need the card library");
    for (const index of plan.cardStems) addClusterCard(leaves, params, lod, stems[index]!, atlas, crown);
  } else {
    eachKeptCluster(params, lod, plan.sources, (id, t, { host, dropped }) => {
      addCluster(leaves, params, lod, stems[host]!, id, t, samplers.get(host)!, crown, dropped, atlas?.leaf ?? FULL_RECT);
    });
  }
  return { wood: wood.build(), leaves: leaves.leaf.length ? leaves.build() : null };
}

export function meshTree(params: TreeParams, skeleton: { stems: TreeStem[] }, lod: TreeLodParams): TreeLodMesh {
  return buildTreeLod(params, skeleton, lod, planTreeLod(params, skeleton, lod));
}
