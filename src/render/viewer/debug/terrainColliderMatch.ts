// G8 "terrain = collider" on the real GPU (plan phase 5a step 5, decision 4;
// spike S2's measureG8 in production). Development only: `main.ts` loads it
// through `window.__forgeDev.terrainColliderMatch` with a dynamic import, so a
// game build never carries it; the render smoke drives it
// (tests/smoke/terrainCollider.smoke.ts).
//
// The first drawn terrain is read back from the GPU around the camera
// (sync/terrainHeightProbe.ts: the main camera's LOD and morph, 1 px per m).
// Each pixel's height is compared with
// - a ray cast onto the running World's Rapier heightfields of the resident tiles,
//   the G8 measure: at most 5 cm where the
//   terrain is drawn at full resolution (a leaf node from its tile slot, no
//   morph; Phase 1 user decision 2026-11-11), the morph band and the coarser
//   levels reported;
// - the drawn surface's CPU twin (engine/terrain/terrainVisualHeight.ts), which
//   also classifies the pixel into its band: the twin must be the GPU's
//   surface everywhere, so the Node test of the twin against Rapier stands for
//   the GPU too.

import type { WebGPURenderer } from "three/webgpu";
import type { TerrainResidencyKey } from "../../../engine/terrain/terrainResidency.ts";
import { terrainVisualSample } from "../../../engine/terrain/terrainVisualHeight.ts";
import type { RenderHost } from "../../host/renderHost.ts";
import { taggedTerrainViews } from "../../sync/debugTags.ts";
import { readTerrainHeights } from "../../sync/terrainHeightProbe.ts";

export interface ColliderMatchBand {
  readonly samples: number;
  /** Largest, mean and 99th percentile |GPU - collider| in metres. */
  readonly maxM: number;
  readonly meanM: number;
  readonly p99M: number;
  readonly over5cm: number;
}

export interface TerrainColliderMatch {
  readonly terrain: string;
  readonly regionMetres: number;
  readonly centre: readonly [number, number];
  readonly camera: readonly [number, number, number];
  readonly backend: string;
  /** Pixels in the region, those the terrain covers, those with no resident collider under them. */
  readonly pixels: number;
  readonly covered: number;
  readonly noCollider: number;
  readonly colliders: number;
  readonly nodes: number;
  /** Full resolution (the G8 measure), the morph band, coarser levels and far map stand-ins. */
  readonly bands: { readonly full: ColliderMatchBand; readonly morph: ColliderMatchBand; readonly coarser: ColliderMatchBand };
  /** Largest |GPU - CPU twin| over every covered pixel, and pixels the twin does not draw. */
  readonly twinMaxM: number;
  readonly twinMisses: number;
}

export interface TerrainSnowMatch {
  readonly covered: number;
  readonly sampled: number;
  readonly minM: number;
  readonly maxM: number;
  readonly twin: ColliderMatchBand;
  readonly spots: readonly ({ drawn: number; expected: number } | null)[];
}

/** W7 checks the displacement separately from the unraised collider and the G8 probe. */
export async function measureTerrainSnow(host: RenderHost, options: {
  centre: readonly [number, number]; size?: number; spots?: readonly (readonly [number, number])[];
}): Promise<TerrainSnowMatch | null> {
  const scene = host.world?.scene;
  const tagged = scene ? taggedTerrainViews(scene)[0] : undefined;
  if (!tagged) return null;
  const { view } = tagged;
  const readback = await readTerrainHeights(host.renderer as WebGPURenderer, view, host.camera, options.centre, options.size ?? 64, {});
  const { nodes, surface } = readback.visual;
  const { snowOffset: _offset, ...baseSurface } = surface;
  const [ox, oy, oz] = view.mesh.getWorldPosition(view.origin.clone()).add(view.origin).toArray();
  const errors: number[] = [];
  const spots = options.spots ?? [];
  const samples = spots.map((): { drawn: number; expected: number } | null => null);
  let minM = Infinity, maxM = -Infinity;
  const { points } = readback;
  for (let i = 0; i < points.length; i += 3) {
    const [x, y, z] = [points[i]!, points[i + 1]!, points[i + 2]!];
    const base = terrainVisualSample(baseSurface, nodes, x - ox, z - oz);
    if (!base) continue;
    const snowy = _offset ? terrainVisualSample(surface, nodes, x - ox, z - oz) : base;
    if (!snowy) continue;
    const drawn = y - oy - base.height;
    const expected = snowy.height - base.height;
    errors.push(Math.abs(drawn - expected));
    minM = Math.min(minM, drawn);
    maxM = Math.max(maxM, drawn);
    for (let j = 0; j < spots.length; j += 1) {
      const [sx, sz] = spots[j]!;
      if (Math.abs(x - sx) < 0.1 && Math.abs(z - sz) < 0.1) samples[j] = { drawn: round(drawn), expected: round(expected) };
    }
  }
  return { covered: points.length / 3, sampled: errors.length, minM: round(minM), maxM: round(maxM), twin: band(errors), spots: samples };
}

const round = (value: number) => Math.round(value * 1e5) / 1e5;

function band(values: number[]): ColliderMatchBand {
  if (values.length === 0) return { samples: 0, maxM: 0, meanM: 0, p99M: 0, over5cm: 0 };
  const sorted = [...values].sort((a, b) => a - b);
  return {
    samples: values.length,
    maxM: round(sorted[sorted.length - 1]!),
    meanM: round(values.reduce((sum, value) => sum + value, 0) / values.length),
    p99M: round(sorted[Math.floor((sorted.length - 1) * 0.99)]!),
    over5cm: values.filter((value) => value > 0.05).length,
  };
}

/** Measures the first drawn terrain in a `size` m square around the camera; null when the world draws none. */
export async function measureTerrainColliderMatch(
  host: RenderHost, residency: NonNullable<typeof TerrainResidencyKey.type>, options: { size?: number } = {},
): Promise<TerrainColliderMatch | null> {
  const scene = host.world?.scene;
  const tagged = scene ? taggedTerrainViews(scene)[0] : undefined;
  if (!tagged) return null;
  const { view, def, actor, component } = tagged;
  const camera = host.camera;
  camera.updateMatrixWorld();
  const centre: [number, number] = [Math.floor(camera.matrixWorld.elements[12]!), Math.floor(camera.matrixWorld.elements[14]!)];
  const readback = await readTerrainHeights(host.renderer as WebGPURenderer, view, camera, centre, options.size ?? 256);
  const side = Math.sqrt(readback.pixels);

  const { surface, nodes } = readback.visual;
  const colliders = residency.colliderCount(actor, component);

  const gaps = { full: [] as number[], morph: [] as number[], coarser: [] as number[] };
  const leaf = surface.patchQuads * surface.spacing;
  const [ox, oy, oz] = def.origin;
  let noCollider = 0;
  let twinMax = 0;
  let twinMisses = 0;
  const { points } = readback;
  for (let i = 0; i < points.length; i += 3) {
    const [x, y, z] = [points[i]!, points[i + 1]!, points[i + 2]!];
    const twin = terrainVisualSample(surface, nodes, x - ox, z - oz);
    if (!twin) {
      twinMisses += 1;
      continue;
    }
    twinMax = Math.max(twinMax, Math.abs(y - (oy + twin.height)));
    const colliderHeight = residency.height(actor, component, x, z);
    if (colliderHeight === null) {
      noCollider += 1;
      continue;
    }
    const gap = Math.abs(y - colliderHeight);
    const full = twin.node.size === leaf && twin.node.tile !== null;
    (full ? (twin.morph === 0 ? gaps.full : gaps.morph) : gaps.coarser).push(gap);
  }
  const position = camera.matrixWorld.elements;
  return {
    terrain: def.name,
    regionMetres: side,
    centre,
    camera: [round(position[12]!), round(position[13]!), round(position[14]!)],
    backend: (host.renderer.backend as { isWebGPUBackend?: boolean }).isWebGPUBackend ? "webgpu" : "webgl",
    pixels: readback.pixels,
    covered: points.length / 3,
    noCollider,
    colliders,
    nodes: nodes.length,
    bands: { full: band(gaps.full), morph: band(gaps.morph), coarser: band(gaps.coarser) },
    twinMaxM: round(twinMax),
    twinMisses,
  };
}
