// The selection outline (plan phase 4 step 3; INV-A04): Forge WebGL's
// EditorSelectionOutline (src/scene/editorSelectionOutline.ts @
// forge-webgl-final: three's OutlinePass over proxies of the selected
// meshes, accent #2f6fed, the hidden edge drawn as the visible one, no glow,
// no pulse) rewritten as a pass of the drawing layer, after the frame:
//
// 1. the selected actors' drawn parts (picker.ts) into a mask, unjittered,
//    one instanced draw per geometry;
// 2. a full-screen quad into the layer's target: where the mask is off but a
//    neighbour within OUTLINE_PIXELS is on, the accent colour. An outline
//    therefore shows through what covers the selection, as Forge's did.
//
// A pick surface (a terrain) has no outline: its drawn triangles are a
// shared patch displaced on the GPU (Forge left it out for the same reason).

import {
  Color,
  InstancedMesh,
  MeshBasicNodeMaterial,
  NodeMaterial,
  NormalBlending,
  QuadMesh,
  RenderTarget,
  Scene,
  UnsignedByteType,
  Vector2,
  type BufferGeometry,
  type Camera,
  type Matrix4,
  type Node,
  type WebGPURenderer,
} from "three/webgpu";
import { float, Fn, max, screenUV, texture, uniform, vec2, vec4 } from "three/tsl";
import type { ActorId } from "../../core/index.ts";
import type { OverlayPass } from "./overlay.ts";
import type { ScenePicker } from "./picker.ts";

/** Forge's `--forge-accent`, the outline's colour. */
export const OUTLINE_COLOR = 0x2f6fed;
/** Outline width in device pixels (Forge: edge thickness 1.5 at strength 4.5, a solid line of about two pixels). */
const OUTLINE_PIXELS = 2;

export interface SelectionOutline extends OverlayPass {
  /** Instanced proxy draws in the last mask (a test witness). */
  readonly proxies: number;
  dispose(): void;
}

export function createSelectionOutline(picker: ScenePicker, selected: () => readonly ActorId[]): SelectionOutline {
  const mask = new RenderTarget(1, 1, { type: UnsignedByteType, depthBuffer: true, samples: 0 });
  const maskScene = new Scene();
  maskScene.name = "editor selection mask";
  const maskMaterial = new MeshBasicNodeMaterial({ color: 0xffffff });
  maskMaterial.name = "editor selection mask";
  const groups = new Map<BufferGeometry, InstancedMesh>();
  let proxies = 0;

  const texel = uniform(new Vector2(1, 1));
  const maskTexture = texture(mask.texture);
  const edgeMaterial = new NodeMaterial();
  edgeMaterial.name = "editor selection outline";
  const accent = uniform(new Color(OUTLINE_COLOR));
  edgeMaterial.fragmentNode = Fn(() => {
    const at = (dx: number, dy: number): Node<"float"> => maskTexture.sample(screenUV.add(vec2(dx, dy).mul(texel))).r as Node<"float">;
    let around: Node<"float"> = float(0);
    for (let radius = 1; radius <= OUTLINE_PIXELS; radius += 1) {
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]] as const) {
        around = max(around, at(dx * radius, dy * radius)) as Node<"float">;
      }
    }
    const edge = around.sub(at(0, 0)).clamp(0, 1);
    return vec4(accent, edge);
  })();
  edgeMaterial.blending = NormalBlending;
  edgeMaterial.transparent = true;
  edgeMaterial.depthTest = false;
  edgeMaterial.depthWrite = false;
  const quad = new QuadMesh(edgeMaterial);

  const gather = (): Map<BufferGeometry, Matrix4[]> => {
    const byGeometry = new Map<BufferGeometry, Matrix4[]>();
    const ids = selected();
    if (ids.length === 0) return byGeometry;
    picker.parts(new Set(ids), ({ geometry, matrix }) => {
      const list = byGeometry.get(geometry);
      if (list) list.push(matrix);
      else byGeometry.set(geometry, [matrix]);
    });
    return byGeometry;
  };

  const syncProxies = (byGeometry: Map<BufferGeometry, Matrix4[]>): void => {
    for (const [geometry, proxy] of groups) {
      if (byGeometry.has(geometry)) continue;
      proxy.removeFromParent();
      proxy.dispose();
      groups.delete(geometry);
    }
    for (const [geometry, matrices] of byGeometry) {
      let proxy = groups.get(geometry);
      if (!proxy || proxy.instanceMatrix.count < matrices.length) {
        if (proxy) {
          proxy.removeFromParent();
          proxy.dispose();
        }
        let capacity = 4;
        while (capacity < matrices.length) capacity *= 2;
        proxy = new InstancedMesh(geometry, maskMaterial, capacity);
        proxy.frustumCulled = false;
        proxy.matrixAutoUpdate = false;
        groups.set(geometry, proxy);
        maskScene.add(proxy);
      }
      matrices.forEach((matrix, index) => proxy!.setMatrixAt(index, matrix));
      proxy.count = matrices.length;
      proxy.instanceMatrix.needsUpdate = true;
    }
    proxies = groups.size;
  };

  return {
    get proxies() {
      return proxies;
    },
    render(renderer: WebGPURenderer, camera: Camera, size: Vector2, target: RenderTarget) {
      const byGeometry = gather();
      syncProxies(byGeometry);
      if (byGeometry.size === 0) return;
      mask.setSize(size.x, size.y);
      texel.value.set(1 / size.x, 1 / size.y);
      renderer.setRenderTarget(mask);
      renderer.setClearColor(0x000000, 0);
      renderer.clear();
      renderer.render(maskScene, camera);
      renderer.setRenderTarget(target);
      quad.render(renderer);
    },
    dispose() {
      for (const proxy of groups.values()) proxy.dispose();
      groups.clear();
      maskScene.clear();
      mask.dispose();
      maskMaterial.dispose();
      edgeMaterial.dispose();
    },
  };
}
