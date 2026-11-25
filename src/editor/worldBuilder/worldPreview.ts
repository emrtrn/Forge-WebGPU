// The World Builder window's bird's-eye preview (Forge WebGL
// randomWorldPanel.ts @ forge-webgl-final): the builder's own generator in a
// worker (src/runtime/worldbuilder/randomWorldPreviewWorker.ts), drawn on a
// canvas with the settlements, straight roads, rivers and lakes over it. Only
// the latest request's picture is shown.

import type { RandomWorldOptions, SettlementType } from "../../engine/worldbuilder/randomWorld.ts";
import type { RandomWorldPreview } from "../../engine/worldbuilder/randomWorldPreview.ts";
import type { RandomWorldPreviewRequest, RandomWorldPreviewResponse } from "../../runtime/worldbuilder/randomWorldPreviewWorker.ts";

/** Preview canvas side, CSS pixels. */
export const PREVIEW_SIZE = 320;

export const SETTLEMENT_LABELS: Readonly<Record<SettlementType, string>> = { hamlet: "Hamlet", village: "Village", town: "Town" };

export function drawWorldPreview(canvas: HTMLCanvasElement, preview: RandomWorldPreview): void {
  const doc = canvas.ownerDocument;
  const scale = Math.max(1, Math.round(doc.defaultView?.devicePixelRatio || 1));
  const size = PREVIEW_SIZE * scale;
  if (canvas.width !== size) {
    canvas.width = size;
    canvas.height = size;
  }
  const context = canvas.getContext("2d");
  if (!context) return;
  const source = doc.createElement("canvas");
  source.width = preview.resolution;
  source.height = preview.resolution;
  source.getContext("2d")!.putImageData(new ImageData(new Uint8ClampedArray(preview.pixels), preview.resolution, preview.resolution), 0, 0);
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  context.drawImage(source, 0, 0, size, size);
  const at = ([u, v]: readonly [number, number]): [number, number] => [u * size, v * size];
  const trace = (points: readonly (readonly [number, number])[]): void => {
    context.beginPath();
    points.forEach((point, index) => (index ? context.lineTo(...at(point)) : context.moveTo(...at(point))));
  };
  context.lineCap = "round";
  context.lineJoin = "round";
  // Lakes: the raster fills them; a shore line keeps small ones readable.
  context.strokeStyle = "rgba(160, 205, 240, 0.9)";
  context.lineWidth = 1.2 * scale;
  for (const lake of preview.lakes) {
    trace(lake.polygon);
    context.closePath();
    context.stroke();
  }
  context.strokeStyle = "rgb(70, 130, 190)";
  for (const river of preview.rivers) {
    context.lineWidth = Math.max(2 * scale, river.width * size);
    trace(river.points);
    context.stroke();
  }
  for (const road of preview.roads) {
    const track = road.roadClass === "track";
    context.strokeStyle = "rgba(40, 32, 24, 0.55)";
    context.lineWidth = (track ? 3 : 4) * scale;
    trace([road.from, road.to]);
    context.stroke();
    context.strokeStyle = track ? "rgb(222, 200, 160)" : "rgb(246, 232, 196)";
    context.lineWidth = (track ? 1.5 : 2) * scale;
    context.stroke();
  }
  context.font = `${10 * scale}px system-ui, sans-serif`;
  context.textAlign = "center";
  context.textBaseline = "middle";
  for (const settlement of preview.settlements) {
    const [x, y] = at(settlement.at);
    context.fillStyle = "rgba(255, 255, 255, 0.22)";
    context.strokeStyle = "rgba(255, 255, 255, 0.95)";
    context.lineWidth = 1.5 * scale;
    context.beginPath();
    context.arc(x, y, Math.max(5 * scale, settlement.radius * size), 0, Math.PI * 2);
    context.fill();
    context.stroke();
    context.fillStyle = "#ffffff";
    context.strokeStyle = "rgba(0, 0, 0, 0.7)";
    context.lineWidth = 3 * scale;
    const label = SETTLEMENT_LABELS[settlement.type as SettlementType] ?? settlement.type;
    context.strokeText(label, x, y);
    context.fillText(label, x, y);
  }
  // North mark.
  context.fillStyle = "rgba(0, 0, 0, 0.45)";
  context.fillRect(6 * scale, 6 * scale, 18 * scale, 18 * scale);
  context.fillStyle = "#ffffff";
  context.font = `bold ${11 * scale}px system-ui, sans-serif`;
  context.fillText("N", 15 * scale, 15.5 * scale);
}

export interface WorldPreviewer {
  /** Asks for a picture; an older one still on its way is dropped. */
  request(options: RandomWorldOptions, cover: unknown): void;
  /** Drops the picture on its way. */
  cancel(): void;
  dispose(): void;
}

export function createWorldPreviewer(ready: (preview: RandomWorldPreview) => void, failed: (message: string) => void): WorldPreviewer {
  let worker: Worker | null = null;
  let latest = 0;
  const start = (): Worker => {
    const made = new Worker(new URL("../../runtime/worldbuilder/randomWorldPreviewWorker.ts", import.meta.url), { type: "module" });
    made.addEventListener("message", (event: MessageEvent<RandomWorldPreviewResponse>) => {
      if (event.data.id !== latest) return;
      if ("error" in event.data) failed(event.data.error);
      else ready(event.data.preview);
    });
    made.addEventListener("error", (event) => {
      made.terminate();
      if (worker === made) worker = null;
      failed(event.message || "The preview worker failed.");
    });
    return made;
  };
  return {
    request(options, cover) {
      latest += 1;
      worker ??= start();
      const request: RandomWorldPreviewRequest = { id: latest, options, cover };
      worker.postMessage(request);
    },
    cancel() {
      latest += 1;
    },
    dispose() {
      worker?.terminate();
      worker = null;
    },
  };
}
