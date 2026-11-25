// Published families and models on an asset editor preview (vegetation plan
// PG5): columns drawn by the foliage path worlds use (render/foliage/
// foliageBatches.ts: LODs, impostor, materials, response, wind, GPU-driven or
// the WebGL2 twin), so what is approved is what a level draws. Columns stand
// in a row along X, each as wide as its model, with a metre grid and a
// vertical scale bar.

import {
  AmbientLight, Box3, BoxGeometry, BufferGeometry, Color, DirectionalLight, GridHelper, Group, LineBasicNodeMaterial, LineSegments,
  Matrix4, Mesh, PerspectiveCamera, Scene, Vector3,
} from "three/webgpu";
import { createFoliageBatches, type FoliageTypeDraw } from "../foliage/foliageBatches.ts";
import { resourceKey } from "../resources/resourceCache.ts";
import type { AssetPreviewContext } from "./assetPreview.ts";
import { createAssetPreviewControls } from "./assetPreviewControls.ts";
import type { PreviewEnvironment } from "./previewEnvironment.ts";
import { createPreviewLabels } from "./previewLabels.ts";

export interface StageColumn {
  readonly label: string;
  /** What is drawn; `id` must be the column's own. */
  readonly draw: FoliageTypeDraw;
  /** Instances beside each other on each axis (1: a single one). */
  readonly patch?: number;
  readonly seed: number;
}

export interface FamilyStage {
  /** Draws these columns; settles once their models are loaded. False when a later call came in between. */
  show(columns: readonly StageColumn[]): Promise<boolean>;
  focus(): void;
  /** Metres between the scale bar's marks. */
  readonly scale: number;
  dispose(): void;
}

/** Scale bar marks, metres: the smallest step that keeps at most ten. */
function barStep(height: number): number {
  for (const step of [0.1, 0.25, 0.5, 1, 2, 5, 10]) if (height / step <= 10) return step;
  return 20;
}

export function createFamilyStage(ctx: AssetPreviewContext, surface: HTMLElement, environment: PreviewEnvironment): FamilyStage {
  const scene = new Scene(), root = new Group(), camera = new PerspectiveCamera(35, 1, 0.01, 2000);
  scene.background = new Color(0x272d33);
  const key = new DirectionalLight(0xfff3dc, 2.6); key.position.set(4, 7, 3);
  const grid = new GridHelper(40, 40, 0x515960, 0x354048);
  // The batches' meshes sit in template space: the view is framed by the columns' boxes.
  const bounds = new Mesh(new BoxGeometry(1, 1, 1));
  bounds.visible = false;
  const barMaterial = new LineBasicNodeMaterial({ color: 0xd0d6dc });
  let bar: LineSegments | null = null;
  scene.add(root, grid, bounds, new AmbientLight(0xe3edff, 1.3), key);
  const controls = createAssetPreviewControls(surface, camera, { uvw: () => null, edit() {} });
  const labels = createPreviewLabels(surface);
  const resources = ctx.host.resources(`family-stage:${ctx.guid}`);
  const batches = createFoliageBatches({
    gpuDriven: ctx.host.gpuDriven, resources, parent: root, source: "preview",
    quality: { cullScale: 1, verticalFov: camera.fov }, wind: environment.plants.wind, plants: environment.plants,
  });
  let ticket = 0, disposed = false, framed = "", settled = 0, waiting = true, step = 1;
  let owners: string[] = [], held: string[] = [];
  const release = ctx.host.preview(surface, (renderer, width, height) => {
    camera.aspect = width / height; camera.updateProjectionMatrix();
    environment.sync(1 / 60, camera);
    // The level's frame sets its own masks again when the preview closes.
    ctx.host.gpuDriven.setZoneMasks(null);
    ctx.host.gpuDriven.cull(scene, camera);
    renderer.render(scene, camera);
    labels.place(camera, width, height);
    settled = waiting || ctx.host.cache.stats().pending > 0 ? 0 : settled + 1;
    // The first frames compile the batches' programs; a culled frame's counts arrive with the next.
    if (settled >= 3) ctx.container.dataset.previewReady = "1";
  });
  ctx.host.setCamera(camera);

  const drawBar = (x: number, height: number): void => {
    if (bar) { bar.removeFromParent(); bar.geometry.dispose(); }
    step = barStep(height);
    const points = [new Vector3(x, 0, 0), new Vector3(x, height, 0)];
    for (let at = 0; at <= height + 1e-6; at += step) points.push(new Vector3(x, at, 0), new Vector3(x + step * 0.25, at, 0));
    bar = new LineSegments(new BufferGeometry().setFromPoints(points), barMaterial);
    scene.add(bar);
  };

  return {
    async show(columns) {
      const current = ++ticket;
      waiting = true; settled = 0; ctx.container.dataset.previewReady = "0";
      const keys: string[] = [];
      const boxes = await Promise.all(columns.map(async (column) => {
        keys.push(resourceKey.model(column.draw.mesh));
        const model = await resources.model(column.draw.mesh).catch(() => null);
        const box = new Box3();
        if (model) box.setFromObject(model.scene);
        if (box.isEmpty()) box.set(new Vector3(-0.5, 0, -0.5), new Vector3(0.5, 1, 0.5));
        return { box };
      }));
      if (disposed || current !== ticket) { for (const name of keys) resources.release(name); return false; }
      for (const owner of owners) batches.remove(owner);
      for (const name of held) resources.release(name);
      held = keys;
      owners = [];
      const spacing = boxes.map(({ box }) => Math.max(box.max.x - box.min.x, box.max.z - box.min.z) * 0.8);
      const widths = columns.map((column, i) => (boxes[i]!.box.max.x - boxes[i]!.box.min.x) + ((column.patch ?? 1) - 1) * spacing[i]!);
      const gap = Math.max(0.1, Math.max(0, ...widths.map((width, i) => width / (columns[i]!.patch ?? 1))) * 0.2);
      const total = widths.reduce((sum, width) => sum + width, 0) + gap * Math.max(0, columns.length - 1);
      const height = Math.max(0.1, ...boxes.map(({ box }) => box.max.y));
      let at = -total / 2, depth = 0;
      labels.set(columns.map((column, i) => {
        const { box } = boxes[i]!, patch = column.patch ?? 1, centre = at + widths[i]! / 2;
        const matrices: number[] = [], seeds: number[] = [];
        for (let row = 0; row < patch; row += 1) for (let col = 0; col < patch; col += 1) {
          const x = centre - (box.min.x + box.max.x) / 2 + (col - (patch - 1) / 2) * spacing[i]!;
          matrices.push(...new Matrix4().makeTranslation(x, 0, -row * spacing[i]!).elements);
          seeds.push((column.seed + row * patch + col) >>> 0);
        }
        const owner = `column:${i}`;
        owners.push(owner);
        batches.set(column.draw, owner, matrices, seeds);
        depth = Math.max(depth, (patch - 1) * spacing[i]! + box.max.z - box.min.z);
        at += widths[i]! + gap;
        return { text: column.label, position: new Vector3(centre, 0, 0) };
      }));
      drawBar(-total / 2 - gap, height);
      bounds.scale.set(total + gap * 2, height, depth);
      bounds.position.set(-gap / 2, height / 2, -depth / 2);
      await batches.ready();
      if (disposed || current !== ticket) return false;
      const layout = JSON.stringify([columns.map((column) => [column.label, column.patch ?? 1])]);
      if (framed !== layout) { controls.frame(bounds, true); framed = layout; }
      waiting = false;
      return true;
    },
    focus: () => controls.frame(bounds, true),
    get scale() { return step; },
    dispose() {
      disposed = true; ticket += 1;
      batches.dispose(); controls.dispose(); labels.dispose(); release();
      for (const name of held) resources.release(name);
      resources.releaseAll();
      bar?.geometry.dispose(); barMaterial.dispose(); grid.dispose(); bounds.geometry.dispose();
      scene.clear();
    },
  };
}
