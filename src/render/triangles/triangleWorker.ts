import { prepareTriangles } from "../../engine/geometry/prepareTriangles.ts";
import type { TriangleInput } from "../../engine/geometry/triangleData.ts";

const worker = globalThis as unknown as {
  onmessage: ((event: MessageEvent<{ ticket: number; input: TriangleInput }>) => void) | null;
  postMessage(value: unknown): void;
};
// One worker serializes expensive CPU preparations without blocking rendering.
let tail: Promise<void> = Promise.resolve();
worker.onmessage = (event) => {
  const { ticket, input } = event.data;
  tail = tail.then(async () => {
    try { worker.postMessage({ ticket, data: await prepareTriangles(input) }); }
    catch (error) { worker.postMessage({ ticket, error: String(error) }); }
  });
};
