// The editor's viewport (plan phase 4 step 3; architecture §4.7, §4.9): the
// render host the editor's world draws with, the editor camera (Forge's
// controls and presets, editorCamera.ts), the drawing layer (overlay.ts) and
// its grid. It takes the phase 3 level viewer's place in the editor: the same
// lens, default framing and ready signal (`data-forge-ready`, render smoke),
// with the editor's camera instead of the game's fly camera.
//
// - The last perspective pose is restored per level (cameraPoseStore.ts);
//   without one the level is framed once its resources are in (the viewer's
//   framing), unless the user moved first.
// - Input on the canvas: a plain left press on a gizmo handle is the editor's
//   (`onPointerDown`, the transform tools: the pointer is captured and its
//   moves and release go there too); otherwise the camera takes what is its
//   (editorCamera.ts) and a plain left press goes to `onClick`, which picks
//   (picker.ts) for the editor's selection.
// - The gizmo (step 4, gizmo.ts) is the drawing layer's last pass, drawn as
//   the editor's `gizmo()` says each frame. Its handles' screen points are on
//   the canvas as `data-forge-gizmo` (client pixels, `tool:axis` and
//   `origin`) for the browser checks.
// - The selection (the editor's, read each frame) is outlined in the drawing
//   layer (selectionOutline.ts); its bounds are the orbit target and what
//   focus frames.
// - The view (Perspective / Top / Left / Front) is the camera's; listeners
//   hear every change, so the editor's menu label follows the shortcuts.
// - View mode (INV-A09, Forge's Lit / Wireframe): wireframe sets
//   `material.wireframe` on what the world's root draws (new objects as they
//   come) and gives every material its own value back on Lit. As in Forge, a
//   technical view (Top / Left / Front) switches to Wireframe and Perspective
//   back to Lit; the menu still picks either afterwards.

import { Box3, Group, Matrix4, Raycaster, Vector2, Vector3, type Material, type Mesh } from "three/webgpu";
import type { ActorId, FeatureDef, Vec3, WorldActor } from "../../core/index.ts";
import type { GizmoHandle } from "../../engine/gizmo/axes.ts";
import type { Box } from "../../engine/gizmo/surfaceSnap.ts";
import type { Ray } from "../../engine/gizmo/transformDrag.ts";
import { actorWorldMatrix } from "../sync/transforms.ts";
import { createRenderHost, type RenderHost, type RenderHostOptions, type RenderQuality } from "../host/renderHost.ts";
import { CAMERA_FAR, CAMERA_FOV, CAMERA_NEAR, frameBounds, READY_FRAMES, sceneRoomBounds } from "../viewer/levelViewer.ts";
import { createEditorCameraPoseStore, type PoseStorage } from "./cameraPoseStore.ts";
import { createEditorCamera, type CameraView, type EditorCamera, type ViewportCamera } from "./editorCamera.ts";
import { createEditorGrid, type EditorGrid, type GridPlane } from "./grid.ts";
import { createActorIcons, type ActorIcons } from "./actorIcon.ts";
import { createEditorHelpersFeature, type EditorRenderBindingDef } from "./editorBinding.ts";
import { createViewportGizmo, type GizmoView, type ViewportGizmo } from "./gizmo.ts";
import { createEditorOverlay, type EditorOverlay } from "./overlay.ts";
import { createScenePicker, type ScenePicker } from "./picker.ts";
import { createSelectionOutline, type SelectionOutline } from "./selectionOutline.ts";

export interface EditorViewportOptions extends RenderHostOptions {
  /** Where the camera pose is remembered; null keeps nothing. */
  readonly storage: PoseStorage | null;
  /** The level the pose belongs to (project and level folder). */
  readonly levelKey: string;
  readonly onStatus?: (message: string) => void;
  /** The editor's selection, read every frame (outline, orbit target, focus). */
  readonly selected?: () => readonly ActorId[];
  /** The editor's world's actors (focus on an actor that draws nothing). */
  readonly actor?: (id: ActorId) => WorldActor | undefined;
  /** A plain left press in the viewport, in client pixels; `additive` with Ctrl or Shift. */
  readonly onClick?: (clientX: number, clientY: number, additive: boolean) => void;
  /** The gizmo to draw this frame (read every frame); null for none. */
  readonly gizmo?: () => GizmoView | null;
  /** A plain left press, before the camera and `onClick`: true takes it (a gizmo drag; the pointer is captured). */
  readonly onPointerDown?: (event: PointerEvent) => boolean;
  /** Every move over the canvas the camera does not take; a "grab" answer shows the grab cursor. */
  readonly onPointerMove?: (event: PointerEvent) => "grab" | null;
  readonly onPointerUp?: (event: PointerEvent) => void;
  readonly onPointerCancel?: (event: PointerEvent) => void;
}

/** Forge's viewport shading modes. */
export type ViewMode = "lit" | "wireframe";
export const VIEW_MODES: readonly ViewMode[] = ["lit", "wireframe"];

export interface EditorViewport {
  init(): Promise<void>;
  /** The `forge.render` feature for the editor's world. */
  feature(features: readonly FeatureDef[]): FeatureDef;
  /** The `forge.editorHelpers` feature: runs the features' editor bindings (`editorRender.ts`) in the drawing layer. */
  helperFeature(features: readonly FeatureDef[], bindings: readonly EditorRenderBindingDef[]): FeatureDef;
  frame(now: number): void;
  readonly host: RenderHost | null;
  readonly camera: EditorCamera;
  readonly overlay: EditorOverlay | null;
  readonly view: CameraView;
  setView(view: CameraView): void;
  onViewChange(listener: (view: CameraView) => void): void;
  readonly viewMode: ViewMode;
  setViewMode(mode: ViewMode): void;
  onViewModeChange(listener: (mode: ViewMode) => void): void;
  /** The actor drawn under a point of the page (client pixels); null for none. */
  pick(clientX: number, clientY: number): ActorId | null;
  /** The gizmo handle under a point of the page; null for none (or no gizmo). */
  pickHandle(clientX: number, clientY: number): GizmoHandle | null;
  /** The camera's ray through a point of the page. */
  pointerRay(clientX: number, clientY: number): Ray | null;
  /** The camera's forward direction. */
  viewDirection(): Vec3;
  /** The first thing a world ray hits among what the level draws, `exclude`'s actors left out. */
  raycast(origin: Vec3, direction: Vec3, far: number, exclude: ReadonlySet<ActorId>): { readonly distance: number; readonly point: Vec3 } | null;
  /** World box of what these actors draw (three-free). */
  worldBox(actors: readonly ActorId[]): Box | null;
  /** The box of what an actor draws, in its own space (before its scale). */
  localBox(actor: ActorId): Box | null;
  /** World bounds of what these actors draw; null when they draw nothing. */
  bounds(actors: readonly ActorId[]): Box3 | null;
  /** Frames a box; a null or empty box looks at `fallback`. */
  focus(box: Box3 | null, fallback: Vector3): void;
  /**
   * Frames the selection (Forge's focusSelected, key F): what it draws, else
   * the primary actor's position; false when nothing is selected.
   */
  focusSelection(): boolean;
  readonly gridVisible: boolean;
  setGridVisible(visible: boolean): void;
  setQuality(quality: RenderQuality): void;
  onLost(listener: (message: string) => void): void;
  dispose(): void;
}

const gridPlaneOf = (view: CameraView): GridPlane => (view === "front" ? "front" : view === "left" ? "side" : "ground");

function editableTarget(target: EventTarget | null): boolean {
  const element = target as HTMLElement | null;
  if (!element || typeof element.tagName !== "string") return false;
  return element.tagName === "INPUT" || element.tagName === "TEXTAREA" || element.tagName === "SELECT" || element.isContentEditable === true;
}

export function createEditorViewport(options: EditorViewportOptions): EditorViewport {
  let host: RenderHost | null = null;
  // The editor helpers' layer group (icons, wires); picked before the scene.
  const helpers = new Group();
  helpers.name = "editor helpers";
  let icons: ActorIcons | null = null;
  const picker: ScenePicker = createScenePicker(() => host?.world?.root ?? null, () => helpers);
  const selected = options.selected ?? ((): readonly ActorId[] => []);
  const camera = createEditorCamera({
    fov: CAMERA_FOV,
    near: CAMERA_NEAR,
    far: CAMERA_FAR,
    selectionCentre: () => {
      const ids = selected();
      return ids.length === 0 ? null : (picker.bounds(new Set(ids))?.getCenter(new Vector3()) ?? null);
    },
    ...(options.onStatus ? { onStatus: options.onStatus } : {}),
  });
  const poses = createEditorCameraPoseStore(options.storage, options.levelKey);
  const viewListeners: ((view: CameraView) => void)[] = [];
  const modeListeners: ((mode: ViewMode) => void)[] = [];
  let viewMode: ViewMode = "lit";
  /** Materials made wireframe, with their own value. */
  const wireframed = new Map<Material & { wireframe?: boolean }, boolean>();
  const applyWireframe = (): void => {
    const root = host?.world?.root;
    if (!root) return;
    root.traverse((object) => {
      const material = (object as Mesh).material as (Material & { wireframe?: boolean }) | (Material & { wireframe?: boolean })[] | undefined;
      if (!material) return;
      for (const one of Array.isArray(material) ? material : [material]) {
        if (wireframed.has(one) || typeof one.wireframe !== "boolean") continue;
        wireframed.set(one, one.wireframe);
        one.wireframe = true;
        one.needsUpdate = true;
      }
    });
  };
  const restoreLit = (): void => {
    for (const [material, own] of wireframed) {
      material.wireframe = own;
      material.needsUpdate = true;
    }
    wireframed.clear();
  };
  const changeViewMode = (mode: ViewMode): void => {
    if (mode === viewMode) return;
    viewMode = mode;
    if (mode === "lit") restoreLit();
    for (const listener of modeListeners) listener(mode);
  };
  const pendingLost: ((message: string) => void)[] = [];
  const unbind: (() => void)[] = [];
  let overlay: EditorOverlay | null = null;
  let outline: SelectionOutline | null = null;
  let gizmo: ViewportGizmo | null = null;
  /** The last `data-forge-gizmo` written. */
  let gizmoPoints = "";
  const ndc = new Vector2();
  const handleRay = new Raycaster();
  /** Device coordinates of a point of the page into `ndc`; false when the canvas has no size. */
  const toNdc = (clientX: number, clientY: number): boolean => {
    if (!host) return false;
    const rect = host.canvas.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return false;
    ndc.set(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
    return true;
  };
  const plainBox = (box: Box3 | null): Box | null => (box === null || box.isEmpty() ? null : { min: box.min.toArray(), max: box.max.toArray() });
  const publishGizmo = (canvas: HTMLCanvasElement, active: ViewportCamera): void => {
    let text = "";
    if (gizmo?.visible) {
      const rect = canvas.getBoundingClientRect();
      const points: Record<string, [number, number]> = {};
      for (const [key, [x, y]] of Object.entries(gizmo.handlePoints(active))) {
        points[key] = [Math.round(rect.left + ((x + 1) / 2) * rect.width), Math.round(rect.top + ((1 - y) / 2) * rect.height)];
      }
      text = JSON.stringify(points);
    }
    if (text === gizmoPoints) return;
    gizmoPoints = text;
    if (text) canvas.dataset.forgeGizmo = text;
    else delete canvas.dataset.forgeGizmo;
  };
  let grid: EditorGrid | null = null;
  let gridVisible = true;
  let quality: RenderQuality | null = null;
  let framed = false;
  let settledFrames = 0;
  let ready = false;
  let lastFrame: number | null = null;
  let drawn: ViewportCamera | null = null;

  const listen = <T extends Event>(target: EventTarget, type: string, listener: (event: T) => void, opts?: AddEventListenerOptions): void => {
    target.addEventListener(type, listener as EventListener, opts);
    unbind.push(() => target.removeEventListener(type, listener as EventListener, opts));
  };

  const wireInput = (canvas: HTMLCanvasElement, window: Window): void => {
    listen<PointerEvent>(canvas, "pointerdown", (event) => {
      if (event.button === 0 && !event.altKey && options.onPointerDown?.(event)) {
        canvas.setPointerCapture(event.pointerId);
        return;
      }
      if (camera.pointerDown(event, canvas)) return;
      if (event.button === 0) options.onClick?.(event.clientX, event.clientY, event.ctrlKey || event.shiftKey);
    });
    listen<PointerEvent>(canvas, "pointermove", (event) => {
      if (camera.pointerMove(event) || camera.dragging || camera.navigating) return;
      const cursor = options.onPointerMove?.(event) ?? null;
      canvas.style.cursor = cursor === "grab" ? "pointer" : "";
    });
    const release = (event: PointerEvent, cancelled: boolean): void => {
      if (cancelled) options.onPointerCancel?.(event);
      else options.onPointerUp?.(event);
      if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
      camera.pointerUp(event, canvas);
    };
    listen<PointerEvent>(canvas, "pointerup", (event) => release(event, false));
    listen<PointerEvent>(canvas, "pointercancel", (event) => release(event, true));
    listen<MouseEvent>(canvas, "contextmenu", (event) => event.preventDefault());
    listen<WheelEvent>(
      canvas,
      "wheel",
      (event) => {
        event.preventDefault();
        camera.wheel(event.deltaY);
      },
      { passive: false },
    );
    listen<KeyboardEvent>(window, "keydown", (event) => {
      if (editableTarget(event.target)) return;
      if (camera.key(event.code, true)) event.preventDefault();
    });
    listen<KeyboardEvent>(window, "keyup", (event) => void camera.key(event.code, false));
    listen<Event>(window, "pagehide", () => {
      if (camera.view === "perspective") poses.save(camera.perspective);
    });
  };

  return {
    get host() {
      return host;
    },
    camera,
    get overlay() {
      return overlay;
    },
    get view() {
      return camera.view;
    },
    async init() {
      if (poses.restore(camera.perspective)) {
        framed = true;
        camera.markTouched();
        camera.syncAngles();
      }
      host = await createRenderHost(options);
      if (quality) host.setQuality(quality);
      host.setCamera(camera.active());
      drawn = camera.active();
      overlay = createEditorOverlay(host.renderer);
      grid = createEditorGrid(overlay.sceneVisibility);
      grid.mesh.visible = gridVisible;
      overlay.scene.add(grid.mesh, helpers);
      icons = createActorIcons(options.document);
      outline = createSelectionOutline(picker, selected);
      overlay.addPass(outline);
      gizmo = createViewportGizmo();
      overlay.addPass(gizmo);
      host.setOverlay(overlay);
      const window = options.document.defaultView;
      if (window) wireInput(host.canvas, window);
      for (const listener of pendingLost.splice(0)) host.onDeviceLost(listener);
    },
    feature(features) {
      if (!host) throw new Error("The editor viewport is not initialised.");
      return host.feature(features, "editor");
    },
    helperFeature(features, bindings) {
      if (!overlay || !icons) throw new Error("The editor viewport is not initialised.");
      return createEditorHelpersFeature({
        bindings,
        features,
        root: helpers,
        selected: () => new Set(selected()),
        sceneVisibility: overlay.sceneVisibility,
        icons,
        camera: () => camera.active(),
      });
    },
    frame(now) {
      if (!host || host.world === null) return;
      const dt = lastFrame === null ? 0 : Math.min(0.1, Math.max(0, (now - lastFrame) / 1000));
      lastFrame = now;
      camera.update(dt);
      const rect = options.container.getBoundingClientRect();
      camera.resize(Math.max(1, rect.width), Math.max(1, rect.height));
      const { pending, failed } = host.cache.stats();
      if (pending === 0 && !framed && !camera.touched) {
        frameBounds(camera.perspective, sceneRoomBounds(host.world.root));
        camera.syncAngles();
      }
      if (pending === 0 || camera.touched) framed = true;
      const active = camera.active();
      if (drawn !== active) {
        host.setCamera(active);
        drawn = active;
      }
      if (viewMode === "wireframe") applyWireframe();
      grid?.update(active, gridPlaneOf(camera.view));
      active.updateMatrixWorld();
      gizmo?.update(options.gizmo?.() ?? null, active, rect.height);
      publishGizmo(host.canvas, active);
      host.frame(now);
      if (camera.view === "perspective" && camera.touched) poses.maybeSave(camera.perspective, now);
      if (ready) return;
      settledFrames = pending === 0 ? settledFrames + 1 : 0;
      if (settledFrames >= READY_FRAMES && !host.lost) {
        ready = true;
        host.canvas.dataset.forgeResourceErrors = String(failed);
        host.canvas.dataset.forgeReady = "1";
      }
    },
    setView(view) {
      camera.setView(view);
      for (const listener of viewListeners) listener(view);
      changeViewMode(view === "perspective" ? "lit" : "wireframe");
    },
    onViewChange(listener) {
      viewListeners.push(listener);
    },
    get viewMode() {
      return viewMode;
    },
    setViewMode(mode) {
      changeViewMode(mode);
      options.onStatus?.(`${mode === "lit" ? "Lit" : "Wireframe"} view mode`);
    },
    onViewModeChange(listener) {
      modeListeners.push(listener);
    },
    pick(clientX, clientY) {
      if (!toNdc(clientX, clientY)) return null;
      return picker.pick(ndc, camera.active())?.actor ?? null;
    },
    pickHandle(clientX, clientY) {
      if (!gizmo?.visible || !toNdc(clientX, clientY)) return null;
      handleRay.setFromCamera(ndc, camera.active());
      return gizmo.pick(handleRay);
    },
    pointerRay(clientX, clientY) {
      if (!toNdc(clientX, clientY)) return null;
      handleRay.setFromCamera(ndc, camera.active());
      return { origin: handleRay.ray.origin.toArray(), direction: handleRay.ray.direction.toArray() };
    },
    viewDirection() {
      return camera.active().getWorldDirection(new Vector3()).toArray();
    },
    raycast(origin, direction, far, exclude) {
      const hit = picker.raycast(new Vector3().fromArray(origin), new Vector3().fromArray(direction).normalize(), far, exclude);
      return hit ? { distance: hit.distance, point: hit.point.toArray() } : null;
    },
    worldBox(actors) {
      return plainBox(picker.bounds(new Set(actors)));
    },
    localBox(id) {
      const actor = options.actor?.(id);
      if (!actor) return null;
      const inverse = actorWorldMatrix({ actor: (one: ActorId) => options.actor?.(one) }, actor).invert();
      const box = new Box3();
      const part = new Box3();
      const matrix = new Matrix4();
      picker.parts(new Set([id]), ({ geometry, matrix: world }) => {
        if (!geometry.boundingBox) geometry.computeBoundingBox();
        box.union(part.copy(geometry.boundingBox!).applyMatrix4(matrix.multiplyMatrices(inverse, world)));
      });
      return plainBox(box);
    },
    bounds(actors) {
      return picker.bounds(new Set(actors));
    },
    focus(box, fallback) {
      camera.focus(box, fallback);
    },
    focusSelection() {
      const ids = selected();
      const primary = ids[0] === undefined ? undefined : options.actor?.(ids[0]);
      if (!primary) return false;
      const lookup = { actor: (id: ActorId) => options.actor?.(id) };
      // Forge: an actor without bounds is looked at 0.65 m above its origin.
      const fallback = new Vector3().setFromMatrixPosition(actorWorldMatrix(lookup, primary)).add(new Vector3(0, 0.65, 0));
      camera.focus(picker.bounds(new Set(ids)), fallback);
      return true;
    },
    get gridVisible() {
      return gridVisible;
    },
    setGridVisible(visible) {
      gridVisible = visible;
      if (grid) grid.mesh.visible = visible;
    },
    setQuality(next) {
      quality = next;
      host?.setQuality(next);
    },
    onLost(listener) {
      if (host) host.onDeviceLost(listener);
      else pendingLost.push(listener);
    },
    dispose() {
      if (camera.view === "perspective") poses.save(camera.perspective);
      for (const off of unbind.splice(0).reverse()) off();
      host?.setOverlay(null);
      outline?.dispose();
      gizmo?.dispose();
      icons?.dispose();
      helpers.clear();
      grid?.dispose();
      overlay?.dispose();
      host?.dispose();
      host = null;
      overlay = null;
      grid = null;
    },
  };
}
