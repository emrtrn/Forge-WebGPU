// The impostor: a plant's farthest representation (vegetation plan PG3,
// §6.4), the last LOD of its GPU-driven batch. One quad per instance whose
// four vertices sit at the template's bounding-sphere centre; the
// instance-shading hook opens it toward the view (the shadow pass's light
// camera too) and picks the three hemi-octahedral frames around the view
// direction in the instance's own frame (its yaw turns with it), blending
// them by weight (each read at its own continuous coordinates: a per-pixel
// frame pick makes neighbours jump frames, wrecks the mip choice and leaves
// noise that only a temporal AA would hide). Mirrors engine/procgen/bake/impostorViews.ts exactly (layout, basis,
// blend) and reads the atlas engine/procgen/tree/treeImpostor.ts writes: the
// left half wood, the right half leaves, normal rg octahedral object-space,
// leaf alpha the smallest shedding threshold of the pixel's leaves.
//
// A crown family's atlas (generator version 6) carries the crown light in the
// normal texture's blue: both layers darken by it and the leaves let light
// through, as its meshes do (plantDrawing.ts).
//
// With a plant's appearance (render/plant/plantDrawing.ts) the leaves shed
// per pixel on the same rule as the model's clusters (threshold + the same
// per-instance shift below the leaves shown; shadow too), take the season
// tint, snow on up-facing leaves / wood and the wet darkening. Without one
// (a plain foliage type) the summer look.
//
// A one-layer atlas (an imported model's, baked at run time for its far
// billboards, plan 5c F3: render/plant/modelImpostor.ts) is drawn as leaves
// that never shed.
//
// Bounds: the atlas frames span the sphere three's Box3.getBoundingSphere
// gives for LOD 0 (the bake's AABB centre and half diagonal), so the quad
// matches the frames.

import {
  abs, clamp, cameraPosition, cameraViewMatrix, cross, dot, float, floor, hash, max, mix, normalize, select, smoothstep, texture,
  transpose, uniform, uv, varying, vec2, vec3, vec4,
} from "three/tsl";
import { BufferGeometry, DoubleSide, Float32BufferAttribute, Matrix4, MeshStandardNodeMaterial, type Node, type NodeMaterial, type Texture, type Vector3 } from "three/webgpu";
import type { GpuBatchPart } from "../gpu/gpuDrivenBatch.ts";
import { crownShade, instanceTone, seasonTint, throughColor } from "./crownShading.ts";
import { lightLeaves } from "./leafLighting.ts";
import type { InstanceShadingNodes, InstanceShadingResult } from "../gpu/instanceShading.ts";

/** Material `userData` key of an impostor part: an id into {@link atlases} (three clones `userData` as JSON). */
export const IMPOSTOR_KEY = "forgeImpostor";
const atlases = new Map<string, ImpostorAtlasDraw>();
let nextAtlas = 0;

export interface ImpostorAtlasDraw {
  /** sRGB colour + coverage; wood left half, leaves right half. */
  readonly albedo: Texture;
  /** Linear: rg octahedral normal, b depth, a leaf threshold. */
  readonly normal: Texture;
  /** Frames per side. */
  readonly views: number;
  /** LOD 0's bounding sphere in template space. */
  readonly center: Vector3;
  readonly radius: number;
  /**
   * 2 (default): wood left half, leaves right half (a generated plant). 1: one layer over the whole atlas,
   * drawn as leaves that never shed (an imported model baked at run time, plan 5c F3).
   */
  readonly layers?: 1 | 2;
}

/** A plant's live appearance (plantDrawing.ts uniforms). */
export interface ImpostorLook {
  readonly foliage: Node<"float">;
  readonly tint: Node<"vec3">;
  readonly snowWood: Node<"float">;
  readonly snowLeaf: Node<"float">;
  readonly wet: Node<"float">;
  readonly snowColor: Node<"vec3">;
  /** A crown family's shading (PG5b); null without one. */
  readonly crown?: { readonly translucency: Node<"float">; readonly depth: Node<"float"> } | null;
}

/** The batch part: a quad collapsed onto the sphere centre, opened by {@link applyImpostor}. */
export function impostorPart(atlas: ImpostorAtlasDraw, name: string): GpuBatchPart {
  const geometry = new BufferGeometry();
  const { x, y, z } = atlas.center;
  geometry.setAttribute("position", new Float32BufferAttribute([x, y, z, x, y, z, x, y, z, x, y, z], 3));
  geometry.setAttribute("normal", new Float32BufferAttribute([0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1], 3));
  geometry.setAttribute("uv", new Float32BufferAttribute([0, 0, 1, 0, 1, 1, 0, 1], 2));
  geometry.setIndex([0, 1, 2, 0, 2, 3]);
  const material = new MeshStandardNodeMaterial({ side: DoubleSide, roughness: 0.85, metalness: 0 });
  material.name = "Impostor";
  const id = `impostor${(nextAtlas += 1)}`;
  atlases.set(id, atlas);
  material.userData[IMPOSTOR_KEY] = id;
  // The batch clones the part's material per view; the source's dispose ends the atlas entry.
  material.addEventListener("dispose", () => atlases.delete(id));
  return { geometry, material, local: new Matrix4(), name: `${name}/impostor` };
}

export const isImpostor = (material: NodeMaterial): ImpostorAtlasDraw | null => {
  const id = material.userData?.[IMPOSTOR_KEY];
  return typeof id === "string" ? atlases.get(id) ?? null : null;
};

type V2 = Node<"vec2">;
type V3 = Node<"vec3">;

/** impostorViews.ts `hemiOctDecode`. */
const hemiOctDecode = (p01: V2): V3 => {
  const p = p01.mul(2).sub(1);
  const x = p.x.add(p.y).mul(0.5), z = p.x.sub(p.y).mul(0.5);
  return normalize(vec3(x, max(float(1).sub(abs(x)).sub(abs(z)), 0), z));
};

/** impostorViews.ts `impostorBasisOf`: right / up of the view toward the camera `v`. */
const basisOf = (v: V3): { right: V3; up: V3 } => {
  const hint = select(abs(v.y).greaterThan(0.999), vec3(0, 0, -1), vec3(0, 1, 0));
  const right = normalize(cross(hint, v));
  return { right, up: cross(v, right) };
};

/** rasterizer.ts `octDecode` (full sphere). */
const octDecode = (e: V2): V3 => {
  const p = e.mul(2).sub(1);
  const z = float(1).sub(abs(p.x)).sub(abs(p.y));
  const t = clamp(z.negate(), 0, 1);
  const x = p.x.add(select(p.x.greaterThanEqual(0), t.negate(), t));
  const y = p.y.add(select(p.y.greaterThanEqual(0), t.negate(), t));
  return normalize(vec3(x, y, z));
};

/**
 * Sets the impostor's nodes on its material (main, camera and shadow views alike) and returns the world offset
 * that opens the quad. `look` null: the summer appearance, no shedding.
 */
export function applyImpostor(
  material: NodeMaterial, instance: InstanceShadingNodes, role: "main" | "shadow" | "camera", look: ImpostorLook | null,
): InstanceShadingResult {
  const atlas = isImpostor(material)!;
  const views = atlas.views, radius = atlas.radius;
  const center = uniform(atlas.center.clone());
  const toLocal = transpose(instance.basis);
  const scale2 = instance.scale.mul(instance.scale).max(1e-8);

  // Vertex: the quad toward the camera (world), its offset back in template space.
  const centreWorld = instance.origin.add(instance.basis.mul(center));
  const v = normalize(cameraPosition.sub(centreWorld));
  const view = basisOf(v);
  const corner = uv().mul(2).sub(1);
  const worldOffset = view.right.mul(corner.x).add(view.up.mul(corner.y)).mul(instance.scale.mul(radius));
  const offset = toLocal.mul(worldOffset).div(scale2);
  const local = normalize(toLocal.mul(v));

  // The three frames around the local view direction (impostorViews.ts `impostorBlend`).
  const dy = max(local.y, 0);
  const sum = abs(local.x).add(dy).add(abs(local.z)).max(1e-6);
  const lx = local.x.div(sum), lz = local.z.div(sum);
  const g = vec2(lx.add(lz), lx.sub(lz)).mul(0.5).add(0.5).mul(views - 1);
  const cell = clamp(floor(g), 0, views - 2);
  const f = clamp(g.sub(cell), 0, 1);
  const lower = f.x.add(f.y).lessThan(1);
  const frames = [
    select(lower, cell, cell.add(vec2(1, 1))),
    select(lower, cell.add(vec2(1, 0)), cell.add(vec2(0, 1))),
    select(lower, cell.add(vec2(0, 1)), cell.add(vec2(1, 0))),
  ];
  const weights = select(lower, vec3(float(1).sub(f.x).sub(f.y), f.x, f.y), vec3(f.x.add(f.y).sub(1), float(1).sub(f.x), float(1).sub(f.y)));
  // Per frame: the vertex projected on that frame's image plane (linear across the quad), frame offset included.
  const frameUv = frames.map((frame, k) => {
    const basis = basisOf(hemiOctDecode(frame.div(views - 1)));
    const x = dot(offset, basis.right).div(radius).mul(0.5).add(0.5);
    const y = float(0.5).sub(dot(offset, basis.up).div(radius).mul(0.5));
    return varying(vec4(frame, x, y), `vForgeImpostorFrame${k}`);
  });
  const blend = varying(weights, "vForgeImpostorWeights");

  // Fragment: the three frames, each read at its own continuous coordinates (its own mip), blended by weight.
  // Coverage is the weighted sum: views disagree a little (parallax), so the cut sits below one half.
  const jitter = hash(instance.seed).sub(0.5).mul(0.24);
  let woodCover: Node<"float"> = float(0), leafCover: Node<"float"> = float(0);
  let woodRgb: V3 = vec3(0, 0, 0), leafRgb: V3 = vec3(0, 0, 0);
  let woodOct: V2 = vec2(0, 0), leafOct: V2 = vec2(0, 0);
  let woodLight: Node<"float"> = float(0), leafLight: Node<"float"> = float(0);
  const single = atlas.layers === 1;
  frameUv.forEach((entry, k) => {
    const w = [blend.x, blend.y, blend.z][k]!;
    const inFrame = select(entry.z.greaterThanEqual(0).and(entry.z.lessThanEqual(1)).and(entry.w.greaterThanEqual(0)).and(entry.w.lessThanEqual(1)), float(1), float(0));
    const frameAt = entry.xy.add(clamp(entry.zw, 0, 1)).div(views);
    const at = (half: number) => (single ? frameAt : frameAt.mul(vec2(0.5, 1)).add(vec2(half * 0.5, 0)));
    const leaf = { color: texture(atlas.albedo, at(1)), normal: texture(atlas.normal, at(1)) };
    const kept = look && !single ? select(clamp(leaf.normal.w.add(jitter), 0.001, 0.999).lessThan(look.foliage), float(1), float(0)) : float(1);
    const cl = w.mul(inFrame).mul(leaf.color.w).mul(kept);
    leafCover = leafCover.add(cl);
    leafRgb = leafRgb.add(leaf.color.xyz.mul(cl));
    leafOct = leafOct.add(leaf.normal.xy.mul(cl));
    leafLight = leafLight.add(leaf.normal.z.mul(cl));
    if (single) return;
    const wood = { color: texture(atlas.albedo, at(0)), normal: texture(atlas.normal, at(0)) };
    const cw = w.mul(inFrame).mul(wood.color.w);
    woodCover = woodCover.add(cw);
    woodRgb = woodRgb.add(wood.color.xyz.mul(cw));
    woodOct = woodOct.add(wood.normal.xy.mul(cw));
    woodLight = woodLight.add(wood.normal.z.mul(cw));
  });
  // Thin twigs bake to partial coverage: the wood keeps a lower cut than the leaves.
  const isLeaf = leafCover.greaterThan(0.3);
  const shown = isLeaf.or(woodCover.greaterThan(0.2));
  material.maskNode = material.maskNode ? (material.maskNode as Node<"bool">).and(shown) : shown;
  material.maskShadowNode = material.maskShadowNode ? (material.maskShadowNode as Node<"bool">).and(shown) : shown;
  if (role === "shadow") return { worldOffset };

  const octOf = (sum: V2, cover: Node<"float">): V2 => sum.div(cover.max(1e-4));
  const normalLocal = select(isLeaf, octDecode(octOf(leafOct, leafCover)), octDecode(octOf(woodOct, woodCover)));
  const normalWorld = normalize(instance.basis.mul(normalLocal));
  material.normalNode = normalize(cameraViewMatrix.mul(vec4(normalWorld, 0)).xyz);
  let leafColor: V3 = leafRgb.div(leafCover.max(1e-4));
  let woodColor: V3 = woodRgb.div(woodCover.max(1e-4));
  if (look?.crown) {
    const { depth, translucency } = look.crown;
    leafColor = seasonTint(leafColor, look.tint).mul(instanceTone(instance.seed)).mul(crownShade(leafLight.div(leafCover.max(1e-4)), depth));
    woodColor = woodColor.mul(crownShade(woodLight.div(woodCover.max(1e-4)), depth));
    lightLeaves(material, select(isLeaf, throughColor(leafColor, translucency), vec3(0, 0, 0)));
  }
  if (look) {
    const up = (from: number, to: number) => smoothstep(from, to, max(normalWorld.y, 0));
    leafColor = mix((look.crown ? leafColor : leafColor.mul(look.tint)).mul(float(1).sub(look.wet.mul(0.45))), look.snowColor, clamp(look.snowLeaf.mul(up(0.15, 0.6)), 0, 1));
    woodColor = mix(woodColor.mul(float(1).sub(look.wet.mul(0.45))), look.snowColor, clamp(look.snowWood.mul(up(0.35, 0.85)), 0, 1));
    (material as unknown as { roughnessNode?: Node | null }).roughnessNode = float(0.85).mul(float(1).sub(look.wet.mul(0.45)));
  }
  material.colorNode = vec4(select(isLeaf, leafColor, woodColor), 1);
  return { worldOffset };
}
