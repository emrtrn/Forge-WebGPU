import { Vector3, type PerspectiveCamera } from "three/webgpu";
import type { Vec3 } from "../../core/index.ts";
import { ndcToScreen } from "../../engine/ui/uiWorldWidget.ts";

export function widgetProjection(camera: PerspectiveCamera, surface: HTMLElement) {
  const point = new Vector3();
  return (position: Readonly<Vec3>) => {
    point.fromArray(position).applyMatrix4(camera.matrixWorldInverse);
    const depth = -point.z;
    if (depth < camera.near || depth > camera.far) return null;
    const distance = point.length();
    point.applyMatrix4(camera.projectionMatrix);
    if (Math.abs(point.x) > 1 || Math.abs(point.y) > 1) return null;
    const { x, y } = ndcToScreen(point.x, point.y, point.z, surface.clientWidth, surface.clientHeight);
    return { x, y, distance };
  };
}
