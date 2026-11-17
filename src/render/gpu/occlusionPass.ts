// The occluder pre-pass and its GPU Hi-Z (plan 5c R9a O2 / O3): each frame of
// a level with occlusion culling, before the GPU-driven cull:
//
// 1. The world's occluder scene (`render/sync/occluders.ts`: depth twins of
//    the large opaque statics, nothing else, no lights) is drawn from the
//    main camera into a depth target at drawing-buffer size. Reversed depth:
//    near 1, cleared far 0.
// 2. Compute: the depth is copied into level 0 of one packed storage buffer,
//    then each next level keeps the farthest (smallest) of its up to 2 × 2
//    children: the layout of `engine/world/hiZ.ts` `hiZLayout`, so the CPU
//    reference (`packHiZ`, `sphereOccludedPacked`) checks it bit for bit.
// 3. The GPU-driven batches' main-view cull tests every instance's bounding
//    sphere against it (`gpuDrivenBatch.ts`, O4) with this frame's
//    view-projection; shadow and camera views never do.
//
// The buffers and compute nodes are rebuilt only when the drawing size
// changes (`generation`). WebGPU only.

import { DepthTexture, FloatType, Matrix4, RenderTarget, StorageBufferAttribute, Vector2, Vector4, type Camera, type ComputeNode, type Scene, type WebGPURenderer } from "three/webgpu";
import * as TSLTyped from "three/tsl";
import { hiZLayout, type HiZLayout } from "../../engine/world/hiZ.ts";

// TSL's generic typings reject the unsigned min chains below; built untyped (as puddleReflections.ts).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const { Fn, If, instanceIndex, int, ivec2, min, storage, textureLoad, uint } = TSLTyped as unknown as Record<string, any>;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyNode = any;

/** Most Hi-Z levels a shader reads (a 1 × 1 top level of 32768 px needs 16). */
export const MAX_HIZ_LEVELS = 16;

/** This frame's Hi-Z as the GPU cull reads it. */
export interface GpuOcclusion {
  readonly buffer: StorageBufferAttribute;
  readonly layout: HiZLayout;
  /** (width, height, offset, 0) per level, padded to {@link MAX_HIZ_LEVELS}. */
  readonly levels: readonly Vector4[];
  /** The view-projection the occluders were drawn with (the main camera's, this frame). */
  readonly viewProjection: Matrix4;
  /** Bumps when the buffer is replaced (resize). */
  readonly generation: number;
}

export interface OcclusionPass {
  /** Draws `occluders` from `camera` and builds the Hi-Z; null when there is nothing to occlude with. */
  update(occluders: Scene | null, camera: Camera): GpuOcclusion | null;
  dispose(): void;
}

interface Built {
  readonly width: number;
  readonly height: number;
  readonly target: RenderTarget;
  readonly buffer: StorageBufferAttribute;
  readonly layout: HiZLayout;
  readonly levels: Vector4[];
  readonly nodes: ComputeNode[];
}

function build(width: number, height: number): Built {
  const layout = hiZLayout(width, height);
  if (layout.levels.length > MAX_HIZ_LEVELS) throw new Error(`occlusion: ${width} × ${height} needs more than ${MAX_HIZ_LEVELS} Hi-Z levels`);
  const target = new RenderTarget(width, height, { depthTexture: new DepthTexture(width, height, FloatType) });
  target.texture.name = "occluder depth";
  const buffer = new StorageBufferAttribute(new Float32Array(layout.total), 1);
  const hiz = storage(buffer, "float", layout.total);
  const nodes: ComputeNode[] = [];
  const copy = Fn(() => {
    If(instanceIndex.lessThan(uint(width * height)), () => {
      const x = int(instanceIndex.mod(uint(width))), y = int(instanceIndex.div(uint(width)));
      hiz.element(instanceIndex).assign(textureLoad(target.depthTexture!, ivec2(x, y)).x);
    });
  })().compute(width * height, [64]);
  copy.name = "hiz level 0";
  nodes.push(copy);
  for (let index = 1; index < layout.levels.length; index += 1) {
    const level = layout.levels[index]!, parent = layout.levels[index - 1]!;
    const texel = (x: AnyNode, y: AnyNode): AnyNode => hiz.element(uint(parent.offset).add(y.mul(uint(parent.width))).add(x));
    const reduce = Fn(() => {
      If(instanceIndex.lessThan(uint(level.width * level.height)), () => {
        const x = instanceIndex.mod(uint(level.width)), y = instanceIndex.div(uint(level.width));
        const x0 = x.mul(uint(2)), y0 = y.mul(uint(2));
        // An odd edge repeats its last child: the farthest of a set is unchanged by a duplicate.
        const x1 = min(x0.add(uint(1)), uint(parent.width - 1)), y1 = min(y0.add(uint(1)), uint(parent.height - 1));
        // Reversed depth: the farthest is the smallest.
        const farthest = min(min(texel(x0, y0), texel(x1, y0)), min(texel(x0, y1), texel(x1, y1)));
        hiz.element(uint(level.offset).add(instanceIndex)).assign(farthest);
      });
    })().compute(level.width * level.height, [64]);
    reduce.name = `hiz level ${index}`;
    nodes.push(reduce);
  }
  const levels = Array.from({ length: MAX_HIZ_LEVELS }, (_, index) => {
    const level = layout.levels[index];
    return level ? new Vector4(level.width, level.height, level.offset, 0) : new Vector4(1, 1, 0, 0);
  });
  return { width, height, target, buffer, layout, levels, nodes };
}

export function createOcclusionPass(renderer: WebGPURenderer): OcclusionPass {
  let built: Built | null = null;
  let generation = 0;
  const size = new Vector2();
  const viewProjection = new Matrix4();
  const release = (): void => {
    if (!built) return;
    for (const node of built.nodes) node.dispose();
    built.buffer.dispose(); built.target.dispose();
    built = null;
  };
  return {
    update(occluders, camera) {
      if (!occluders || occluders.children.length === 0) return null;
      renderer.getDrawingBufferSize(size);
      const width = Math.max(1, Math.floor(size.x)), height = Math.max(1, Math.floor(size.y));
      if (!built || built.width !== width || built.height !== height) { release(); built = build(width, height); generation += 1; }
      const previousTarget = renderer.getRenderTarget(), previousMrt = renderer.getMRT();
      try {
        renderer.setMRT(null);
        renderer.setRenderTarget(built.target);
        renderer.render(occluders, camera);
      } finally {
        renderer.setRenderTarget(previousTarget);
        renderer.setMRT(previousMrt);
      }
      renderer.compute(built.nodes);
      camera.updateMatrixWorld();
      viewProjection.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
      return { buffer: built.buffer, layout: built.layout, levels: built.levels, viewProjection, generation };
    },
    dispose: release,
  };
}
