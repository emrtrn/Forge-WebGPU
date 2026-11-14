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
// - Input on the canvas: the camera takes what is its (editorCamera.ts); a
//   plain left press goes to `onClick`, which picks (picker.ts) for the
//   editor's selection.
// - The selection (the editor's, read each frame) is outlined in the drawing
//   layer (selectionOutline.ts); its bounds are the orbit target and what
//   focus frames.
// - The view (Perspective / Top / Left / Front) is the camera's; listeners
//   hear every change, so the editor's menu label follows the shortcuts.

import { Vector2, Vector3, type Box3 } from "three/webgpu";
import type { ActorId, FeatureDef, WorldActor } from "../../core/index.ts";
import { actorWorldMatrix } from "../sync/transforms.ts";
import { createRenderHost, type RenderHost, type RenderHostOptions, type RenderQuality } from "../host/renderHost.ts";
import { CAMERA_FAR, CAMERA_FOV, CAMERA_NEAR, frameBounds, READY_FRAMES, sceneRoomBounds } from "../viewer/levelViewer.ts";
import { createEditorCameraPoseStore, type PoseStorage } from "./cameraPoseStore.ts";
import { createEditorCamera, type CameraView, type EditorCamera, type ViewportCamera } from "./editorCamera.ts";
import { createEditorGrid, type EditorGrid, type GridPlane } from "./grid.ts";
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
}

export interface EditorViewport {
  init(): Promise<void>;
  /** The `forge.render` feature for the editor's world. */
  feature(features: readonly FeatureDef[]): FeatureDef;
  frame(now: number): void;
  readonly host: RenderHost | null;
  readonly camera: EditorCamera;
  readonly overlay: EditorOverlay | null;
  readonly view: CameraView;
  setView(view: CameraView): void;
  onViewChange(listener: (view: CameraView) => void): void;
  /** The actor drawn under a point of the page (client pixels); null for none. */
  pick(clientX: number, clientY: number): ActorId | null;
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
  const picker: ScenePicker = createScenePicker(() => host?.world?.root ?? null);
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
  const pendingLost: ((message: string) => void)[] = [];
  const unbind: (() => void)[] = [];
  let overlay: EditorOverlay | null = null;
  let outline: SelectionOutline | null = null;
  const ndc = new Vector2();
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
      if (camera.pointerDown(event, canvas)) return;
      if (event.button === 0) options.onClick?.(event.clientX, event.clientY, event.ctrlKey || event.shiftKey);
    });
    listen<PointerEvent>(canvas, "pointermove", (event) => void camera.pointerMove(event));
    listen<PointerEvent>(canvas, "pointerup", (event) => camera.pointerUp(event, canvas));
    listen<PointerEvent>(canvas, "pointercancel", (event) => camera.pointerUp(event, canvas));
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
      overlay.scene.add(grid.mesh);
      outline = createSelectionOutline(picker, selected);
      overlay.addPass(outline);
      host.setOverlay(overlay);
      const window = options.document.defaultView;
      if (window) wireInput(host.canvas, window);
      for (const listener of pendingLost.splice(0)) host.onDeviceLost(listener);
    },
    feature(features) {
      if (!host) throw new Error("The editor viewport is not initialised.");
      return host.feature(features, "editor");
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
      grid?.update(active, gridPlaneOf(camera.view));
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
    },
    onViewChange(listener) {
      viewListeners.push(listener);
    },
    pick(clientX, clientY) {
      if (!host) return null;
      const rect = host.canvas.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return null;
      ndc.set(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
      return picker.pick(ndc, camera.active())?.actor ?? null;
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
      grid?.dispose();
      overlay?.dispose();
      host?.dispose();
      host = null;
      overlay = null;
      grid = null;
    },
  };
}
