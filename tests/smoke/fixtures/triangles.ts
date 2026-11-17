/// <reference types="vite/client" />
import { BoxGeometry, Color, DoubleSide, Group, InstancedMesh, Matrix4, MeshStandardNodeMaterial, SphereGeometry, TimestampQuery, Vector3 } from "three/webgpu";
import type { RenderHost } from "../../../src/render/host/renderHost.ts";
import type { TriangleBinding } from "../../../src/render/triangles/triangleDrawing.ts";
import { cullInstanceCounts } from "../../../src/engine/world/instanceCulling.ts";

interface Dev { host(): RenderHost; pause(): void; resume(): void; step(ms: number): Promise<{ cpuMs: number; gpuMs: number | null }> }
const dev = () => (window as unknown as { __forgeDev: Dev }).__forgeDev;
let sources: InstancedMesh[] = [], bindings: TriangleBinding[] = [], root: Group | null = null;
let nativeDraws = 0, indirectDraws = 0, bundleReplays = 0, bundleRecords = 0;
let uninstall: (() => void)[] = [];
const frame = () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

function instrument() {
  const w = globalThis as unknown as Record<string, { prototype: Record<string, unknown> } | undefined>;
  const draws = new WeakMap<object, number>();
  const indirect = new WeakMap<object, number>();
  for (const name of ["GPURenderPassEncoder", "GPURenderBundleEncoder"]) {
    const proto = w[name]?.prototype; if (!proto) continue;
    for (const key of ["draw", "drawIndexed", "drawIndirect", "drawIndexedIndirect", "finish", "executeBundles"]) {
      const original = proto[key]; if (typeof original !== "function") continue;
      proto[key] = function(this: object, ...args: unknown[]) {
        if (key.startsWith("draw")) { nativeDraws++; if (key.endsWith("Indirect")) { indirectDraws++; indirect.set(this, (indirect.get(this) ?? 0) + 1); } draws.set(this, (draws.get(this) ?? 0) + 1); }
        if (key === "executeBundles") for (const bundle of args[0] as object[]) { nativeDraws += draws.get(bundle) ?? 0; indirectDraws += indirect.get(bundle) ?? 0; bundleReplays++; }
        const result: unknown = original.apply(this, args);
        if (key === "finish" && result && typeof result === "object") { draws.set(result, draws.get(this) ?? 0); indirect.set(result, indirect.get(this) ?? 0); bundleRecords++; }
        return result;
      };
      uninstall.push(() => { proto[key] = original; });
    }
  }
}

export async function install(bundle: boolean) {
  remove(); instrument();
  const host = dev().host(), scene = host.world!.scene;
  root = new Group(); host.world!.root.add(root);
  // Normal / motion MRT, terrain and three cascade sunlight stay in place.
  for (const [small, double, box] of [[false, false, false], [false, true, false], [true, false, false], [true, false, true]] as const) {
    const radius = small ? .3 : 8;
    const geometry = box ? new BoxGeometry(.5, .5, .5) : new SphereGeometry(radius, 64, 32), material = new MeshStandardNodeMaterial({ color: small ? "#ff3333" : double ? "#33ff33" : "#3333ff", ...(double ? { side: DoubleSide } : {}) });
    const count = small ? 6 : 24, source = new InstancedMesh(geometry, material, count);
    source.name = `r7/${small ? "detail" : double ? "double" : "front"}`; source.castShadow = true; source.receiveShadow = true;
    for (let i = 0; i < count; i++) {
      const offset = small ? new Vector3((i - 3) * .8, 0, -[2, 8, 18, 35, 55, 65][i]!) : new Vector3((i % 6 - 3) * 20, (double ? 20 : -20), -40 - Math.floor(i / 6) * 60);
      offset.applyQuaternion(host.camera.quaternion).add(host.camera.position);
      source.setMatrixAt(i, new Matrix4().makeTranslation(...offset.toArray()));
      if (double) source.setColorAt(i, new Color().setRGB(i % 2 ? .5 : 1, 1, .4));
    }
    source.instanceMatrix.needsUpdate = true; if (source.instanceColor) source.instanceColor.needsUpdate = true;
    const binding = await host.triangles.prepare(source, radius, bundle);
    await host.prepare(binding.objects, scene);
    root.add(source); binding.activate(); sources.push(source); bindings.push(binding);
  }
  return bindings.map((binding) => ({ path: binding.path, lods: binding.batch.lodCount }));
}

export async function check() {
  const host = dev().host(), gpu = host.gpuDriven;
  const fallback = [];
  for (const binding of bindings) if (binding.batch) {
    const batch = binding.batch;
    const views = [];
    for (let i = 0; i < batch.views; i++) views.push({ gpu: await batch.readCounts(host.renderer, i), cpu: cullInstanceCounts(batch.instances.matrices(), batch.instances.count, batch.cullBatch, gpu.lastViews[i]!) });
    fallback.push({ name: binding.source.name, views });
  }
  return { fallback, views: gpu.lastViews.length, reversed: host.renderer.reversedDepthBuffer };
}

export async function measure(warmup = 40, samples = 30) {
  dev().pause();
  const host = dev().host(); const rows = [];
  const autoReset = host.renderer.info.autoReset;
  host.renderer.info.autoReset = false;
  try {
  for (let i = 0; i < warmup + samples; i++) {
    await frame(); nativeDraws = 0; indirectDraws = 0; bundleReplays = 0; bundleRecords = 0;
    host.renderer.info.reset();
    const { cpuMs, gpuMs: gpuRenderMs } = await dev().step(1000 / 60);
    const gpuComputeMs = host.proof.isWebGPUBackend ? await host.renderer.resolveTimestampsAsync(TimestampQuery.COMPUTE) : null;
    if (i >= warmup) rows.push({ cpuMs, submitMs: host.renderSubmitMs, gpuRenderMs, gpuComputeMs, nativeDraws, indirectDraws, bundleReplays, bundleRecords, reportedDraws: host.renderer.info.render.drawCalls + host.gpuDriven.lastDraws });
  }
  } finally { host.renderer.info.autoReset = autoReset; }
  return rows;
}

export async function move() {
  const source = sources[0]!, m = new Matrix4();
  for (let i = 0; i < source.count; i++) { source.getMatrixAt(i, m); m.elements[12]! += 10000; source.setMatrixAt(i, m); }
  source.instanceMatrix.needsUpdate = true;
  await frame(); await dev().step(1000 / 60);
  return check();
}

export function remove() {
  for (const binding of bindings) binding.dispose(); bindings = [];
  for (const source of sources) { source.removeFromParent(); source.dispose(); source.geometry.dispose(); for (const m of Array.isArray(source.material) ? source.material : [source.material]) m.dispose(); }
  sources = []; root?.removeFromParent(); root = null;
  for (const restore of uninstall) restore(); uninstall = [];
}
