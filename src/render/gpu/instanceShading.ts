// Per-instance shading on a GPU-driven batch (vegetation plan PG2: foliage
// wind, plant response). An owner hands the batch a hook; the batch calls it
// for every material it builds (each view, each LOD part) with the instance's
// nodes, the same on both paths:
//
// - `origin`: the instance's world origin (its matrix's translation),
// - `scale`: its uniform scale,
// - `seed`: the low 24 bits of its seed (extras.y on the GPU path; the WebGL2
//   twin carries it in a float attribute, exact to 24 bits),
// - `template`: the vertex in template space (the part's matrix applied),
//   before any offset.
//
// The hook may set fragment nodes on the material (colour, mask) and return a
// world-space vertex offset; the batch turns the offset into the space its
// path positions in: template space through the instance's basis on the GPU
// path (main, camera and shadow views alike: the shadow composition reads the
// material's position node), mesh space on the twin (its InstancedMesh
// already applied the instance). The offset assumes rotation × uniform scale,
// as foliage instances are.

import {
  dot,
  floatBitsToUint,
  instancedDynamicBufferAttribute,
  mat3,
  modelWorldMatrixInverse,
  positionGeometry,
  positionLocal,
  transpose,
  uint,
  uniform,
  vec4,
} from "three/tsl";
import type { InstancedBufferAttribute, Matrix4, Node, NodeMaterial } from "three/webgpu";

export interface InstanceShadingNodes {
  readonly origin: Node<"vec3">;
  readonly scale: Node<"float">;
  readonly seed: Node<"uint">;
  readonly template: Node<"vec3">;
}

export interface InstanceShadingResult {
  /** World-space vertex offset, metres. */
  readonly worldOffset?: Node<"vec3">;
}

export type InstanceShading = (
  material: NodeMaterial,
  instance: InstanceShadingNodes,
  role: "main" | "shadow" | "camera",
) => InstanceShadingResult | void;

/** Seeds are compared in 24 bits on both paths. */
export const INSTANCE_SEED_MASK = 0xffffff;

const templateOf = (partLocal: Matrix4): Node<"vec3"> => uniform(partLocal.clone()).mul(vec4(positionGeometry, 1)).xyz;

/** GPU path: `instance` the instance's matrix, `extraY` its extras.y (the seed's bits as a float). */
export function applyGpuInstanceShading(
  hook: InstanceShading,
  material: NodeMaterial,
  role: "main" | "shadow" | "camera",
  nodes: { instance: Node<"mat4">; world: Node<"mat4">; scale: Node<"float">; extraY: Node<"float">; partLocal: Matrix4 },
): void {
  const result = hook(material, {
    origin: nodes.instance.mul(vec4(0, 0, 0, 1)).xyz,
    scale: nodes.scale,
    seed: (floatBitsToUint(nodes.extraY) as unknown as Node<"uint">).bitAnd(uint(INSTANCE_SEED_MASK)),
    template: templateOf(nodes.partLocal),
  }, role);
  if (!result?.worldOffset) return;
  // World -> template space: the transpose of rotation × scale, divided by scale².
  const basis = mat3(nodes.world);
  const column = nodes.world.mul(vec4(1, 0, 0, 0)).xyz;
  const local = (material.positionNode as Node<"vec3"> | null) ?? positionLocal;
  material.positionNode = local.add(transpose(basis).mul(result.worldOffset).div(dot(column, column).max(1e-8)));
}

/** The twin's per-instance attributes for a hook: origin + scale, and the seed. */
export interface CpuInstanceShadingAttributes {
  readonly placement: InstancedBufferAttribute;
  readonly seed: InstancedBufferAttribute;
}

/** WebGL2 twin: the mesh is an InstancedMesh whose instance matrices already place the vertex. */
export function applyCpuInstanceShading(
  hook: InstanceShading,
  material: NodeMaterial,
  role: "main" | "shadow" | "camera",
  attributes: CpuInstanceShadingAttributes,
  partLocal: Matrix4,
): void {
  const placement = instancedDynamicBufferAttribute<"vec4">(attributes.placement, "vec4");
  const seed = instancedDynamicBufferAttribute<"float">(attributes.seed, "float");
  const result = hook(material, {
    origin: placement.xyz,
    scale: placement.w,
    seed: uint(seed),
    template: templateOf(partLocal),
  }, role);
  if (!result?.worldOffset) return;
  const local = (material.positionNode as Node<"vec3"> | null) ?? positionLocal;
  material.positionNode = local.add(mat3(modelWorldMatrixInverse).mul(result.worldOffset));
}
