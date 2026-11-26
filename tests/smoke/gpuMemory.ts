// Test-only browser instrumentation (measure:forest, plan 5c gate): the GPU memory the page holds, counted at
// the WebGPU API boundary. three's `renderer.info.memory` counts a compressed texture as 1 byte, so it cannot
// tell a KTX2 atlas from an RGBA8 one; this wraps `GPUDevice.createTexture` / `createBuffer` and the objects'
// `destroy`: live bytes, the peak since the last reset, and object counts. Texture bytes from the descriptor
// (format, size, mips, samples; block formats by block); a texture three never destroys stays counted, as it
// stays on the GPU. Also counts the pipelines and shader modules created (PV-WES-08: no growth on a season
// change). Installed before navigation.

import type { Page } from "@playwright/test";

export interface GpuMemory {
  liveBytes: number;
  peakBytes: number;
  textures: number;
  textureBytes: number;
  buffers: number;
  bufferBytes: number;
  pipelines: number;
  shaderModules: number;
  /** Texture formats the byte table does not know (counted as 4 bytes per texel). */
  unknownFormats: string[];
  /** Live buffers by `<size>:<usage flags>` (a leak shows as a key that keeps growing). */
  bufferKinds: Record<string, number>;
  /** Labels of the last 200 pipelines created (`<call>:<label>:<vertex module>:<fragment module>`). */
  pipelineLabels: string[];
}

export async function installGpuMemory(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const state = {
      liveBytes: 0, peakBytes: 0, textures: 0, textureBytes: 0, buffers: 0, bufferBytes: 0, pipelines: 0, shaderModules: 0,
      unknownFormats: [] as string[], bufferKinds: {} as Record<string, number>,
      /** Labels of the pipelines created, in order (the last 200): which ones a change made. */
      pipelineLabels: [] as string[],
    };
    (window as unknown as { __forgeGpuMemory: typeof state & { reset(): void } }).__forgeGpuMemory = Object.assign(state, {
      reset() { state.peakBytes = state.liveBytes; },
    });
    const ctor = (globalThis as unknown as { GPUDevice?: { prototype: Record<string, unknown> } }).GPUDevice;
    const textureCtor = (globalThis as unknown as { GPUTexture?: { prototype: Record<string, unknown> } }).GPUTexture;
    const bufferCtor = (globalThis as unknown as { GPUBuffer?: { prototype: Record<string, unknown> } }).GPUBuffer;
    if (!ctor || !textureCtor || !bufferCtor) return;
    // Bytes per 4 × 4 block for block formats, per texel otherwise.
    const blockBytes = (format: string): { bytes: number; block: number } | null => {
      if (/^(bc1|bc4|etc2-rgb8|etc2-rgb8a1|eac-r11)/.test(format)) return { bytes: 8, block: 4 };
      if (/^(bc[2357]|bc6h|etc2-rgba8|eac-rg11|astc-4x4)/.test(format)) return { bytes: 16, block: 4 };
      const texel: Record<string, number> = {
        r8unorm: 1, r8snorm: 1, r8uint: 1, r8sint: 1, stencil8: 1,
        r16float: 2, r16uint: 2, r16sint: 2, rg8unorm: 2, rg8snorm: 2, rg8uint: 2, rg8sint: 2, depth16unorm: 2,
        r32float: 4, r32uint: 4, r32sint: 4, rg16float: 4, rg16uint: 4, rg16sint: 4, rgba8unorm: 4, "rgba8unorm-srgb": 4,
        rgba8snorm: 4, rgba8uint: 4, rgba8sint: 4, bgra8unorm: 4, "bgra8unorm-srgb": 4, rgb10a2unorm: 4, rg11b10ufloat: 4,
        rgb9e5ufloat: 4, depth24plus: 4, "depth24plus-stencil8": 4, depth32float: 4, "depth32float-stencil8": 5,
        rg32float: 8, rg32uint: 8, rg32sint: 8, rgba16float: 8, rgba16uint: 8, rgba16sint: 8,
        rgba32float: 16, rgba32uint: 16, rgba32sint: 16,
      };
      const bytes = texel[format];
      return bytes === undefined ? null : { bytes, block: 1 };
    };
    const sizes = new WeakMap<object, number>();
    const kinds = new WeakMap<object, string>();
    const add = (bytes: number) => { state.liveBytes += bytes; state.peakBytes = Math.max(state.peakBytes, state.liveBytes); };
    const wrap = (proto: Record<string, unknown>, name: string, after: (result: unknown, args: unknown[]) => void) => {
      const original = proto[name];
      if (typeof original !== "function") return;
      proto[name] = function (this: unknown, ...args: unknown[]) {
        const result: unknown = original.apply(this, args);
        if (result instanceof Promise) return result.then((value) => { after(value, args); return value; });
        after(result, args);
        return result;
      };
    };
    wrap(ctor.prototype, "createTexture", (texture, [descriptor]) => {
      const d = descriptor as { size: number[] | { width: number; height?: number; depthOrArrayLayers?: number }; format: string; mipLevelCount?: number; sampleCount?: number; dimension?: string };
      const [width, height, layers] = Array.isArray(d.size) ? [d.size[0] ?? 1, d.size[1] ?? 1, d.size[2] ?? 1] : [d.size.width, d.size.height ?? 1, d.size.depthOrArrayLayers ?? 1];
      let format = blockBytes(d.format);
      if (!format) { if (!state.unknownFormats.includes(d.format)) state.unknownFormats.push(d.format); format = { bytes: 4, block: 1 }; }
      let bytes = 0;
      for (let mip = 0; mip < (d.mipLevelCount ?? 1); mip += 1) {
        const w = Math.max(1, width >> mip), h = Math.max(1, height >> mip), z = d.dimension === "3d" ? Math.max(1, layers >> mip) : layers;
        bytes += Math.ceil(w / format.block) * Math.ceil(h / format.block) * z * format.bytes;
      }
      bytes *= d.sampleCount ?? 1;
      sizes.set(texture as object, bytes);
      state.textures += 1; state.textureBytes += bytes; add(bytes);
    });
    wrap(ctor.prototype, "createBuffer", (buffer, [descriptor]) => {
      const bytes = (descriptor as { size: number }).size;
      sizes.set(buffer as object, bytes);
      const kind = `${bytes}:${(descriptor as { usage: number }).usage}`;
      kinds.set(buffer as object, kind);
      state.bufferKinds[kind] = (state.bufferKinds[kind] ?? 0) + 1;
      state.buffers += 1; state.bufferBytes += bytes; add(bytes);
    });
    for (const name of ["createRenderPipeline", "createRenderPipelineAsync", "createComputePipeline", "createComputePipelineAsync"]) {
      wrap(ctor.prototype, name, (_result, [descriptor]) => {
        state.pipelines += 1;
        const d = descriptor as { label?: string; vertex?: { module?: { label?: string } }; fragment?: { module?: { label?: string } } } | undefined;
        state.pipelineLabels.push(`${name}:${d?.label ?? ""}:${d?.vertex?.module?.label ?? ""}:${d?.fragment?.module?.label ?? ""}`);
        if (state.pipelineLabels.length > 200) state.pipelineLabels.shift();
      });
    }
    wrap(ctor.prototype, "createShaderModule", () => { state.shaderModules += 1; });
    const release = (proto: Record<string, unknown>, kind: "texture" | "buffer") => {
      const original = proto.destroy;
      if (typeof original !== "function") return;
      proto.destroy = function (this: object, ...args: unknown[]) {
        const bytes = sizes.get(this);
        if (bytes !== undefined) {
          sizes.delete(this);
          state.liveBytes -= bytes;
          if (kind === "texture") { state.textures -= 1; state.textureBytes -= bytes; } else {
            state.buffers -= 1; state.bufferBytes -= bytes;
            const key = kinds.get(this);
            if (key !== undefined && (state.bufferKinds[key] = (state.bufferKinds[key] ?? 1) - 1) === 0) delete state.bufferKinds[key];
          }
        }
        return original.apply(this, args);
      };
    };
    release(textureCtor.prototype, "texture");
    release(bufferCtor.prototype, "buffer");
  });
}

export async function gpuMemory(page: Page): Promise<GpuMemory> {
  return page.evaluate(() => {
    const { reset: _reset, ...state } = (window as unknown as { __forgeGpuMemory: GpuMemory & { reset(): void } }).__forgeGpuMemory;
    return structuredClone(state);
  });
}

export async function resetGpuPeak(page: Page): Promise<void> {
  await page.evaluate(() => (window as unknown as { __forgeGpuMemory: { reset(): void } }).__forgeGpuMemory.reset());
}
