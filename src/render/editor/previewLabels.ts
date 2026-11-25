// The names under a preview's columns: DOM text at projected ground points.

import { Vector3, type Camera } from "three/webgpu";

export interface PreviewLabels {
  set(labels: readonly { readonly text: string; readonly position: Vector3 }[]): void;
  /** Once per drawn frame. */
  place(camera: Camera, width: number, height: number): void;
  dispose(): void;
}

export function createPreviewLabels(surface: HTMLElement): PreviewLabels {
  const layer = surface.ownerDocument.createElement("div");
  layer.className = "preview-labels";
  layer.dataset.testid = "preview-labels";
  surface.append(layer);
  let entries: { node: HTMLElement; position: Vector3 }[] = [];
  const point = new Vector3();
  return {
    set(labels) {
      entries = labels.map(({ text, position }) => {
        const node = surface.ownerDocument.createElement("span");
        node.textContent = text;
        return { node, position };
      });
      layer.replaceChildren(...entries.map((entry) => entry.node));
    },
    place(camera, width, height) {
      for (const { node, position } of entries) {
        point.copy(position).project(camera);
        node.hidden = point.z > 1;
        node.style.transform = `translate(-50%, 6px) translate(${((point.x + 1) / 2) * width}px, ${((1 - point.y) / 2) * height}px)`;
      }
    },
    dispose: () => layer.remove(),
  };
}
