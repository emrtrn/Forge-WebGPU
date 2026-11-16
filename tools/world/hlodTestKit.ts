import { Document, NodeIO } from "@gltf-transform/core";
import { buildAssetIndex, type AssetId, type ActorId, type LevelId, type ContentFile } from "../../src/core/index.ts";
import { loadEngineRegistry } from "../assets/engineRegistry.ts";
import type { HlodInput } from "./hlodInput.ts";

export const MODEL = `ast_${"a".repeat(32)}` as AssetId;
export const GREY = `ast_${"b".repeat(32)}` as AssetId;
export const GREEN = `ast_${"c".repeat(32)}` as AssetId;
export const LEVEL = `lvl_${"d".repeat(32)}` as LevelId;
export const FOLDER = "content/levels/test";
export const encode = (value: unknown) => new TextEncoder().encode(JSON.stringify(value));
export const actorId = (index: number) => `act_${index.toString(16).padStart(32, "0")}` as ActorId;

export function actor(index: number, x = 10, scale = [3, 3, 3], mesh: AssetId = MODEL) {
  return { id: actorId(index), transform: { p: [x, 0, 10], s: scale },
    components: { mesh: { type: "forge.staticMesh@2", parent: null, mesh } } };
}
export const level = (actors: unknown[] = [actor(1), actor(2, 20, [3, 4, 3]), actor(3, 266)]) =>
  ({ schema: "forge.level/1", id: LEVEL, settings: { cellSize: 128 }, actors });
export function meta(id = MODEL, type = "forge.model@2", settings: Record<string, unknown> = {}) {
  return { schema: "forge.assetMeta/1", id, type, license: "CC0-1.0", source: { origin: "test" }, import: settings };
}

export async function cube(): Promise<Document> {
  const doc = new Document(), buffer = doc.createBuffer();
  const positions = doc.createAccessor().setType("VEC3").setBuffer(buffer).setArray(new Float32Array([
    -.5, -.5, -.5, .5, -.5, -.5, .5, .5, -.5, -.5, .5, -.5,
    -.5, -.5, .5, .5, -.5, .5, .5, .5, .5, -.5, .5, .5,
  ]));
  const indices = doc.createAccessor().setType("SCALAR").setBuffer(buffer).setArray(new Uint16Array([
    0, 2, 1, 0, 3, 2, 4, 5, 6, 4, 6, 7, 0, 1, 5, 0, 5, 4,
    3, 7, 6, 3, 6, 2, 0, 4, 7, 0, 7, 3, 1, 2, 6, 1, 6, 5,
  ]));
  const primitive = doc.createPrimitive().setAttribute("POSITION", positions).setIndices(indices)
    .setMaterial(doc.createMaterial("red").setBaseColorFactor([1, 0, 0, 1]));
  doc.createScene().addChild(doc.createNode().setMesh(doc.createMesh().addPrimitive(primitive)));
  return doc;
}

export async function fixture() {
  const source = new Map<string, Uint8Array>([
    [`${FOLDER}/level.json`, encode(level())],
    ["content/cube.glb", await new NodeIO().writeBinary(await cube())],
    ["content/cube.glb.meta.json", encode(meta())],
  ]);
  return source;
}

const registryPromise = loadEngineRegistry(process.cwd());
export async function inputOf(source: Map<string, Uint8Array>, reads = new Map<string, number>()): Promise<HlodInput> {
  const files: ContentFile[] = [...source].map(([path, bytes]) => {
    const slash = path.indexOf("/");
    return { root: decodeURIComponent(path.slice(0, slash)), path: path.slice(slash + 1),
      ...(path.endsWith(".json") ? { json: JSON.parse(new TextDecoder().decode(bytes)) as unknown } : {}) };
  });
  const registry = await registryPromise;
  const index = buildAssetIndex(files, { strict: true, registry });
  return { files, registry, index, io: { async read(path) {
    reads.set(path, (reads.get(path) ?? 0) + 1);
    return source.get(path) ?? null;
  } } };
}

export function addResult(source: Map<string, Uint8Array>, files: ReadonlyMap<string, Uint8Array>): void {
  for (const [path, bytes] of files) source.set(`${FOLDER}/${path}`, bytes);
}
