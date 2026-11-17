// Forge staticDetailCulling / foliageFade, expressed as TSL mask slots.
// The per-instance origin/scale excludes the model's own node transforms.
import { Vector2, Vector3, type InstancedBufferAttribute, type Material, type NodeMaterial, type Node } from "three/webgpu";
import { bool, distance, dot, float, fract, instancedDynamicBufferAttribute, max, screenCoordinate, smoothstep, uniform, varying, vec2 } from "three/tsl";
import { detailCullWindow } from "../../engine/world/detailCulling.ts";

export function createDetailFade(distanceAtScaleOne: number, placements: InstancedBufferAttribute) {
  const origin = uniform(new Vector3());
  const range = uniform(new Vector2(...detailCullWindow(distanceAtScaleOne, 1)));
  const placement = varying(instancedDynamicBufferAttribute<"vec4">(placements, "vec4"));
  const scaledDistance = distance(origin, placement.xyz).div(max(placement.w, 0.000001));
  const hidden = smoothstep(range.x, range.y, scaledDistance);
  const dither = fract(float(52.9829189).mul(fract(dot(screenCoordinate.xy, vec2(0.06711056, 0.00583715)))));
  const keeps = hidden.lessThanEqual(dither);
  const clones = new Map<Material, Material>();
  return {
    material(source: Material): Material {
      if (!(source as NodeMaterial).isNodeMaterial) return source;
      const existing = clones.get(source); if (existing) return existing;
      const clone = source.clone() as NodeMaterial;
      if (clone.isNodeMaterial) {
        clone.maskNode = clone.maskNode ? bool(clone.maskNode as Node<"bool">).and(keeps) : keeps;
        clone.maskShadowNode = clone.maskShadowNode ? bool(clone.maskShadowNode as Node<"bool">).and(keeps) : keeps;
      }
      clones.set(source, clone); return clone;
    },
    update(camera: Vector3, qualityScale: number) {
      origin.value.copy(camera); range.value.set(...detailCullWindow(distanceAtScaleOne, qualityScale));
    },
    dispose() { for (const clone of clones.values()) clone.dispose(); clones.clear(); },
  };
}
