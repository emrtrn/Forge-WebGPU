// The precipitation cover (plan phase W3, architecture §4.9): one source,
// four consumers (rain and snow now, the surfaces, puddles and terrain snow
// depth later). Two top-down depth maps of what blocks the sky around the
// camera (engine/environment/precipitationCover.ts has the layout, the
// decoding and the CPU reference; the shader below repeats them).
//
// - What draws into it: static batches, shapes, roads and HLOD proxies (CPU
//   meshes marked with `markCover`, `COVER_LAYER`) and the GPU-driven batches
//   that cover (`precipitationCover`, a `cover` view culled like a shadow view,
//   gpuDriven.ts). Terrain, plants and moving objects do not.
// - How: the world's scene from an orthographic camera looking straight down,
//   with a shadow-pass override material (three keeps each material's
//   instance position, as for a shadow map), both faces, into a depth texture.
// - When: only while something falls or the surface is wet or snowy, and
//   then only when a square must follow the camera or what it shows changed
//   (an edit, a streamed cell, a batch that finished preparing; at most four
//   times a second). A still frame draws nothing. Where the level has a World
//   Environment and nothing falls, changed content is drawn ahead (at most
//   once a second; nothing reads it), so the first drop compiles nothing. A
//   draw, not compileAsync: three's precompile leaves some objects' shadow-
//   material pipelines to the first draw.
// - Outside both squares nothing is covered; near a square's edge the near
//   map hands over to the far one, and the far one fades out.

import {
  DepthTexture, DoubleSide, FloatType, MeshBasicNodeMaterial, OrthographicCamera, RenderTarget, UnsignedIntType, Vector2,
  type Camera, type Node, type Scene, type WebGPURenderer,
} from "three/webgpu";
import * as TSLTyped from "three/tsl";
import {
  COVER_CASCADES, COVER_EDGE_FADE, COVER_SOFTNESS, SNOW_COVER_EDGE_OFFSETS, SNOW_COVER_EDGE_WEIGHT, SNOW_COVER_OFFSETS, SNOW_COVER_SOFTNESS,
  coverNeedsRecentre, coverTexel, placeCover,
  type CoverCascadeSpec, type CoverPlacement,
} from "../../engine/environment/precipitationCover.ts";
import type { CoverViewSource } from "../gpu/gpuDriven.ts";
import { COVER_LAYER } from "../gpu/gpuDrivenBatch.ts";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyNode = any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const TSL = TSLTyped as unknown as Record<string, any>;
const { Fn, If, abs, clamp, float, floor, ivec2, max, select, smoothstep, textureLoad, uniform, vec3 } = TSL;

/** Least seconds between two redraws for changed content (camera moves redraw at once). */
const CONTENT_REDRAW_SECONDS = 0.25;
/** Least seconds between two draws ahead (nothing falls; the content changed). */
const COMPILE_SECONDS = 1;

export interface PrecipitationCoverOptions {
  /** The renderer keeps a reversed (float) depth buffer. */
  readonly reversedDepth: boolean;
  /** WebGPU writes texture row 0 at the top of the view, WebGL at the bottom. */
  readonly webgpu: boolean;
  /** Where the cover cameras join the GPU-driven cull; absent where nothing is GPU-driven. */
  readonly coverViews?: { addCover(source: CoverViewSource): () => void };
  /** Whether anything reads the cover now (something falls, the surface is wet or snowy). */
  readonly wanted: () => boolean;
  /** Whether it may be wanted (the level has a World Environment): it is drawn once ahead, so the first drop compiles nothing. */
  readonly possible: () => boolean;
}

export interface PrecipitationCoverStats {
  /** Cascade draws so far. */
  readonly redraws: number;
  /** Cascades drawn in the last rendered frame. */
  readonly lastFrameRedraws: number;
}

export interface PrecipitationCover {
  /** TSL: how covered a world point is, 0..1 (vertex or fragment stage). */
  coverAt(position: Node<"vec3">): Node<"float">;
  /** Terrain displacement uses the same map, expanded around each terrain vertex. */
  snowCoverAt(position: Node<"vec3">, spacing: Node<"float">): Node<"float">;
  /** Something drawn into the cover changed. */
  invalidate(): void;
  /** Decides this frame's draws (the GPU-driven cull asks it too). */
  plan(camera: Camera): void;
  /** Draws the cascades the plan asked for; after the GPU-driven cull, before the frame. */
  render(renderer: WebGPURenderer, scene: Scene, camera: Camera): void;
  readonly stats: PrecipitationCoverStats;
  dispose(): void;
}

interface Cascade {
  readonly spec: CoverCascadeSpec;
  readonly camera: OrthographicCamera;
  readonly target: RenderTarget;
  placement: CoverPlacement | null;
  pending: boolean;
  /** `compile`: the pending pass is drawn ahead only to prepare its pipelines (nothing falls yet). */
  mode: "draw" | "compile";
  readonly u: { center: AnyNode; top: AnyNode; bottom: AnyNode; valid: AnyNode };
}

/** Both faces whatever the material (a single-sided roof seen from above still covers); three sets `side` per object. */
function bothFaces(material: MeshBasicNodeMaterial): void {
  Object.defineProperty(material, "side", { get: () => DoubleSide, set: () => {}, configurable: true });
}

export function createPrecipitationCover(options: PrecipitationCoverOptions): PrecipitationCover {
  const depthMaterial = new MeshBasicNodeMaterial();
  depthMaterial.name = "precipitation-cover";
  depthMaterial.fog = false;
  depthMaterial.colorWrite = false;
  (depthMaterial as unknown as { isShadowPassMaterial: boolean }).isShadowPassMaterial = true;
  bothFaces(depthMaterial);

  const cascades: Cascade[] = COVER_CASCADES.map((spec, index) => {
    const half = spec.size / 2;
    const camera = new OrthographicCamera(-half, half, half, -half, 0, 1);
    camera.name = `precipitation-cover-${index}`;
    camera.up.set(0, 0, -1);
    camera.layers.set(COVER_LAYER);
    // three turns this on at a camera's first render with a reversed buffer; the GPU-driven cull reads the projection before that.
    (camera as unknown as { _reversedDepth: boolean })._reversedDepth = options.reversedDepth;
    const target = new RenderTarget(spec.resolution, spec.resolution, { depthBuffer: true });
    target.texture.name = `precipitation-cover-${index}`;
    const depth = new DepthTexture(spec.resolution, spec.resolution);
    depth.type = options.reversedDepth ? FloatType : UnsignedIntType;
    target.depthTexture = depth;
    return {
      spec, camera, target, placement: null, pending: false, mode: "draw" as const,
      u: { center: uniform(new Vector2()), top: uniform(0), bottom: uniform(0), valid: uniform(0) },
    };
  });

  let contentDirty = true;
  let contentDrawnAt = Number.NEGATIVE_INFINITY;
  let plannedFor: Camera | null = null;
  let planned = false;
  let redraws = 0;
  let lastFrameRedraws = 0;
  let compileDirty = true;
  let compiledAt = Number.NEGATIVE_INFINITY;
  const eye = { x: 0, y: 0, z: 0 };

  const unregister: Array<() => void> = [];

  const place = (cascade: Cascade, placement: CoverPlacement): void => {
    cascade.placement = placement;
    const { camera } = cascade;
    camera.near = 0;
    camera.far = placement.top - placement.bottom;
    camera.position.set(placement.centerX, placement.top, placement.centerZ);
    camera.lookAt(placement.centerX, placement.bottom, placement.centerZ);
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld(true);
  };

  /** One cascade's share and amount at `p` (the CPU reference's `coverAt` step). */
  const weightAt = (cascade: Cascade, p: AnyNode): AnyNode => {
    const rel = p.xz.sub(cascade.u.center);
    const r = max(abs(rel.x), abs(rel.y)).div(cascade.spec.size / 2);
    return float(1).sub(smoothstep(1 - COVER_EDGE_FADE, 1, r)).mul(cascade.u.valid);
  };
  const sample = (cascade: Cascade, p: AnyNode, softness = COVER_SOFTNESS): AnyNode => {
    const { spec, u } = cascade;
    const half = spec.size / 2;
    const rel = p.xz.sub(u.center);
    const cell = floor(rel.add(half).div(coverTexel(spec)));
    const last = spec.resolution - 1;
    const column = clamp(cell.x, 0, last);
    const row = options.webgpu ? clamp(cell.y, 0, last) : float(last).sub(clamp(cell.y, 0, last));
    const depth = textureLoad(cascade.target.depthTexture, ivec2(column, row)).x;
    const t = options.reversedDepth ? float(1).sub(depth) : depth;
    const height = u.top.sub(t.mul(u.top.sub(u.bottom)));
    const inside = max(abs(rel.x), abs(rel.y)).lessThan(half);
    return select(inside.and(t.lessThan(1 - 1e-6)), smoothstep(0, softness, height.sub(p.y)), float(0));
  };

  const paddedSnow = (cascade: Cascade, p: AnyNode, spacing: AnyNode, weight: AnyNode): AnyNode => Fn(() => {
    const amount = float(0).toVar();
    If(weight.greaterThan(0), () => {
      amount.assign(sample(cascade, p, SNOW_COVER_SOFTNESS));
      If(amount.lessThan(1), () => {
        for (const [x, z] of SNOW_COVER_OFFSETS.slice(1)) {
          const offset = vec3(spacing.mul(x), 0, spacing.mul(z));
          amount.assign(max(amount, sample(cascade, p.add(offset), SNOW_COVER_SOFTNESS)));
        }
      });
      // Widen the height ramp for the exposed edge after the protected inner footprint.
      If(amount.lessThan(SNOW_COVER_EDGE_WEIGHT), () => {
        for (const [x, z] of SNOW_COVER_EDGE_OFFSETS) {
          const offset = vec3(spacing.mul(x), 0, spacing.mul(z));
          amount.assign(max(amount, sample(cascade, p.add(offset), SNOW_COVER_SOFTNESS).mul(SNOW_COVER_EDGE_WEIGHT)));
        }
      });
    });
    return amount;
  })();

  /** This frame's draws, once per frame (the GPU-driven cull asks first, the render after it). */
  const plan = (camera: Camera): void => {
    if (planned && plannedFor === camera) return;
    planned = true;
    plannedFor = camera;
    const wanted = options.wanted();
    camera.updateMatrixWorld();
    eye.x = camera.matrixWorld.elements[12]!; eye.y = camera.matrixWorld.elements[13]!; eye.z = camera.matrixWorld.elements[14]!;
    const at: [number, number, number] = [eye.x, eye.y, eye.z];
    const now = performance.now() / 1000;
    const content = contentDirty && now - contentDrawnAt >= CONTENT_REDRAW_SECONDS;
    const compile = !wanted && compileDirty && now - compiledAt >= COMPILE_SECONDS && options.possible();
    for (const cascade of cascades) {
      cascade.pending = false;
      if (!at.every(Number.isFinite)) continue;
      if (compile) {
        // Compiled around the camera; nothing is drawn, so the square must be placed again before it is.
        place(cascade, placeCover(cascade.spec, at));
        cascade.placement = null;
        cascade.pending = true;
        cascade.mode = "compile";
        continue;
      }
      if (!wanted) continue;
      cascade.mode = "draw";
      const recentre = coverNeedsRecentre(cascade.spec, cascade.placement, at);
      if (!recentre && !content) continue;
      if (recentre) place(cascade, placeCover(cascade.spec, at));
      cascade.pending = true;
    }
  };

  for (const cascade of cascades) {
    const remove = options.coverViews?.addCover({ view: (main) => { plan(main); return { camera: cascade.camera, active: cascade.pending }; } });
    if (remove) unregister.push(remove);
  }

  return {
    coverAt(position) {
      const p = position as AnyNode;
      const [near, far] = cascades as [Cascade, Cascade];
      const nearWeight = weightAt(near, p);
      return nearWeight.mul(sample(near, p)).add(float(1).sub(nearWeight).mul(weightAt(far, p)).mul(sample(far, p))) as Node<"float">;
    },
    snowCoverAt(position, spacing) {
      const [near, far] = cascades as [Cascade, Cascade];
      const nearWeight = weightAt(near, position);
      const farWeight = float(1).sub(nearWeight).mul(weightAt(far, position));
      return nearWeight.mul(paddedSnow(near, position, spacing, nearWeight))
        .add(farWeight.mul(paddedSnow(far, position, spacing, farWeight))) as Node<"float">;
    },
    invalidate() {
      contentDirty = true;
      compileDirty = true;
    },
    plan,
    render(renderer, scene, camera) {
      plan(camera);
      planned = false;
      lastFrameRedraws = 0;
      const drawing = cascades.filter((cascade) => cascade.pending);
      if (drawing.length === 0) return;
      const target = renderer.getRenderTarget();
      const mrt = renderer.getMRT();
      const override = scene.overrideMaterial;
      const autoClear = renderer.autoClear;
      try {
        scene.overrideMaterial = depthMaterial;
        renderer.setMRT(null);
        renderer.autoClear = true;
        for (const cascade of drawing) {
          renderer.setRenderTarget(cascade.target);
          renderer.render(scene, cascade.camera);
          if (cascade.mode === "compile") {
            // Drawn only to prepare its pipelines and textures: nothing reads it until it is drawn for a placement.
            cascade.u.valid.value = 0;
            cascade.pending = false;
            redraws += 1;
            lastFrameRedraws += 1;
            continue;
          }
          const placement = cascade.placement!;
          cascade.u.center.value.set(placement.centerX, placement.centerZ);
          cascade.u.top.value = placement.top;
          cascade.u.bottom.value = placement.bottom;
          cascade.u.valid.value = 1;
          cascade.pending = false;
          redraws += 1;
          lastFrameRedraws += 1;
        }
      } finally {
        scene.overrideMaterial = override;
        renderer.autoClear = autoClear;
        renderer.setRenderTarget(target);
        renderer.setMRT(mrt);
      }
      if (drawing.some((cascade) => cascade.mode === "compile")) {
        compileDirty = false;
        compiledAt = performance.now() / 1000;
        return;
      }
      // Every square drawn now shows the current content.
      if (contentDirty && drawing.length === cascades.length) {
        contentDirty = false;
        contentDrawnAt = performance.now() / 1000;
      } else if (contentDirty) {
        // A recentre alone: the other square still shows the old content; draw it on the next content turn.
        contentDrawnAt = performance.now() / 1000 - CONTENT_REDRAW_SECONDS;
      }
    },
    get stats() {
      return { redraws, lastFrameRedraws };
    },
    dispose() {
      for (const remove of unregister) remove?.();
      for (const cascade of cascades) {
        cascade.target.depthTexture?.dispose();
        cascade.target.dispose();
      }
      depthMaterial.dispose();
    },
  };
}
