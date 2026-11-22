// `forge generate` (vegetation plan PG1, §5.2 / §9): runs a recipe's generator
// and writes its output as ordinary persisted assets in a folder beside the
// recipe (`<dir>/<stem>.rockrecipe.json` -> `<dir>/<stem>/…`).
//
// - GUIDs derive from the recipe's GUID and the output's role (seed, LOD,
//   texture slot), not from paths: a regeneration rewrites the same assets and
//   placements stay intact; moving the recipe keeps them too.
// - Binary outputs carry a meta file with origin "generated", the project
//   licence and the `generated` record (recipe, generator, version, SHA-256).
// - Output that already exists is overwritten only with `force` (the
//   counterpart of the level `--force` rule); files the recipe owned but no
//   longer writes are then deleted. A file at a planned path that the recipe
//   does not own is never overwritten.
// - Everything goes through the save service in one commit.

import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join, posix } from "node:path";
import {
  buildAssetIndex,
  fileLabel,
  isJsonAssetType,
  normalizeAssetMeta,
  normalizeJsonAsset,
  stringifyDocument,
  type AssetIndex,
  type JsonObject,
  type SchemaRegistry,
} from "../../src/core/index.ts";
import { writeGlb } from "../../src/engine/procgen/glb.ts";
import { generateRock } from "../../src/engine/procgen/rock/rockGenerator.ts";
import { bakeSurfaceTexture } from "../../src/engine/procgen/texture/surfaceTexture.ts";
import { engineContentRoots, packWithRequired } from "../assets/engineContent.ts";
import { loadEngineRegistry } from "../assets/engineRegistry.ts";
import { fileRevision } from "../assets/revision.ts";
import { scanRoots } from "../assets/scan.ts";
import { createClassStore, createDocumentCheck } from "../save/documentCheck.ts";
import { createSaveService, type SaveDelete, type SaveWrite, type SaveResult } from "../save/transaction.ts";
import { createWritePolicy } from "../server/projectPaths.ts";
import { openWorldProject } from "../world/worldProject.ts";
import { binaryWithMeta, GENERATED_MODEL_OPTIMIZE, GENERATOR_VERSIONS, outputId, round, srgbTriple, type GeneratorName, type Output } from "./outputs.ts";
import { decodePng } from "./png.ts";
import { encodeRgbaKtx2 } from "./ktx2.ts";
import { treeOutputs, type MaterialLook } from "./treeOutputs.ts";
import { treeOutputVersion } from "../../src/engine/procgen/tree/treeGrowth.ts";
import { defaultTreeLeafMaterial } from "../../src/engine/procgen/tree/treeRecipe.ts";
import type { GrassRecipeData } from "../../src/features/plant/schema.ts";
import { grassOutputs } from "./grassOutputs.ts";

export { GENERATOR_VERSIONS } from "./outputs.ts";

/** Plan §8 first budgets, triangles per LOD: large rock. */
const ROCK_TRIANGLE_BUDGET = [3000, 600, 120] as const;

export interface GenerateOptions {
  readonly engineRoot: string;
  /** A game project; or `pack`. */
  readonly projectRoot?: string;
  /** One of the engine's content packs (`content/packs/<pack>`), from the engine repo. */
  readonly pack?: string;
  /** The recipe's file label in the target (`content/rocks/granite.rockrecipe.json`). */
  readonly recipe: string;
  readonly force?: boolean;
  readonly dryRun?: boolean;
  /** Editor publication saves this draft and its outputs under the same revision lock. */
  readonly editorDraft?: { readonly base: string; readonly document: JsonObject };
}

export interface GeneratedFileReport { readonly path: string; readonly status: "new" | "changed" | "unchanged" }

export interface GenerateResult {
  readonly publication?: Extract<SaveResult, { status: "saved" }>;
  readonly recipe: string;
  readonly generator: GeneratorName;
  readonly generatorVersion: number;
  readonly files: readonly GeneratedFileReport[];
  readonly removed: readonly string[];
  /** Per output, e.g. `granite_1_lod0.glb: 642 vertices, 1280 triangles`. */
  readonly stats: readonly string[];
  readonly warnings: readonly string[];
  readonly milliseconds: number;
}

export class RecipeSaveConflict extends Error {
  readonly response: Extract<SaveResult, { status: "conflict" }>;
  constructor(conflicts: Extract<SaveResult, { status: "conflict" }>["conflicts"]) {
    super(`Files changed meanwhile: ${conflicts.map(conflict => conflict.path).join(", ")}`);
    this.response = { status: "conflict", conflicts };
  }
}

interface Target {
  readonly root: string;
  readonly writableRoots: readonly string[];
  readonly registry: SchemaRegistry;
  readonly index: AssetIndex;
}

const PACK_ID = /^[a-z][a-z0-9-]*$/;

async function openTarget(options: GenerateOptions): Promise<Target> {
  if ((options.pack === undefined) === (options.projectRoot === undefined)) throw new Error("give a project or a pack (not both)");
  if (options.pack !== undefined) {
    if (!PACK_ID.test(options.pack)) throw new Error(`not a content pack id: ${options.pack}`);
    const folder = `content/packs/${options.pack}`;
    const registry = await loadEngineRegistry(options.engineRoot);
    const required = (await packWithRequired(options.engineRoot, options.pack)).slice(1);
    const roots = [...engineContentRoots(options.engineRoot, required), { label: folder, dir: join(options.engineRoot, folder) }];
    const index = buildAssetIndex((await scanRoots(roots)).files, { strict: true, registry });
    return { root: options.engineRoot, writableRoots: [folder], registry, index };
  }
  const project = await openWorldProject(options.engineRoot, options.projectRoot!);
  return { root: project.root, writableRoots: project.manifest.contentRoots, registry: project.registry, index: project.index };
}

function rockOutputs(recipeId: string, data: JsonObject, folder: string, stem: string, stats: string[], warnings: string[]): Output[] {
  const outputs: Output[] = [];
  const version = GENERATOR_VERSIONS.rock;
  const generated = { recipe: recipeId, generator: "rock", generatorVersion: version };
  const noise = (data.noise ?? {}) as JsonObject;
  const material = typeof data.material === "string" ? data.material : null;
  const seeds = [...new Set((data.variants as number[] | undefined) ?? [1])];
  for (const seed of seeds) {
    const result = generateRock({
      seed, size: data.size, shape: data.shape, cuts: data.cuts,
      noiseAmplitude: noise.amplitude, noiseScale: noise.scale, noiseOctaves: noise.octaves,
      flattenBottom: data.flattenBottom, embedDepth: data.embedDepth, lods: data.lods,
    });
    if (!result.ok) throw new Error(`seed ${seed}: ${result.report.message}`);
    const lodIds: string[] = [];
    result.lods.forEach((mesh, lod) => {
      const name = `${stem}_${seed}_lod${lod}`;
      const bytes = writeGlb({
        nodes: [{ name, primitives: [{ mesh, material: 0 }], extras: { forgeGenerated: { recipe: recipeId, seed, lod } } }],
        materials: [{ name: "Rock", baseColor: [0.5, 0.5, 0.5, 1], roughness: 0.9 }],
        generator: `Forge procgen rock ${version}`,
      });
      const id = outputId(recipeId, `rock/${seed}/lod${lod}`);
      lodIds.push(id);
      const collision = lod === 0 && data.collision === "hull"
        ? { convex: [{ points: Array.from(result.collider.points, round) }] }
        : { convex: [] };
      binaryWithMeta(outputs, `${folder}/${name}.glb`, id, "forge.model@2", bytes, {
        materials: [material],
        optimize: GENERATED_MODEL_OPTIMIZE,
        collision,
      }, generated);
      const { vertices, triangles } = result.stats[lod]!;
      stats.push(`${name}.glb: ${vertices} vertices, ${triangles} triangles${lod === 0 ? `, collider ${result.collider.points.length / 3} points` : ""}`);
      const budget = ROCK_TRIANGLE_BUDGET[lod];
      if (budget !== undefined && triangles > budget) warnings.push(`${name}: ${triangles} triangles is over the LOD${lod} budget ${budget}`);
    });
    // The prototype as a foliage type: the 5c LOD contract (LOD0 + lods), scattered with collision.
    const typeId = outputId(recipeId, `rock/${seed}/foliageType`);
    const foliageType = {
      schema: "forge.foliageType/1",
      id: typeId,
      mesh: lodIds[0]!,
      collision: data.collision === "hull",
      lods: lodIds.slice(1).map((mesh, index) => ({ mesh, screenSize: round(0.3 / 2.5 ** index) })),
    };
    outputs.push({ path: `${folder}/${stem}_${seed}.foliagetype.json`, id: typeId, text: stringifyDocument(foliageType) });
  }
  return outputs;
}

/** A `forge.surfaceTextureRecipe` baked (the same call for its outputs and for an impostor bake reading them). */
function bakeSurfaceRecipe(data: JsonObject): ReturnType<typeof bakeSurfaceTexture> {
  return bakeSurfaceTexture({
    seed: data.seed,
    size: Number(data.size),
    layers: data.layers,
    colorRamp: ((data.colorRamp as JsonObject[] | undefined) ?? []).map((stop) => ({ at: stop.at, color: srgbTriple(String(stop.color)) })),
    normalStrength: data.normalStrength,
    roughness: data.roughness,
    aoStrength: data.aoStrength,
    metalness: data.metalness,
  });
}

/**
 * Base colour (sRGB), normal and ORM (linear) as KTX2 (ktx2.ts; user decision 2026-11-19, as the tree
 * atlases). Stored as baked: a tiling texture is read by triplanar projection or by a UV material that does
 * not flip (the starter's M_Rock, M_Bark); a flipping UV material would see it mirrored in V.
 */
async function surfaceTextureOutputs(recipeId: string, data: JsonObject, folder: string, stem: string, stats: string[]): Promise<Output[]> {
  const outputs: Output[] = [];
  const generated = { recipe: recipeId, generator: "surfaceTexture", generatorVersion: GENERATOR_VERSIONS.surfaceTexture };
  const started = performance.now();
  const baked = bakeSurfaceRecipe(data);
  const bakeMs = performance.now() - started;
  for (const [slot, pixels] of [["basecolor", baked.baseColor], ["normal", baked.normal], ["orm", baked.orm]] as const) {
    const bytes = await encodeRgbaKtx2(baked.size, baked.size, pixels, { srgb: slot === "basecolor" });
    const name = `${stem}_${slot}.ktx2`;
    binaryWithMeta(outputs, `${folder}/${name}`, outputId(recipeId, `surface/${slot}`), "forge.texture@2", bytes, { anisotropy: 8, mipmaps: true }, generated);
    stats.push(`${name}: ${baked.size} × ${baked.size}, ${bytes.length} bytes`);
  }
  stats.push(`bake ${Math.round(bakeMs)} ms`);
  return outputs;
}

function canonicalText(registry: SchemaRegistry, path: string, text: string): string {
  const raw = JSON.parse(text) as JsonObject;
  if (path.endsWith(".meta.json")) {
    const result = normalizeAssetMeta(raw, { strict: true, registry });
    if (!result.value || !result.ok) throw new Error(`${path}: ${result.issues.map((issue) => `${issue.path} ${issue.message}`).join("; ")}`);
    return stringifyDocument(result.value);
  }
  const tag = typeof raw.schema === "string" ? raw.schema.split("/")[0]! : "";
  const def = registry.getAssetType(tag);
  if (!def || !isJsonAssetType(def)) throw new Error(`${path}: no JSON asset type ${tag}`);
  const result = normalizeJsonAsset(def, raw, { strict: true });
  if (!result.value || !result.ok) throw new Error(`${path}: ${result.issues.map((issue) => `${issue.path} ${issue.message}`).join("; ")}`);
  return stringifyDocument(result.value);
}

/** The file of an index label: `engine:` labels in the engine repo, the rest in the target. */
const labelPath = (options: GenerateOptions, target: Target, label: string): string =>
  label.startsWith("engine:") ? join(options.engineRoot, label.slice("engine:".length)) : join(target.root, label);

/**
 * A material as the impostor bake sees it: colour, base colour texture, tiling, flip, cut. The texture is
 * baked again from its `forge.surfaceTextureRecipe` when it is one's output (its file is KTX2, which Node
 * does not decode here), otherwise decoded from a PNG.
 */
async function materialLook(options: GenerateOptions, target: Target, guid: string | null, ownTexture: string, warnings: string[]): Promise<MaterialLook | null> {
  if (guid === null) return null;
  const doc = target.index.jsonAssets.get(guid) as JsonObject | undefined;
  if (!doc) { warnings.push(`material ${guid} not found: the impostor uses a plain colour`); return null; }
  const textureId = typeof doc.baseColorTexture === "string" ? doc.baseColorTexture : null;
  let texture: MaterialLook["texture"] = null;
  if (textureId === ownTexture) {
    texture = "leafAtlas";
  } else if (textureId) {
    const entry = target.index.entries.get(textureId);
    const meta = entry?.meta ? await readOrNull(labelPath(options, target, fileLabel(entry.root, entry.meta))) : null;
    const recipeId = meta ? (JSON.parse(new TextDecoder().decode(meta)) as { generated?: { recipe?: string; generator?: string } }).generated : undefined;
    const recipe = recipeId?.generator === "surfaceTexture" && recipeId.recipe ? target.index.jsonAssets.get(recipeId.recipe) as JsonObject | undefined : undefined;
    if (recipe && textureId === outputId(recipeId!.recipe!, "surface/basecolor")) {
      const baked = bakeSurfaceRecipe(recipe);
      texture = { width: baked.size, height: baked.size, rgba: baked.baseColor };
    } else {
      const bytes = entry ? await readOrNull(labelPath(options, target, fileLabel(entry.root, entry.path))) : null;
      const decoded = bytes ? decodePng(bytes) : null;
      if (decoded) texture = decoded;
      else warnings.push(`texture ${textureId} of material ${guid} is not a generated surface texture or a readable PNG: the impostor uses its colour`);
    }
  }
  const tiling = Array.isArray(doc.uvTiling) ? doc.uvTiling as [number, number] : [1, 1] as const;
  return {
    color: srgbTriple(typeof doc.baseColor === "string" ? doc.baseColor : "#ffffff"),
    texture, tiling: [tiling[0], tiling[1]], flipY: doc.flipY !== false,
    alphaTest: doc.alphaMode === "mask" && typeof doc.alphaTest === "number" ? doc.alphaTest : 0,
  };
}

async function readOrNull(path: string): Promise<Uint8Array | null> {
  try { return new Uint8Array(await readFile(path)); } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

export async function generateFromRecipe(options: GenerateOptions): Promise<GenerateResult> {
  const started = performance.now();
  const target = await openTarget(options);
  const label = posix.normalize(options.recipe.replaceAll("\\", "/"));
  const entry = [...target.index.entries.values()].find((candidate) => fileLabel(candidate.root, candidate.path) === label);
  if (!entry) throw new Error(`no asset at ${label}`);
  if (!target.writableRoots.some((root) => label.startsWith(`${root}/`))) throw new Error(`${label} is not in a writable content root of the target`);
  const def = target.registry.getAssetType(entry.type);
  let doc = target.index.jsonAssets.get(entry.id) as JsonObject | undefined;
  if (!def || !isJsonAssetType(def) || !doc) throw new Error(`${label} is not a readable recipe`);
  const draft = options.editorDraft;
  if (draft) {
    const plantGenerator = entry.type === "forge.grassRecipe" ? "grass" : entry.type === "forge.treeRecipe" ? "tree" : null;
    const version = draft.document.generatorVersion;
    // An explicit Habit edit can switch the topology while retaining the recipe identity.
    const switchingTopology = (version === 5) !== (doc.generatorVersion === 5)
      && (version === 5 ? draft.document.habit === "shrub" : draft.document.habit === "broadleaf" || draft.document.habit === "conifer");
    if (!plantGenerator || draft.document.id !== entry.id || (plantGenerator === "tree" && version !== doc.generatorVersion && !switchingTopology))
      throw new Error("Unsupported plant recipe identity or generator version.");
    const checked = normalizeJsonAsset(def, draft.document, { strict: true });
    if (!checked.ok || !checked.value) throw new Error(checked.issues.map(issue => `${issue.path} ${issue.message}`).join("\n"));
    doc = checked.value as JsonObject;
    const saved = await readFile(join(target.root, label));
    const revision = fileRevision(saved);
    if (revision !== draft.base) throw new RecipeSaveConflict([{ path: label, base: draft.base, current: revision }]);
    const materials = doc.materials as JsonObject | undefined;
    for (const guid of [materials?.wood, materials?.leaf]) {
      if (typeof guid === "string" && target.index.entries.get(guid)?.type !== "forge.material") throw new Error(`Missing tree material ${guid}`);
    }
    // A directly placed family can name a prototype by index. Generated foliage types are updated in this transaction.
    const familyId = outputId(entry.id, `${plantGenerator}/family`);
    const family = target.index.jsonAssets.get(familyId) as JsonObject | undefined;
    const published = (family?.prototypes as JsonObject[] | undefined) ?? [];
    const types = new Set(published.map(p => outputId(entry.id, `${plantGenerator}/${p.seed}/foliageType`)));
    const seeds = [...new Set(doc.variants as number[])];
    if (published.some((prototype, i) => prototype.seed !== seeds[i]) && target.index.referrersOf(familyId).some(ref => !types.has(ref.from))) {
      throw new Error("An asset uses this family by prototype index. Keep the published seed order or generate a new recipe.");
    }
  }
  const suffix = def.json.suffix;
  const dir = posix.dirname(label), stem = posix.basename(label).slice(0, -suffix.length);
  const folder = `${dir}/${stem}`;
  const bases = new Map<string, string>();
  if (draft) {
    for (const asset of target.index.entries.values()) {
      const path = fileLabel(asset.root, asset.path);
      if (!path.startsWith(`${folder}/`)) continue;
      for (const file of asset.meta ? [path, fileLabel(asset.root, asset.meta)] : [path]) {
        const bytes = await readOrNull(join(target.root, file));
        if (bytes) bases.set(file, fileRevision(bytes));
      }
    }
  }
  const stats: string[] = [], warnings: string[] = [];
  let generator: GeneratorName;
  let outputs: Output[];
  if (entry.type === "forge.rockRecipe") {
    generator = "rock";
    outputs = rockOutputs(entry.id, doc, folder, stem, stats, warnings);
  } else if (entry.type === "forge.treeRecipe") {
    generator = "tree";
    const own = outputId(entry.id, "tree/leafTexture");
    const materials = (doc.materials ?? {}) as { wood?: string | null; leaf?: string | null };
    const looks = {
      wood: await materialLook(options, target, materials.wood ?? null, own, warnings),
      leaf: defaultTreeLeafMaterial(entry.id, doc.generatorVersion, materials.leaf) ? null
        : await materialLook(options, target, materials.leaf ?? null, own, warnings),
    };
    outputs = await treeOutputs(entry.id, doc, folder, stem, stats, looks);
  } else if (entry.type === "forge.grassRecipe") {
    generator = "grass";
    outputs = grassOutputs(entry.id, doc as GrassRecipeData, folder, stem, stats);
  } else if (entry.type === "forge.surfaceTextureRecipe") {
    generator = "surfaceTexture";
    outputs = await surfaceTextureOutputs(entry.id, doc, folder, stem, stats);
  } else {
    throw new Error(`${label}: ${entry.type} is not a recipe type with a generator`);
  }

  /** A JSON output (no meta) of a seed the recipe no longer lists: its GUID is the derived one. */
  const ownsDocument = (path: string, id: string): boolean => {
    if (generator === "tree" && path === `${folder}/${stem}_leaf.material.json` && id === outputId(entry.id, "tree/leafMaterial")) return true;
    const prefix = `${folder}/${stem}_`, suffix = ".foliagetype.json";
    const middle = path.startsWith(prefix) && path.endsWith(suffix) ? path.slice(prefix.length, -suffix.length) : "";
    const seed = /^\d+$/.test(middle) ? middle : undefined;
    return generator !== "surfaceTexture" && seed !== undefined && id === outputId(entry.id, `${generator}/${Number(seed)}/foliageType`);
  };

  // The save writes documents canonically (every field, schema order): compare and write that text.
  outputs = outputs.map((output) => (output.text === undefined ? output : { ...output, text: canonicalText(target.registry, output.path, output.text) }));

  // Ownership: assets whose meta names this recipe, and the JSON outputs by their derived GUID.
  const planned = new Map(outputs.map((output) => [output.path, output]));
  const plannedIds = new Set(outputs.map((output) => output.id));
  const owned = new Map<string, string>();
  for (const candidate of target.index.entries.values()) {
    const path = fileLabel(candidate.root, candidate.path);
    const meta = target.index.metas.get(candidate.id);
    if (meta?.generated?.recipe === entry.id || (candidate.storage === "document" && (plannedIds.has(candidate.id) || ownsDocument(path, candidate.id)))) {
      owned.set(path, candidate.id);
      if (candidate.meta) owned.set(fileLabel(candidate.root, candidate.meta), candidate.id);
    }
  }
  for (const candidate of target.index.entries.values()) {
    const path = fileLabel(candidate.root, candidate.path);
    const output = planned.get(path);
    if (output && !owned.has(path)) throw new Error(`${path} exists and was not written by ${label}; move it away first`);
    if (plannedIds.has(candidate.id) && !planned.has(path) && !owned.has(path)) throw new Error(`${path} already has the GUID ${candidate.id} of an output`);
  }
  if (owned.size > 0 && !options.force && !options.dryRun) {
    throw new Error(`${folder} already has this recipe's output; regenerate with --force`);
  }

  const files: GeneratedFileReport[] = [];
  const writes: SaveWrite[] = draft ? [{ path: label, base: draft.base, text: stringifyDocument(doc) }] : [];
  const staging = options.dryRun ? null : await mkdtemp(join(target.root, ".forge-staging-generate-"));
  let publication: GenerateResult["publication"];
  try {
    let staged = 0;
    for (const output of outputs) {
      const current = await readOrNull(join(target.root, output.path));
      if (draft && current && !owned.has(output.path)) throw new Error(`Cannot replace unowned output ${output.path}`);
      const base = current === null ? null : fileRevision(current);
      if (draft && base !== (bases.get(output.path) ?? null)) throw new Error(`Output changed during generation: ${output.path}`);
      const next = output.bytes ?? new TextEncoder().encode(output.text!);
      const same = current !== null && current.length === next.length && current.every((byte, i) => byte === next[i]);
      files.push({ path: output.path, status: current === null ? "new" : same ? "unchanged" : "changed" });
      if (same || !staging) continue;
      if (output.bytes) {
        const file = join(staging, `${(staged += 1)}.bin`);
        await writeFile(file, output.bytes);
        writes.push({ path: output.path, base, staged: file });
      } else {
        writes.push({ path: output.path, base, text: output.text! });
      }
    }
    const removed = [...owned.keys()].filter((path) => !planned.has(path)).sort();
    if (draft) for (const path of removed) {
      if (!path.startsWith(`${folder}/`)) throw new Error(`Generated asset moved outside the family folder: ${path}`);
      if (target.index.referrersOf(owned.get(path)!).some(ref => !owned.has(ref.file))) {
        throw new Error(`${path} is still referenced outside the generated family.`);
      }
    }
    if (staging && (writes.length > 0 || removed.length > 0)) {
      const deletes: SaveDelete[] = [];
      for (const path of removed) {
        const bytes = await readOrNull(join(target.root, path));
        if (bytes) deletes.push({ path, base: draft ? (bases.get(path) ?? "") : fileRevision(bytes) });
      }
      const service = createSaveService({
        policy: createWritePolicy(target.root, target.writableRoots),
        check: createDocumentCheck(target.registry, createClassStore(target.root, target.registry, target.index)),
      });
      const result = await service.commit({ writes, deletes });
      if (result.status === "conflict") throw new RecipeSaveConflict(result.conflicts);
      if (result.status === "rejected") {
        throw new Error(`the save refused it (${result.reason}): ${result.issues.map((issue) => `${issue.file} ${issue.path} ${issue.message}`.trim()).join("; ")}`);
      }
      if (draft) publication = result;
    }
    return {
      recipe: label, generator, generatorVersion: generator === "tree" ? treeOutputVersion(doc.generatorVersion) : GENERATOR_VERSIONS[generator],
      files, removed, stats, warnings, milliseconds: Math.round(performance.now() - started), ...(publication ? { publication } : {}),
    };
  } finally {
    if (staging) await rm(staging, { recursive: true, force: true });
  }
}
