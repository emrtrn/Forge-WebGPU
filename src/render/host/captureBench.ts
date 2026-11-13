// The Sky Light capture on its own (plan phase 3 step 7 measurement): the
// sky captured `count` times back to back into one PMREM, as the Sky Light
// binding recaptures, then the GPU time of all of it resolved at once. Run
// with the frame loop paused (development hook), so no frame's renders mix
// in; back to back keeps the GPU busy, so its clock is not the idle one.

import { Vector3 } from "three/webgpu";
import { createCaptureSky } from "../materials/sky.ts";
import type { RenderHost } from "./renderHost.ts";

/** Same size as the Sky Light binding's capture (features/sky/render.ts). */
const CAPTURE_SIZE = 256;

export interface CaptureBenchResult {
  readonly count: number;
  /** GPU ms of all the captures; null without timestamp queries. */
  readonly gpuMs: number | null;
  /** CPU ms to encode them. */
  readonly cpuMs: number;
}

export async function benchmarkSkyCapture(host: RenderHost, count: number): Promise<CaptureBenchResult> {
  const sky = createCaptureSky();
  const sun = new Vector3(0.3, 0.05, -1).normalize();
  sky.apply({ rayleigh: 1, turbidity: 2, mie: 0.003, mieDirectionalG: 0.8 }, sun);
  const captured = host.capture.capture(sky.scene, CAPTURE_SIZE);
  try {
    // Pending renders (and the first capture's pipeline builds) resolve apart.
    await host.gpuTime();
    const started = performance.now();
    for (let i = 0; i < count; i += 1) captured.recapture(sky.scene);
    const cpuMs = performance.now() - started;
    const gpuMs = await host.gpuTime();
    return { count, gpuMs, cpuMs };
  } finally {
    captured.dispose();
    sky.dispose();
  }
}
