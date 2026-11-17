// Planar reflections of the Puddles (plan phase 5a step 6): Forge WebGL's
// PuddlePlanarReflections (engine/render-three/puddlePlanarReflections.ts @
// forge-webgl-final), its rules unchanged, on three's `reflector()` (phase 7's
// decision for flat surfaces):
// - a puddle asks for one when its mode is planar, its quality is not low and
//   its planar strength is above 0; the quality profile's terrain water tier
//   is the ceiling (low: off; high only where both are high);
// - puddles at the same level and quality share one capture; the visible
//   groups covering at least 1 % of the screen (0.75 % for one already held)
//   get a capture, at most 2 (Forge's puddle allowance), those already held
//   first; chosen again every 0.1 s and on any change;
// - a capture's plane is the water level (its target, facing +Y); it renders
//   once a frame (`bounces: false`), hiding the material that draws it.
// Forge's fixed 256 / 512 px targets become a share of the drawing buffer
// (medium 1/4, high 1/2); its footprint keeps Forge's texel size.
// Each capture's virtual camera is a GPU-driven camera view (plan 5c R9a
// step 1, `render/gpu/gpuDriven.ts`): the GPU-driven batches it draws are
// culled for the reflection itself.

import * as THREE from "three/webgpu";
import * as TSLTyped from "three/tsl";
import type { CameraViews } from "../gpu/gpuDriven.ts";
import type { PuddleMaterial, PuddleReflection } from "../materials/puddle.ts";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const TSL = TSLTyped as unknown as Record<string, any>;

export type PuddleReflectionQuality = "medium" | "high";
export type PuddleReflectionCeiling = "off" | PuddleReflectionQuality;

export interface PuddleReflectionSettings {
  readonly level: number;
  readonly mode: "environment" | "planar";
  readonly quality: "low" | "medium" | "high";
  readonly planarStrength: number;
}

interface Entry {
  readonly mesh: THREE.Mesh;
  readonly material: PuddleMaterial;
  settings: PuddleReflectionSettings;
}

interface Source {
  readonly reflection: PuddleReflection;
  readonly target: THREE.Object3D;
}

/** Forge's capture limit for puddles, and its selection interval. */
export const PUDDLE_REFLECTION_SOURCES = 2;
const SELECT_INTERVAL_MS = 100;
const SCALE: Record<PuddleReflectionQuality, number> = { medium: 0.25, high: 0.5 };
const TEXEL: Record<PuddleReflectionQuality, number> = { medium: 1 / 256, high: 1 / 512 };

/** Forge's planarReflectionScreenCoverage: the share of the screen the box can reach; null when a corner is behind the eye (render, never skip). */
export function puddleScreenCoverage(bounds: THREE.Box3, viewProjection: THREE.Matrix4): number | null {
  if (bounds.isEmpty()) return 0;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  const corner = new THREE.Vector4();
  for (let index = 0; index < 8; index += 1) {
    corner.set(index & 1 ? bounds.max.x : bounds.min.x, index & 2 ? bounds.max.y : bounds.min.y, index & 4 ? bounds.max.z : bounds.min.z, 1);
    corner.applyMatrix4(viewProjection);
    if (corner.w <= 0) return null;
    const x = corner.x / corner.w;
    const y = corner.y / corner.w;
    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x);
    minY = Math.min(minY, y);
    maxY = Math.max(maxY, y);
  }
  const width = Math.min(maxX, 1) - Math.max(minX, -1);
  const height = Math.min(maxY, 1) - Math.max(minY, -1);
  if (width <= 0 || height <= 0) return 0;
  return (width * height) / 4;
}

/**
 * A capture of the plane y = `level`: the reflector node and its target, added under `root`. With
 * `views` its virtual camera is a GPU-driven camera view (R9a step 1): it culls the GPU-driven
 * batches as the main view mirrored through the water and never draws the main camera's lists.
 */
export type PuddleSourceFactory = (level: number, quality: PuddleReflectionQuality, root: THREE.Object3D, views?: CameraViews) => Source & { dispose(): void };

const eye = new THREE.Vector3();
const point = new THREE.Vector3();
const normal = new THREE.Vector3();
const rotation = new THREE.Matrix4();

export const createPuddleReflectionSource: PuddleSourceFactory = (level, quality, root, views) => {
  const node = TSL.reflector({ resolutionScale: SCALE[quality], bounces: false });
  const target = node.target as THREE.Object3D;
  target.position.set(0, level, 0);
  // The reflector's plane faces its target's +Z: turned to +Y.
  target.rotation.x = -Math.PI / 2;
  root.add(target);
  const unregister = views?.add({
    view(main) {
      const camera = node.reflector.getVirtualCamera(main) as THREE.Camera;
      target.updateMatrixWorld();
      point.setFromMatrixPosition(target.matrixWorld);
      normal.set(0, 0, 1).applyMatrix4(rotation.extractRotation(target.matrixWorld)).normalize();
      main.getWorldPosition(eye);
      // three's reflector skips the render when the plane faces away from the eye.
      const active = point.clone().sub(eye).dot(normal) <= 0;
      return { camera, mirror: [normal.x, normal.y, normal.z, -normal.dot(point)], active };
    },
  });
  const projection = TSL.uniform(new THREE.Matrix4()).onRenderUpdate(({ camera }: { camera: THREE.Camera }) => {
    const reflected = node.reflector.getVirtualCamera(camera) as THREE.Camera;
    return projection.value.multiplyMatrices(reflected.projectionMatrix, reflected.matrixWorldInverse);
  });
  return {
    reflection: { node, texel: TEXEL[quality], projection },
    target,
    dispose() {
      unregister?.();
      target.removeFromParent();
      node.dispose?.();
    },
  };
};

export class PuddleReflections {
  private readonly entries = new Map<THREE.Mesh, Entry>();
  private readonly sources = new Map<string, Source & { dispose(): void }>();
  private ceiling: PuddleReflectionCeiling = "high";
  private dirty = true;
  private lastSelection = -Infinity;
  private camera: THREE.Camera | null = null;
  private readonly frustum = new THREE.Frustum();
  private readonly viewProjection = new THREE.Matrix4();
  private readonly root: THREE.Object3D;
  private readonly create: PuddleSourceFactory;
  private readonly views: CameraViews | undefined;

  constructor(root: THREE.Object3D, create: PuddleSourceFactory = createPuddleReflectionSource, views?: CameraViews) {
    this.root = root;
    this.create = create;
    this.views = views;
  }

  /** The captures held now (for tests and the debug readout). */
  get sourceCount(): number {
    return this.sources.size;
  }

  set(mesh: THREE.Mesh, material: PuddleMaterial, settings: PuddleReflectionSettings): void {
    const entry = this.entries.get(mesh);
    if (entry) entry.settings = settings;
    else this.entries.set(mesh, { mesh, material, settings });
    this.invalidate();
  }

  remove(mesh: THREE.Mesh): void {
    const entry = this.entries.get(mesh);
    if (!entry) return;
    entry.material.setReflection(null);
    this.entries.delete(mesh);
    this.invalidate();
  }

  setCeiling(ceiling: PuddleReflectionCeiling): void {
    if (this.ceiling === ceiling) return;
    this.ceiling = ceiling;
    this.invalidate();
  }

  /** Chooses the captures for `camera` when something changed or every 0.1 s. */
  update(camera: THREE.Camera, now = performance.now()): void {
    if (!this.dirty && this.camera === camera && now - this.lastSelection < SELECT_INTERVAL_MS) return;
    this.select(camera);
    this.dirty = false;
    this.camera = camera;
    this.lastSelection = now;
  }

  dispose(): void {
    for (const entry of this.entries.values()) entry.material.setReflection(null);
    this.entries.clear();
    for (const source of this.sources.values()) source.dispose();
    this.sources.clear();
  }

  private effective(settings: PuddleReflectionSettings): PuddleReflectionQuality | null {
    if (settings.mode !== "planar" || settings.quality === "low" || settings.planarStrength <= 0 || this.ceiling === "off") return null;
    return settings.quality === "high" && this.ceiling === "high" ? "high" : "medium";
  }

  private key(settings: PuddleReflectionSettings, quality: PuddleReflectionQuality): string {
    return `${settings.level}:${quality}`;
  }

  /** Drops captures nobody can use at once (delete, mode or quality edits), even without a frame. */
  private invalidate(): void {
    this.dirty = true;
    const live = new Set<string>();
    for (const { settings } of this.entries.values()) {
      const quality = this.effective(settings);
      if (quality) live.add(this.key(settings, quality));
    }
    for (const [key, source] of this.sources) {
      if (live.has(key)) continue;
      source.dispose();
      this.sources.delete(key);
    }
    this.assign(new Set(this.sources.keys()));
  }

  private select(camera: THREE.Camera): void {
    camera.updateMatrixWorld();
    this.viewProjection.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    this.frustum.setFromProjectionMatrix(this.viewProjection, camera.coordinateSystem, camera.reversedDepth);
    const groups = new Map<string, { level: number; quality: PuddleReflectionQuality; bounds: THREE.Box3 }>();
    for (const { mesh, settings } of this.entries.values()) {
      const quality = this.effective(settings);
      if (!quality || !mesh.parent) continue;
      let shown = true;
      for (let node: THREE.Object3D | null = mesh; node; node = node.parent) shown &&= node.visible;
      if (!shown) continue;
      const bounds = new THREE.Box3().setFromObject(mesh);
      if (bounds.isEmpty() || !this.frustum.intersectsBox(bounds)) continue;
      const key = this.key(settings, quality);
      const group = groups.get(key) ?? { level: settings.level, quality, bounds: new THREE.Box3() };
      group.bounds.union(bounds);
      groups.set(key, group);
    }
    const visible = [...groups]
      .filter(([key, group]) => {
        const coverage = puddleScreenCoverage(group.bounds, this.viewProjection);
        // Hysteresis keeps a held capture around the 1 % gate.
        return coverage === null || coverage >= (this.sources.has(key) ? 0.0075 : 0.01);
      })
      .sort(([a], [b]) => Number(this.sources.has(b)) - Number(this.sources.has(a)) || a.localeCompare(b))
      .slice(0, PUDDLE_REFLECTION_SOURCES);
    const wanted = new Set(visible.map(([key]) => key));
    for (const [key, source] of this.sources) {
      if (wanted.has(key)) continue;
      source.dispose();
      this.sources.delete(key);
    }
    for (const [key, group] of visible) {
      if (!this.sources.has(key)) this.sources.set(key, this.create(group.level, group.quality, this.root, this.views));
    }
    this.assign(wanted);
  }

  private assign(wanted: ReadonlySet<string>): void {
    for (const { material, settings } of this.entries.values()) {
      const quality = this.effective(settings);
      const key = quality ? this.key(settings, quality) : "";
      material.setReflection(wanted.has(key) ? (this.sources.get(key)?.reflection ?? null) : null);
    }
  }
}
