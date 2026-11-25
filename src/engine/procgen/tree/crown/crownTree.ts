// A generator version 6 tree's LOD meshes (vegetation plan PG5b, §9.8).
//
// Sprays: the crown carries the leaf area its fullness asks for (the leaf
// area index over the reference area, crownParams.ts): that many sprays are
// drawn from the skeleton's sites, a card each, folded and curved at LOD0,
// flat beyond. An LOD keeps the first sprays of one fixed order, as
// many as its share and its triangle cap allow, and grows them about their
// tips so the leaf area stays; the silhouette does not swell with it.
//
// Attributes: `_WIND` (trunk bend, sway, phase, flutter), the sway rising as the wood thins and the phase shared by a whole
// limb, so a branch stays on its limb; `_LEAF`: the spray's shedding threshold
// (on wood the share of the twig colour) and the crown light of the place
// (crownLight.ts), which the shader darkens by. Leaf normals are the crown's,
// the same on both sides of a card: the material draws both.

import { createStream } from "../../random.ts";
import { cross, dot, unit, type Vec3 } from "../../vector.ts";
import { meshStats } from "../../stats.ts";
import { addTube, hash01, TreeMeshBuilder, type TreeLodMesh } from "../treeMesh.ts";
import type { TreeResult } from "../treeGenerator.ts";
import { addScaled, createStemSampler } from "../stems.ts";
import { CROWN_TRIANGLE_CAPS, normalizeCrownParams, SHRUB_TRIANGLE_CAPS, SPRAY_COVERAGE, targetLeafAreaIndex, type CrownParams } from "./crownParams.ts";
import { createCrownLight, type CrownSample } from "./crownLight.ts";
import { buildCrownSkeleton, perpendicularPart, type CrownSkeleton, type SpraySite } from "./crownSkeleton.ts";

/** The spray atlas is GRID × GRID tiles (sprayTexture.ts). */
export const SPRAY_GRID = 2;
/** A kept card never grows past this, however few are kept. */
const MAX_GROWTH = 5;
const MAX_SPRAYS = 4500;

export interface Spray extends SpraySite { length: number; width: number; base2: CrownSample; tip2: CrownSample }

export interface CrownTree {
  params: CrownParams;
  skeleton: CrownSkeleton;
  sprays: Spray[];
  lightAt(p: Vec3): CrownSample;
}

/** The skeleton with its sprays, or why it cannot be. */
export function buildCrown(params: CrownParams): CrownTree | { error: string } {
  const skeleton = buildCrownSkeleton(params);
  if ("error" in skeleton) return skeleton;
  const { spray } = params, { sites } = skeleton;
  const areaOf = (site: SpraySite): number => (spray.length * site.scale) ** 2 * spray.aspect * SPRAY_COVERAGE;
  const siteArea = sites.reduce((sum, site) => sum + areaOf(site), 0);
  const perSite = siteArea > 0 ? Math.min(MAX_SPRAYS / sites.length, targetLeafAreaIndex(params) * skeleton.referenceArea / siteArea) : 0;
  const placed: (SpraySite & { length: number; width: number })[] = [];
  for (const site of sites) {
    const whole = Math.floor(perSite), count = whole + (hash01(`${site.id}/more`) < perSite - whole ? 1 : 0);
    for (let k = 0; k < count; k++) {
      const id = `${site.id}/s${k}`, q = createStream(params.seed, `spray/${id}`);
      // Another spray on the same site leaves at another angle.
      let dir = site.dir;
      if (k > 0) {
        const across = unit(cross(perpendicularPart(site.up, site.dir), site.dir)), turn = (k % 2 ? 1 : -1) * (0.7 + 0.25 * k);
        dir = unit(addScaled(addScaled([0, 0, 0], site.dir, Math.cos(turn)), across, Math.sin(turn)));
        dir = unit(addScaled(dir, [0, 1, 0], q.range(-0.35, 0.35)));
      }
      const length = spray.length * site.scale * q.range(0.86, 1.14);
      placed.push({ ...site, id, dir, up: unit(addScaled(site.up, q.unitVector(), 0.25)), length, width: length * spray.aspect });
    }
  }
  const lightAt = createCrownLight(
    placed.flatMap((s) => [0.3, 0.75].map((along) => ({ p: addScaled(s.base, s.dir, along * s.length), area: s.length * s.width * SPRAY_COVERAGE / 2 }))),
    Math.max(0.16, Math.min(0.8, 0.045 * skeleton.height)),
  );
  const sprays = placed.map((s): Spray => ({ ...s, base2: lightAt(s.base), tip2: lightAt(addScaled(s.base, s.dir, s.length)) }));
  // The one order every LOD keeps its sprays from.
  const rank = new Map(sprays.map((s) => [s.id, hash01(`${s.id}/keep`) * (s.keep ?? 1)]));
  sprays.sort((a, b) => rank.get(a.id)! - rank.get(b.id)! || (a.id < b.id ? -1 : 1));
  return { params, skeleton, sprays, lightAt };
}

/** Rows along the card and columns across it. */
const CARDS = [{ rows: 2, columns: 2 }, { rows: 1, columns: 1 }] as const;
const cardOf = (lod: number): (typeof CARDS)[number] => CARDS[Math.min(lod, CARDS.length - 1)]!;

/** Returns the card's leaf area, m². */
function addSpray(builder: TreeMeshBuilder, tree: CrownTree, spray: Spray, grow: number, lod: number): number {
  const { params, skeleton } = tree, { rows, columns } = cardOf(lod), stem = skeleton.stems[spray.stem]!;
  const q = createStream(1, `${spray.id}/card`), tile = Math.min(SPRAY_GRID ** 2 - 1, Math.floor(q.next() * SPRAY_GRID ** 2)), flip = q.next() < 0.5 ? -1 : 1;
  const step = 1 / SPRAY_GRID, inset = step * 0.004, u0 = (tile % SPRAY_GRID) * step + inset, v0 = 1 - (Math.floor(tile / SPRAY_GRID) + 1) * step + inset;
  const span = step - 2 * inset;
  const up = perpendicularPart(spray.up, spray.dir), across = unit(cross(up, spray.dir));
  const length = Math.max(spray.length, Math.min(spray.length * grow, spray.reach ?? Infinity)), half = spray.width * (length / spray.length) / 2;
  // Grown about its tip: what stands in for dropped neighbours fills inward.
  const base = addScaled(spray.base, spray.dir, -(length - spray.length) * 0.8);
  const shed = hash01(`${spray.id}/shed`), tone = hash01(`${spray.id}/color`), phase = hash01(skeleton.stems[stem.limb]!.id);
  const sway = swayOf(params, stem.radii[0]! + (stem.radii.at(-1)! - stem.radii[0]!) * spray.t);
  const vertices: number[] = [];
  for (let row = 0; row <= rows; row++) for (let column = 0; column <= columns; column++) {
    const along = row / rows, side = columns === 1 ? column * 2 - 1 : column - 1;
    let p = addScaled(addScaled(base, spray.dir, along * length), across, side * half);
    if (columns > 1) p = addScaled(p, up, side === 0 ? 0.16 * half : -0.36 * half);
    p = addScaled(p, [0, 1, 0], -params.spray.droop * 0.6 * along * along * length);
    const open = unit(addScaled(addScaled([0, 0, 0], spray.base2.normal, 1 - along), spray.tip2.normal, along));
    let face = unit(addScaled(up, across, columns > 1 ? side * 0.5 : 0));
    if (dot(face, open) < 0) face = [-face[0], -face[1], -face[2]];
    const light = spray.base2.light + (spray.tip2.light - spray.base2.light) * along;
    vertices.push(builder.addVertex(p, unit(addScaled(open, face, 0.45)), u0 + span * along, v0 + span * (flip * side * 0.5 + 0.5),
      [bendOf(params, p), Math.min(1, sway + 0.15 * along), phase, 0.25 + 0.75 * along], [shed, Math.max(0, Math.min(1, light * (0.94 + 0.12 * tone)))]));
  }
  const stride = columns + 1;
  for (let row = 0; row < rows; row++) for (let column = 0; column < columns; column++) {
    const a = vertices[row * stride + column]!, b = vertices[(row + 1) * stride + column]!, c = vertices[(row + 1) * stride + column + 1]!, d = vertices[row * stride + column + 1]!;
    builder.geometry.addTriangle(a, b, c);
    builder.geometry.addTriangle(a, c, d);
  }
  return length * half * 2 * SPRAY_COVERAGE;
}

/** 0 on the trunk's base, near 1 on a twig: thin wood sways, and a joint has one value on both sides. */
const bendOf = (params: CrownParams, p: Vec3): number => Math.min(1, Math.max(0, p[1] / params.height)) ** 2;
const swayOf = (params: CrownParams, radius: number): number => Math.max(0, 1 - Math.sqrt(Math.min(1, radius / params.trunkRadius))) ** 1.5;

interface LodPlan { tubes: { index: number; segments: number; spans: number }[]; wood: number; sprays: number }

function planLod(tree: CrownTree, lod: number, cap: number): LodPlan {
  const { params, skeleton, sprays } = tree, settings = params.lods[lod]!, { rows, columns } = cardOf(lod);
  const tubes: LodPlan["tubes"] = [];
  let wood = 0;
  skeleton.stems.forEach((stem, index) => {
    if (index > 0 && stem.radii[0]! < settings.minRadius) return;
    const segments = Math.max(3, Math.min(settings.radialSegments, Math.round(settings.radialSegments * Math.sqrt(stem.radii[0]! / params.trunkRadius))));
    const spans = Math.max(1, Math.min(stem.points.length - 1, Math.ceil(stem.length * settings.ringsPerMeter)));
    tubes.push({ index, segments, spans });
    wood += segments * (2 * spans + 1);
  });
  const room = Math.floor((cap - wood) / (2 * rows * columns));
  return { tubes, wood, sprays: Math.max(0, Math.min(room, Math.round(settings.leafFraction * sprays.length))) };
}

export function generateCrownTree(input: Readonly<Record<string, unknown>>, options?: { triangleCaps?: readonly number[] }): TreeResult {
  const params = normalizeCrownParams(input), tree = buildCrown(params);
  if ("error" in tree) return { ok: false, report: { code: "skeleton", message: tree.error } };
  const { skeleton, sprays } = tree;
  const plans: LodPlan[] = [], caps = params.habit === "shrub" ? SHRUB_TRIANGLE_CAPS : CROWN_TRIANGLE_CAPS;
  for (let lod = 0; lod < params.lods.length; lod++) {
    const requested = options?.triangleCaps?.[lod];
    const cap = requested !== undefined && Number.isFinite(requested) ? Math.max(0, Math.floor(requested)) : caps[Math.min(lod, caps.length - 1)]!;
    const plan = planLod(tree, lod, cap);
    if (plan.wood > cap) return { ok: false, report: { code: "budget", lod, message: `LOD${lod} requests ${plan.wood} wood triangles; cap is ${cap}` } };
    plans.push(plan);
  }
  // How much of the twig colour the wood has: none above twice and a half the twig's radius.
  const twigOf = (radius: number): number => (params.twigRadius > 0 ? Math.max(0, Math.min(1, (2.5 - radius / params.twigRadius) / 1.5)) : 0);
  const leafArea: number[] = [];
  const lods = plans.map((plan, lod): TreeLodMesh => {
    const wood = new TreeMeshBuilder(), leaves = new TreeMeshBuilder();
    for (const tube of plan.tubes) {
      const stem = skeleton.stems[tube.index]!, phase = hash01(skeleton.stems[stem.limb]!.id), r0 = stem.radii[0]!, r1 = stem.radii.at(-1)!;
      addTube(wood, stem, tube, createStemSampler(stem), (p, t, radius) => ({
        wind: [bendOf(params, p), swayOf(params, r0 + (r1 - r0) * t), phase, 0],
        leaf: [twigOf(radius), tree.lightAt(p).light],
      }));
    }
    const grow = plan.sprays > 0 ? Math.min(MAX_GROWTH, Math.sqrt(sprays.length / plan.sprays)) : 1;
    let area = 0;
    for (const spray of sprays.slice(0, plan.sprays)) {
      area += addSpray(leaves, tree, spray, grow, lod);
    }
    leafArea.push(area);
    return { wood: wood.build(), leaves: plan.sprays > 0 ? leaves.build() : null };
  });
  const stats = lods.map((mesh) => {
    const wood = meshStats(mesh.wood), leaves = mesh.leaves ? meshStats(mesh.leaves) : null;
    return { wood, leaves, triangles: wood.triangles + (leaves?.triangles ?? 0) };
  });
  return { ok: true, lods, stats, height: skeleton.height, stems: skeleton.stems.length, sprays: sprays.length, crown: { leafArea, referenceArea: skeleton.referenceArea, radius: Math.max(skeleton.radius[0], skeleton.radius[2]) } };
}
