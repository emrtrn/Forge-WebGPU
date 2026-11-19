// Impostor bake off the main thread (plan 5c F3): an imported model's surfaces baked into the PG3 atlas
// (engine/procgen/bake/impostorAtlas.ts) for its far billboards. Pure and three-free; the render layer
// (render/plant/modelImpostor.ts) extracts the surfaces and turns the layers into textures.
import { bakeImpostorAtlas, type ImpostorAtlas, type ImpostorBakeOptions } from "../../procgen/bake/impostorAtlas.ts";
import type { BakeSurface } from "../../procgen/bake/rasterizer.ts";

export interface ImpostorBakeRequest {
  id: number;
  surfaces: BakeSurface[];
  options: ImpostorBakeOptions;
}

/** The atlas layers are transferred back; an unscoped error disables the worker. */
export type ImpostorBakeResponse =
  | { type: "baked"; id: number; atlas: ImpostorAtlas }
  | { type: "error"; id: number | null; message: string };

// A local scope type: `src/engine` type-checks without the DOM / WebWorker libraries.
const scope = globalThis as unknown as {
  addEventListener?(type: "message", listener: (event: { readonly data: ImpostorBakeRequest }) => void): void;
  postMessage(message: ImpostorBakeResponse, transfer?: ArrayBuffer[]): void;
};

// Outside a worker (plain Node: the engine's load gate) the module loads inert.
scope.addEventListener?.("message", ({ data }) => {
  const id = data && typeof data === "object" && typeof data.id === "number" ? data.id : null;
  try {
    if (id === null) throw new Error("Invalid impostor bake request");
    const atlas = bakeImpostorAtlas(data.surfaces, data.options);
    const transfer = atlas.layers.flatMap((layer) => [layer.albedo.buffer as ArrayBuffer, layer.normal.buffer as ArrayBuffer]);
    scope.postMessage({ type: "baked", id, atlas }, transfer);
  } catch (error) {
    scope.postMessage({ type: "error", id, message: error instanceof Error ? error.message : String(error) });
  }
});
