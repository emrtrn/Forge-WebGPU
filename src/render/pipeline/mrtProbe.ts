// The MRT budget on the real device (phase 3 decision 4: "verified on the
// device at the first pipeline setup"). Once, after the renderer starts on
// WebGPU: a render pipeline with every MRT target (MRT_TARGETS, the Cinematic
// set) is created inside a validation error scope. The device accepts it only
// if the targets' bytes per sample fit its `maxColorAttachmentBytesPerSample`,
// which the renderer never raises (no `requiredLimits`). The result goes into
// the perf witness and the smoke record.

import { MRT_TARGETS, mrtBytesPerSample, type MrtTarget } from "./pipelinePlan.ts";

/** The parts of a GPUDevice the probe uses (no WebGPU typings in this project). */
export interface ProbeDevice {
  readonly limits: { readonly maxColorAttachmentBytesPerSample?: number };
  pushErrorScope(filter: "validation"): void;
  popErrorScope(): Promise<{ readonly message: string } | null>;
  createShaderModule(descriptor: { code: string }): unknown;
  createRenderPipeline(descriptor: unknown): unknown;
}

export interface MrtProbeResult {
  /** Bytes per sample of the full set by the WebGPU rule. */
  readonly bytes: number;
  /** The device's limit; null when it does not say. */
  readonly limit: number | null;
  /** The device accepted a pipeline with every target. */
  readonly ok: boolean;
  readonly error: string | null;
}

function shader(targets: readonly MrtTarget[]): string {
  const members = targets.map((_, index) => `@location(${index}) t${index}: vec4f`).join(", ");
  return [
    "@vertex fn vs(@builtin(vertex_index) i: u32) -> @builtin(position) vec4f { return vec4f(0.0, 0.0, 0.0, 1.0); }",
    `struct Targets { ${members} }`,
    "@fragment fn fs() -> Targets { var o: Targets; return o; }",
  ].join("\n");
}

export async function probeMrtBudget(device: ProbeDevice, targets: readonly MrtTarget[] = MRT_TARGETS): Promise<MrtProbeResult> {
  const bytes = mrtBytesPerSample(targets);
  const reported = device.limits.maxColorAttachmentBytesPerSample;
  const limit = typeof reported === "number" ? reported : null;
  device.pushErrorScope("validation");
  let thrown: string | null = null;
  try {
    const module = device.createShaderModule({ code: shader(targets) });
    device.createRenderPipeline({
      layout: "auto",
      vertex: { module, entryPoint: "vs" },
      fragment: { module, entryPoint: "fs", targets: targets.map((target) => ({ format: target.format })) },
      primitive: { topology: "triangle-list" },
    });
  } catch (error) {
    thrown = error instanceof Error ? error.message : String(error);
  }
  const scoped = await device.popErrorScope();
  const error = thrown ?? scoped?.message ?? null;
  return { bytes, limit, ok: error === null, error };
}
