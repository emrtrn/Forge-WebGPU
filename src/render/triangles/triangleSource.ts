import type { BufferGeometry } from "three/webgpu";
import { TRIANGLE_VERSION, triangleKey, triangleSignature, type TriangleData, type TriangleInput } from "../../engine/geometry/triangleData.ts";

export function triangleInput(geometry: BufferGeometry): TriangleInput {
  const attributes: Record<string, { size: number; values: number[] }> = {};
  for (const name of Object.keys(geometry.attributes).sort()) {
    const attribute = geometry.attributes[name]!;
    if ((attribute as { isInstancedBufferAttribute?: boolean }).isInstancedBufferAttribute) continue;
    if (attribute.itemSize > 4) throw new Error(`triangles: unsupported attribute ${name}`);
    const values: number[] = [];
    for (let i = 0; i < attribute.count; i += 1) for (let c = 0; c < attribute.itemSize; c += 1) values.push(Math.fround(attribute.getComponent(i, c)));
    attributes[name] = { size: attribute.itemSize, values };
  }
  const count = geometry.attributes.position?.count ?? 0;
  return { attributes, indices: geometry.index ? Array.from(geometry.index.array) : Array.from({ length: count }, (_, i) => i), ...(geometry.groups.length ? { groups: geometry.groups.map((group) => ({ start: group.start, count: group.count, materialIndex: group.materialIndex ?? 0 })) } : {}) };
}

/** Only cache hits are fetched: a procedural shape or changed UVW uses the
 * identical local producer. No authored model or node_modules is written. */
export function createTriangleSource(dev: boolean) {
  const base = dev ? "/__forge/triangles/" : `${import.meta.env.BASE_URL}forge/triangles/`;
  const headers: Record<string, string> = dev ? { "X-Forge-Request": "1" } : {};
  let index: Promise<Set<string>> | null = null;
  let worker: Worker | null = null, ticket = 0, disposed = false;
  const pending = new Map<number, { resolve(data: TriangleData): void; reject(error: Error): void }>();
  const prepare = (input: TriangleInput): Promise<TriangleData> => {
    if (disposed) return Promise.reject(new Error("triangles: source disposed"));
    worker ??= new Worker(new URL("./triangleWorker.ts", import.meta.url), { type: "module" });
    worker.onmessage = (event: MessageEvent<{ ticket: number; data?: TriangleData; error?: string }>) => {
      const work = pending.get(event.data.ticket); if (!work) return;
      pending.delete(event.data.ticket);
      if (event.data.data) work.resolve(event.data.data); else work.reject(new Error(event.data.error ?? "Triangle preparation failed"));
    };
    worker.onerror = (error) => { for (const work of pending.values()) work.reject(new Error(error.message)); pending.clear(); worker?.terminate(); worker = null; };
    const id = ++ticket;
    return new Promise((resolve, reject) => { pending.set(id, { resolve, reject }); worker!.postMessage({ ticket: id, input }); });
  };
  const load = async (input: TriangleInput): Promise<TriangleData> => {
    if (disposed) throw new Error("triangles: source disposed");
    const key = triangleKey(input), signature = triangleSignature(input);
    index ??= fetch(`${base}index.json`, { headers }).then(async (response) => new Set(response.ok ? await response.json() as string[] : [])).catch(() => new Set<string>());
    if ((await index).has(key)) {
      try {
        const response = await fetch(`${base}${key}.json`, { headers });
        if (response.ok) {
          const artifact = await response.json() as { signature: string; data: TriangleData };
          if (artifact.signature === signature && artifact.data.version === TRIANGLE_VERSION && artifact.data.key === key) return artifact.data;
        }
      } catch { /* Offline / stale derived data is regenerated. */ }
    }
    return prepare(input);
  };
  return Object.assign(load, { dispose() {
    disposed = true; worker?.terminate(); worker = null;
    for (const work of pending.values()) work.reject(new Error("triangles: source disposed")); pending.clear();
  } });
}
