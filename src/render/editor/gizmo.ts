// The transform gizmo's drawing and handle picking (plan phase 4 step 4,
// decision 2; Forge WebGL editor/gizmos/{builder,handles,interaction}.ts
// @ forge-webgl-final, INV-A05). The drag math is three-free
// (src/engine/gizmo); this draws what the editor asks for, in the drawing
// layer, as its last pass: over the frame and over the other overlay
// drawings, never hidden by the scene (Forge: depth test off, render order
// 1000).
//
// Forge's look, as it was: arrows (move), rings (rotate), cube-tipped shafts
// (scale), the plane squares coloured by the axis they leave out, the yellow
// centre box; 42% opaque, the dragged handle orange, the hovered one light
// orange; 118 px on screen, between 0.35 and 4 m. The thin shafts and rings
// get invisible, thicker pick shapes so a handle is easy to grab; the drawn
// shapes stay Forge's.

import {
  BoxGeometry,
  ConeGeometry,
  CylinderGeometry,
  DoubleSide,
  Group,
  Mesh,
  MeshBasicNodeMaterial,
  PlaneGeometry,
  Raycaster,
  Scene,
  TorusGeometry,
  Vector2,
  Vector3,
  type BufferGeometry,
  type Camera,
  type Intersection,
  type Object3D,
  type OrthographicCamera,
  type PerspectiveCamera,
  type RenderTarget,
  type WebGPURenderer,
} from "three/webgpu";
import type { Vec3 } from "../../core/index.ts";
import { gizmoHandlesEqual, type GizmoAxis, type GizmoHandle, type GizmoPlaneAxis, type GizmoTool, type GizmoVectorAxis } from "../../engine/gizmo/axes.ts";
import type { Quat } from "../../engine/math/affine.ts";
import type { OverlayPass } from "./overlay.ts";

/** What the editor shows this frame. */
export interface GizmoView {
  readonly tool: GizmoTool;
  readonly origin: Vec3;
  readonly rotation: Quat;
  /** The handle being dragged. */
  readonly active: GizmoHandle | null;
  readonly hovered: GizmoHandle | null;
}

export interface ViewportGizmo extends OverlayPass {
  /** Places (or hides, with null) the gizmo for this frame; `heightPx` is the viewport's CSS height. */
  update(view: GizmoView | null, camera: Camera, heightPx: number): void;
  /** The handle the ray hits first; null when hidden or missed. */
  pick(raycaster: Raycaster): GizmoHandle | null;
  /**
   * Where each handle's grab point is, in normalised device coordinates
   * (`tool:axis` -> [x, y]), with the gizmo's origin as `origin`; empty when
   * hidden. The viewport publishes it for the browser checks.
   */
  handlePoints(camera: Camera): Record<string, [number, number]>;
  readonly visible: boolean;
  dispose(): void;
}

// Forge's colours and sizes (editor/gizmos/builder.ts, handles.ts, interaction.ts).
export const GIZMO_COLORS = { x: 0xe15b5b, y: 0x69d282, z: 0x5b8fe1, centre: 0xf3cc5c } as const;
export const GIZMO_OPACITY = 0.42;
export const GIZMO_ACTIVE_COLOR = 0xff9f1a;
export const GIZMO_ACTIVE_OPACITY = 0.62;
export const GIZMO_HOVER_COLOR = 0xffc24d;
export const GIZMO_HOVER_OPACITY = 0.9;
export const GIZMO_SCREEN_SIZE_PX = 118;
export const GIZMO_MIN_SCALE = 0.35;
export const GIZMO_MAX_SCALE = 4;
const RENDER_ORDER = 1000;
/** Pick shapes' radius (gizmo units) around the thin shafts and rings. */
const PICK_RADIUS = 0.06;

const HANDLE_KEY = "forgeGizmoHandle";
const keyOf = (handle: GizmoHandle): string => `${handle.tool}:${handle.axis}`;

/** The world size of the gizmo's unit: 118 px on screen, clamped (Forge's calculateGizmoScreenScale; orthographic by its view height). */
export function gizmoScreenScale(camera: Camera, origin: Vector3, heightPx: number): number {
  const height = Math.max(1, heightPx);
  let worldPerPixel: number;
  if ((camera as OrthographicCamera).isOrthographicCamera === true) {
    const ortho = camera as OrthographicCamera;
    worldPerPixel = (ortho.top - ortho.bottom) / Math.max(ortho.zoom, 0.01) / height;
  } else {
    const perspective = camera as PerspectiveCamera;
    const distance = Math.max(0.01, perspective.getWorldPosition(new Vector3()).distanceTo(origin));
    worldPerPixel = (2 * Math.tan(((perspective.fov ?? 50) * Math.PI) / 360) * distance) / height;
  }
  return Math.min(GIZMO_MAX_SCALE, Math.max(GIZMO_MIN_SCALE, worldPerPixel * GIZMO_SCREEN_SIZE_PX));
}

interface Handle {
  readonly handle: GizmoHandle;
  readonly base: number;
  readonly materials: MeshBasicNodeMaterial[];
  /** The grab point in gizmo units: on its shaft, on its ring, its square or its box. */
  readonly grab: Vector3;
}

function material(color: number): MeshBasicNodeMaterial {
  const made = new MeshBasicNodeMaterial({ color, transparent: true, opacity: GIZMO_OPACITY, depthTest: false, depthWrite: false, side: DoubleSide });
  made.name = "editor gizmo";
  return made;
}

function pickMaterial(): MeshBasicNodeMaterial {
  const made = new MeshBasicNodeMaterial({ visible: false });
  made.name = "editor gizmo pick";
  return made;
}

export function createViewportGizmo(): ViewportGizmo {
  const scene = new Scene();
  scene.name = "editor gizmo";
  const group = new Group();
  group.name = "gizmo";
  group.visible = false;
  scene.add(group);
  const pickMat = pickMaterial();
  let tool: GizmoTool | null = null;
  let handles: Handle[] = [];
  const hits: Intersection[] = [];
  const point = new Vector3();
  const centre = new Vector3();

  const tag = (object: Object3D, handle: GizmoHandle): void => {
    object.traverse((child) => {
      child.userData[HANDLE_KEY] = handle;
      child.renderOrder = RENDER_ORDER;
    });
  };

  const add = (handle: GizmoHandle, color: number, grab: Vector3, build: (made: MeshBasicNodeMaterial) => Object3D, pick?: BufferGeometry, pickPlace?: (mesh: Mesh) => void): void => {
    const own = material(color);
    const object = build(own);
    const materials: MeshBasicNodeMaterial[] = [];
    object.traverse((child) => {
      const mesh = child as Mesh;
      if (mesh.isMesh) materials.push(mesh.material as MeshBasicNodeMaterial);
    });
    if (pick) {
      const proxy = new Mesh(pick, pickMat);
      proxy.name = `${keyOf(handle)} pick`;
      pickPlace?.(proxy);
      object.add(proxy);
    }
    tag(object, handle);
    group.add(object);
    handles.push({ handle, base: color, materials, grab });
  };

  const turnToAxis = (object: Object3D, axis: GizmoVectorAxis): void => {
    // Built along +Y (Forge): X turns -90° about Z, Z +90° about X.
    if (axis === "x") object.rotation.z = -Math.PI / 2;
    if (axis === "z") object.rotation.x = Math.PI / 2;
  };
  const along = (axis: GizmoVectorAxis, distance: number): Vector3 => new Vector3(axis === "x" ? distance : 0, axis === "y" ? distance : 0, axis === "z" ? distance : 0);

  const arrow = (axis: GizmoVectorAxis): void =>
    add(
      { tool: "move", axis },
      GIZMO_COLORS[axis],
      along(axis, 0.45),
      (own) => {
        const handle = new Group();
        handle.name = `move-${axis}-axis`;
        const shaft = new Mesh(new CylinderGeometry(0.012, 0.012, 0.62, 8), own);
        const head = new Mesh(new ConeGeometry(0.055, 0.14, 14), own.clone());
        shaft.position.y = 0.31;
        head.position.y = 0.69;
        handle.add(shaft, head);
        turnToAxis(handle, axis);
        return handle;
      },
      new CylinderGeometry(PICK_RADIUS, PICK_RADIUS, 0.62, 8),
      (proxy) => (proxy.position.y = 0.31),
    );

  const scaleHandle = (axis: GizmoVectorAxis): void =>
    add(
      { tool: "scale", axis },
      GIZMO_COLORS[axis],
      along(axis, 0.4),
      (own) => {
        const handle = new Group();
        handle.name = `scale-${axis}-axis`;
        const shaft = new Mesh(new CylinderGeometry(0.01, 0.01, 0.52, 8), own);
        const tip = new Mesh(new BoxGeometry(0.11, 0.11, 0.11), own.clone());
        shaft.position.y = 0.26;
        tip.position.y = 0.58;
        handle.add(shaft, tip);
        turnToAxis(handle, axis);
        return handle;
      },
      new CylinderGeometry(PICK_RADIUS, PICK_RADIUS, 0.52, 8),
      (proxy) => (proxy.position.y = 0.26),
    );

  const plane = (handleTool: "move" | "scale", axis: GizmoPlaneAxis, color: number): void => {
    const reach = 0.34;
    const position = axis === "xy" ? new Vector3(reach, reach, 0) : axis === "xz" ? new Vector3(reach, 0, reach) : new Vector3(0, reach, reach);
    add({ tool: handleTool, axis }, color, position, (own) => {
      const quad = new Mesh(new PlaneGeometry(0.2, 0.2), own);
      quad.name = `${handleTool}-${axis}-plane`;
      quad.position.copy(position);
      if (axis === "xz") quad.rotation.x = -Math.PI / 2;
      else if (axis === "yz") quad.rotation.y = Math.PI / 2;
      return quad;
    });
  };

  const centreBox = (handleTool: "move" | "scale", axis: GizmoAxis, size: number): void =>
    add({ tool: handleTool, axis }, GIZMO_COLORS.centre, new Vector3(), (own) => {
      const box = new Mesh(new BoxGeometry(size, size, size), own);
      box.name = handleTool === "move" ? "move-xyz-free" : "scale-uniform";
      return box;
    });

  const ring = (axis: GizmoVectorAxis): void => {
    // Grab point: on the ring, where it crosses the next axis.
    const grab = axis === "x" ? new Vector3(0, 0.72, 0) : axis === "y" ? new Vector3(0, 0, 0.72) : new Vector3(0.72, 0, 0);
    const orient = (object: Object3D): void => {
      // A torus lies in its XY plane (normal +Z): turn its normal down the axis it rotates about.
      if (axis === "x") object.rotation.y = Math.PI / 2;
      else if (axis === "y") object.rotation.x = Math.PI / 2;
    };
    add(
      { tool: "rotate", axis },
      GIZMO_COLORS[axis],
      grab,
      (own) => {
        const torus = new Mesh(new TorusGeometry(0.72, 0.01, 10, 96), own);
        torus.name = `rotate-${axis}-ring`;
        orient(torus);
        return torus;
      },
      new TorusGeometry(0.72, PICK_RADIUS, 8, 64),
    );
  };

  const clear = (): void => {
    for (const child of [...group.children]) {
      child.traverse((object) => {
        const mesh = object as Mesh;
        if (!mesh.isMesh) return;
        mesh.geometry.dispose();
        if (mesh.material !== pickMat) (mesh.material as MeshBasicNodeMaterial).dispose();
      });
      child.removeFromParent();
    }
    handles = [];
  };

  const build = (next: GizmoTool): void => {
    clear();
    tool = next;
    if (next === "move") {
      arrow("x");
      arrow("y");
      arrow("z");
      plane("move", "xy", GIZMO_COLORS.z);
      plane("move", "xz", GIZMO_COLORS.y);
      plane("move", "yz", GIZMO_COLORS.x);
      centreBox("move", "xyz", 0.18);
    } else if (next === "rotate") {
      ring("x");
      ring("y");
      ring("z");
    } else {
      centreBox("scale", "uniform", 0.16);
      scaleHandle("x");
      scaleHandle("y");
      scaleHandle("z");
      plane("scale", "xy", GIZMO_COLORS.z);
      plane("scale", "xz", GIZMO_COLORS.y);
      plane("scale", "yz", GIZMO_COLORS.x);
    }
  };

  const highlight = (view: GizmoView): void => {
    for (const entry of handles) {
      const active = gizmoHandlesEqual(view.active, entry.handle);
      const hovered = !active && gizmoHandlesEqual(view.hovered, entry.handle);
      const color = active ? GIZMO_ACTIVE_COLOR : hovered ? GIZMO_HOVER_COLOR : entry.base;
      const opacity = active ? GIZMO_ACTIVE_OPACITY : hovered ? GIZMO_HOVER_OPACITY : GIZMO_OPACITY;
      for (const made of entry.materials) {
        made.color.setHex(color);
        made.opacity = opacity;
      }
    }
  };

  return {
    get visible() {
      return group.visible;
    },
    update(view, camera, heightPx) {
      if (view === null) {
        group.visible = false;
        return;
      }
      if (tool !== view.tool) build(view.tool);
      group.visible = true;
      group.position.fromArray(view.origin);
      group.quaternion.fromArray(view.rotation);
      group.scale.setScalar(gizmoScreenScale(camera, group.position, heightPx));
      group.updateMatrixWorld(true);
      highlight(view);
    },
    pick(raycaster) {
      if (!group.visible) return null;
      group.updateMatrixWorld(true);
      hits.length = 0;
      raycaster.intersectObject(group, true, hits);
      const handle = hits[0]?.object.userData[HANDLE_KEY] as GizmoHandle | undefined;
      return handle ?? null;
    },
    handlePoints(camera) {
      const points: Record<string, [number, number]> = {};
      if (!group.visible) return points;
      group.updateMatrixWorld(true);
      centre.setFromMatrixPosition(group.matrixWorld).project(camera);
      points.origin = [centre.x, centre.y];
      for (const entry of handles) {
        point.copy(entry.grab).applyMatrix4(group.matrixWorld).project(camera);
        points[keyOf(entry.handle)] = [point.x, point.y];
      }
      return points;
    },
    render(renderer: WebGPURenderer, camera: Camera, _size: Vector2, _target: RenderTarget) {
      if (!group.visible) return;
      renderer.render(scene, camera);
    },
    dispose() {
      clear();
      pickMat.dispose();
      scene.clear();
    },
  };
}
