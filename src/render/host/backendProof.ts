// Backend proof (plan phase 1 S1, architecture §4.9, §4.10): which backend the
// renderer really runs on, read from the backend after `init()`, never
// assumed. A run that fell back to WebGL2 is not a WebGPU acceptance run.
// Same shape as the spike's (Forge spikes/webgpu/shared/spike.ts).

import type { WebGPURenderer } from "three/webgpu";

export interface BackendProof {
  readonly isWebGPUBackend: boolean;
  readonly backend: "webgpu" | "webgl2";
  readonly compatibilityMode: boolean | null;
  readonly adapter: {
    readonly vendor: string | undefined;
    readonly architecture: string | undefined;
    readonly device: string | undefined;
    readonly description: string | undefined;
  } | null;
  readonly timestampQuery: boolean;
  readonly features: readonly string[];
  readonly limits: Readonly<Record<string, number>>;
  readonly userAgent: string;
}

const LIMIT_KEYS = [
  "maxTextureDimension2D",
  "maxTextureArrayLayers",
  "maxBindGroups",
  "maxStorageBufferBindingSize",
  "maxBufferSize",
  "maxComputeWorkgroupStorageSize",
  "maxComputeInvocationsPerWorkgroup",
  "maxColorAttachments",
  "maxColorAttachmentBytesPerSample",
];

/** Reads the proof from an initialised renderer. */
export function readBackendProof(renderer: WebGPURenderer, userAgent: string): BackendProof {
  // The backend's device and adapter are not in the public typings.
  const backend = renderer.backend as unknown as {
    isWebGPUBackend?: boolean;
    compatibilityMode?: boolean;
    device?: { features: Iterable<string> & { has(name: string): boolean }; limits: Record<string, number>; adapterInfo?: Record<string, string> };
  };
  const device = backend.device;
  const info = device?.adapterInfo;
  const webgpu = backend.isWebGPUBackend === true;
  return {
    isWebGPUBackend: webgpu,
    backend: webgpu ? "webgpu" : "webgl2",
    compatibilityMode: typeof backend.compatibilityMode === "boolean" ? backend.compatibilityMode : null,
    adapter: info ? { vendor: info.vendor, architecture: info.architecture, device: info.device, description: info.description } : null,
    timestampQuery: device ? device.features.has("timestamp-query") : false,
    features: device ? [...device.features].sort() : [],
    limits: device ? Object.fromEntries(LIMIT_KEYS.map((key) => [key, Number(device.limits[key])])) : {},
    userAgent,
  };
}
