import { describe, expect, test } from "vitest";
import type { BackendProof } from "./backendProof.ts";
import { badgeText, shouldShowBadge } from "./badge.ts";

const proof = (webgpu: boolean): BackendProof => ({
  isWebGPUBackend: webgpu,
  backend: webgpu ? "webgpu" : "webgl2",
  compatibilityMode: webgpu ? false : null,
  adapter: webgpu ? { vendor: "nvidia", architecture: "ampere", device: "", description: "" } : null,
  timestampQuery: webgpu,
  features: [],
  limits: {},
  userAgent: "test",
});

describe("backend badge", () => {
  test("always in development; in production only on the WebGL2 fallback", () => {
    expect(shouldShowBadge(proof(true), true)).toBe(true);
    expect(shouldShowBadge(proof(false), true)).toBe(true);
    expect(shouldShowBadge(proof(true), false)).toBe(false);
    expect(shouldShowBadge(proof(false), false)).toBe(true);
  });

  test("names the real backend; a fallback says it is not a WebGPU run", () => {
    expect(badgeText(proof(true))).toBe("WebGPU · nvidia ampere");
    expect(badgeText(proof(false))).toBe("WebGL2 fallback: not a WebGPU run");
  });
});
