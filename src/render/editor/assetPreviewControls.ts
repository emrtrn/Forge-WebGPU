// Pointer capture belongs to the preview surface: the level canvas keeps its
// listeners, but no preview event reaches them. UVW uses the existing gizmo
// rendering and drag maths, not TransformControls or another renderer.
import { Box3, PerspectiveCamera, Raycaster, Spherical, Vector2, Vector3, type Object3D, type WebGPURenderer } from "three/webgpu";
import type { Vec3 } from "../../core/index.ts";
import { axisToIndex, planeAxisNormal, type GizmoHandle } from "../../engine/gizmo/axes.ts";
import { axisParameter, axisMovePosition, planeMovePosition, rayPlane, rotateAbout, rotateDragDegrees, scaleDragScale, type Ray } from "../../engine/gizmo/transformDrag.ts";
import { DEFAULT_SNAP } from "../../engine/gizmo/snap.ts";
import { eulerDegreesToQuaternion, quaternionToEulerDegrees } from "../../engine/math/euler.ts";
import type { UvwSettings } from "../resources/modelSetup.ts";
import { createViewportGizmo } from "./gizmo.ts";

export function createAssetPreviewControls(surface: HTMLElement, camera: PerspectiveCamera, options: {
  uvw(): UvwSettings | null;
  edit(uvw: UvwSettings, phase: "input" | "commit"): void;
}) {
  const target = new Vector3(), raycaster = new Raycaster(), gizmo = createViewportGizmo();
  const snap = { ...DEFAULT_SNAP, moveEnabled: false, rotateEnabled: false, scaleEnabled: false };
  let tool: "select" | "move" | "rotate" | "scale" = "select";
  let drag: { id: number; button: number; x: number; y: number; lastX: number; lastY: number; handle: GizmoHandle | null; uvw: UvwSettings | null; ray: Ray; latest: UvwSettings | null } | null = null;
  const ray = (x: number, y: number): Ray => {
    const rect = surface.getBoundingClientRect();
    raycaster.setFromCamera(new Vector2((x - rect.left) / rect.width * 2 - 1, -(y - rect.top) / rect.height * 2 + 1), camera);
    return { origin: raycaster.ray.origin.toArray() as Vec3, direction: raycaster.ray.direction.toArray() as Vec3 };
  };
  const swallow = (event: Event) => { event.preventDefault(); event.stopImmediatePropagation(); };
  const down = (event: PointerEvent) => {
    swallow(event);
    const current = ray(event.clientX, event.clientY);
    const handle = event.button === 0 ? gizmo.pick(raycaster) : null;
    drag = { id: event.pointerId, button: event.button, x: event.clientX, y: event.clientY, lastX: event.clientX, lastY: event.clientY, handle, uvw: options.uvw(), ray: current, latest: null };
    surface.setPointerCapture(event.pointerId);
  };
  const move = (event: PointerEvent) => {
    swallow(event);
    if (!drag || drag.id !== event.pointerId) return;
    const dx = event.clientX - drag.lastX, dy = event.clientY - drag.lastY;
    drag.lastX = event.clientX; drag.lastY = event.clientY;
    if (drag.handle && drag.uvw) {
      const original = drag.uvw, handle = drag.handle;
      const next = { ...original };
      const index = axisToIndex(handle.axis);
      const axis: Vec3 = index === 0 ? [1, 0, 0] : index === 1 ? [0, 1, 0] : [0, 0, 1];
      if (handle.tool === "move") {
        const currentRay = ray(event.clientX, event.clientY);
        if (["x", "y", "z"].includes(handle.axis)) {
          const first = axisParameter(drag.ray, original.position, axis), now = axisParameter(currentRay, original.position, axis);
          if (first !== null && now !== null) next.position = axisMovePosition(original.position, axis, now - first, snap, index);
        } else {
          const normal = ["xy", "xz", "yz"].includes(handle.axis) ? planeAxisNormal(handle.axis as "xy" | "xz" | "yz") : camera.getWorldDirection(new Vector3()).toArray() as Vec3;
          const first = rayPlane(drag.ray, original.position, normal), now = rayPlane(currentRay, original.position, normal);
          if (first && now) next.position = planeMovePosition(original.position, now.map((n, i) => n - first[i]!) as Vec3, snap, [0, 1, 2], null);
        }
      } else if (handle.tool === "rotate") next.rotation = quaternionToEulerDegrees(rotateAbout(eulerDegreesToQuaternion(original.rotation), axis, rotateDragDegrees(event.clientX - drag.x, snap)));
      else next.scale = scaleDragScale(handle.axis, original.scale, event.clientX - drag.x, event.clientY - drag.y, snap);
      drag.latest = next;
      options.edit(next, "input");
    } else if (drag.button === 1 || event.shiftKey) {
      const distance = camera.position.distanceTo(target) * 0.0025;
      const right = new Vector3().setFromMatrixColumn(camera.matrix, 0).multiplyScalar(-dx * distance);
      const up = new Vector3().setFromMatrixColumn(camera.matrix, 1).multiplyScalar(dy * distance);
      camera.position.add(right).add(up); target.add(right).add(up);
    } else {
      const spherical = new Spherical().setFromVector3(camera.position.clone().sub(target));
      spherical.theta -= dx * 0.006; spherical.phi = Math.min(Math.PI - 0.02, Math.max(0.02, spherical.phi - dy * 0.006));
      camera.position.copy(target).add(new Vector3().setFromSpherical(spherical));
    }
    camera.lookAt(target);
  };
  const up = (event: PointerEvent) => {
    swallow(event);
    if (drag?.latest) options.edit(drag.latest, event.type === "pointercancel" ? "input" : "commit");
    if (event.type === "pointercancel" && drag?.uvw && drag.handle) options.edit(drag.uvw, "commit");
    drag = null;
    if (surface.hasPointerCapture(event.pointerId)) surface.releasePointerCapture(event.pointerId);
  };
  const wheel = (event: WheelEvent) => {
    swallow(event);
    const offset = camera.position.clone().sub(target).multiplyScalar(Math.exp(Math.min(1, Math.max(-1, event.deltaY * 0.001))));
    if (offset.length() > 0.001 && offset.length() < 1e6) camera.position.copy(target).add(offset);
  };
  surface.addEventListener("pointerdown", down, true); surface.addEventListener("pointermove", move, true);
  surface.addEventListener("pointerup", up, true); surface.addEventListener("pointercancel", up, true);
  surface.addEventListener("wheel", wheel, { capture: true, passive: false }); surface.addEventListener("contextmenu", swallow, true);
  return {
    frame(subject: Object3D) {
      subject.updateMatrixWorld(true);
      const box = new Box3().setFromObject(subject);
      if (box.isEmpty()) box.setFromCenterAndSize(new Vector3(), new Vector3(2, 2, 2));
      box.getCenter(target);
      const radius = Math.max(box.getSize(new Vector3()).length() / 2, 0.1);
      const distance = radius / Math.sin(camera.fov * Math.PI / 360) * 1.1;
      camera.position.copy(target).addScaledVector(new Vector3(1, 0.75, 1).normalize(), distance);
      camera.near = distance / 1000; camera.far = distance * 100;
      camera.lookAt(target); camera.updateProjectionMatrix();
    },
    setTool(next: typeof tool) { tool = next; },
    draw(renderer: WebGPURenderer, width: number, height: number) {
      const uvw = options.uvw();
      gizmo.update(tool !== "select" && uvw && uvw.mapType !== "none" ? { tool, origin: [...uvw.position], rotation: [0, 0, 0, 1], active: drag?.handle ?? null, hovered: null } : null, camera, height);
      surface.dataset.assetGizmo = JSON.stringify(gizmo.handlePoints(camera));
      const clear = renderer.autoClear;
      renderer.autoClear = false;
      try { gizmo.render(renderer, camera, new Vector2(width, height), null!); }
      finally { renderer.autoClear = clear; }
    },
    dispose() {
      surface.removeEventListener("pointerdown", down, true); surface.removeEventListener("pointermove", move, true);
      surface.removeEventListener("pointerup", up, true); surface.removeEventListener("pointercancel", up, true);
      surface.removeEventListener("wheel", wheel, true); surface.removeEventListener("contextmenu", swallow, true);
      gizmo.dispose();
    },
  };
}
