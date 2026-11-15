// Imported first by webgpu.config.ts: the run draws with WebGPU (support.ts
// reads it). Set in the main process before workers start, so they inherit it.
process.env.FORGE_EDITOR_WEBGPU = "1";
