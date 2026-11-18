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
import { engineContentRoots } from "../assets/engineContent.ts";
import { loadEngineRegistry } from "../assets/engineRegistry.ts";
import { fileRevision } from "../assets/revision.ts";
import { scanRoots } from "../assets/scan.ts";
import { createClassStore, createDocumentCheck } from "../save/documentCheck.ts";
import { createSaveService, type SaveDelete, type SaveWrite } from "../save/transaction.ts";
import { createWritePolicy } from "../server/projectPaths.ts";
import { openWorldProject } from "../world/worldProject.ts";
import { binaryWithMeta, GENERATED_MODEL_OPTIMIZE, GENERATOR_VERSIONS, outputId, round, srgbTriple, type GeneratorName, type Output } from "./outputs.ts";
import { encodeRgbaPng } from "./png.ts";
import { treeOutputs } from "./treeOutputs.ts";

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
}

export interface GeneratedFileReport { readonly path: string; readonly status: "new" | "changed" | "unchanged" }

export interface GenerateResult {
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
    const roots = [...engineContentRoots(options.engineRoot, []), { label: folder, dir: join(options.engineRoot, folder) }];
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

function surfaceTextureOutputs(recipeId: string, data: JsonObject, folder: string, stem: string, stats: string[]): Output[] {
  const outputs: Output[] = [];
  const generated = { recipe: recipeId, generator: "surfaceTexture", generatorVersion: GENERATOR_VERSIONS.surfaceTexture };
  const started = performance.now();
  const baked = bakeSurfaceTexture({
    seed: data.seed,
    size: Number(data.size),
    layers: data.layers,
    colorRamp: ((data.colorRamp as JsonObject[] | undefined) ?? []).map((stop) => ({ at: stop.at, color: srgbTriple(String(stop.color)) })),
    normalStrength: data.normalStrength,
    roughness: data.roughness,
    aoStrength: data.aoStrength,
    metalness: data.metalness,
  });
  const bakeMs = performance.now() - started;
  for (const [slot, pixels] of [["basecolor", baked.baseColor], ["normal", baked.normal], ["orm", baked.orm]] as const) {
    const bytes = encodeRgbaPng(baked.size, baked.size, pixels);
    const name = `${stem}_${slot}.png`;
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
  const doc = target.index.jsonAssets.get(entry.id) as JsonObject | undefined;
  if (!def || !isJsonAssetType(def) || !doc) throw new Error(`${label} is not a readable recipe`);
  const suffix = def.json.suffix;
  const dir = posix.dirname(label), stem = posix.basename(label).slice(0, -suffix.length);
  const folder = `${dir}/${stem}`;
  const stats: string[] = [], warnings: string[] = [];
  let generator: GeneratorName;
  let outputs: Output[];
  if (entry.type === "forge.rockRecipe") {
    generator = "rock";
    outputs = rockOutputs(entry.id, doc, folder, stem, stats, warnings);
  } else if (entry.type === "forge.treeRecipe") {
    generator = "tree";
    outputs = treeOutputs(entry.id, doc, folder, stem, stats);
  } else if (entry.type === "forge.surfaceTextureRecipe") {
    generator = "surfaceTexture";
    outputs = surfaceTextureOutputs(entry.id, doc, folder, stem, stats);
  } else {
    throw new Error(`${label}: ${entry.type} is not a recipe type with a generator`);
  }

  /** A JSON output (no meta) of a seed the recipe no longer lists: its GUID is the derived one. */
  const ownsDocument = (path: string, id: string): boolean => {
    const prefix = `${folder}/${stem}_`, suffix = ".foliagetype.json";
    const middle = path.startsWith(prefix) && path.endsWith(suffix) ? path.slice(prefix.length, -suffix.length) : "";
    const seed = /^\d+$/.test(middle) ? middle : undefined;
    return (generator === "rock" || generator === "tree") && seed !== undefined && id === outputId(entry.id, `${generator}/${Number(seed)}/foliageType`);
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
  const writes: SaveWrite[] = [];
  const staging = options.dryRun ? null : await mkdtemp(join(target.root, ".forge-staging-generate-"));
  try {
    let staged = 0;
    for (const output of outputs) {
      const current = await readOrNull(join(target.root, output.path));
      const next = output.bytes ?? new TextEncoder().encode(output.text!);
      const same = current !== null && current.length === next.length && current.every((byte, i) => byte === next[i]);
      files.push({ path: output.path, status: current === null ? "new" : same ? "unchanged" : "changed" });
      if (same || !staging) continue;
      const base = current === null ? null : fileRevision(current);
      if (output.bytes) {
        const file = join(staging, `${(staged += 1)}.bin`);
        await writeFile(file, output.bytes);
        writes.push({ path: output.path, base, staged: file });
      } else {
        writes.push({ path: output.path, base, text: output.text! });
      }
    }
    const removed = [...owned.keys()].filter((path) => !planned.has(path)).sort();
    if (staging && (writes.length > 0 || removed.length > 0)) {
      const deletes: SaveDelete[] = [];
      for (const path of removed) {
        const bytes = await readOrNull(join(target.root, path));
        if (bytes) deletes.push({ path, base: fileRevision(bytes) });
      }
      const service = createSaveService({
        policy: createWritePolicy(target.root, target.writableRoots),
        check: createDocumentCheck(target.registry, createClassStore(target.root, target.registry, target.index)),
      });
      const result = await service.commit({ writes, deletes });
      if (result.status === "conflict") throw new Error(`files changed meanwhile: ${result.conflicts.map((conflict) => conflict.path).join(", ")}`);
      if (result.status === "rejected") {
        throw new Error(`the save refused it (${result.reason}): ${result.issues.map((issue) => `${issue.file} ${issue.path} ${issue.message}`.trim()).join("; ")}`);
      }
    }
    return {
      recipe: label, generator, generatorVersion: GENERATOR_VERSIONS[generator],
      files, removed, stats, warnings, milliseconds: Math.round(performance.now() - started),
    };
  } finally {
    if (staging) await rm(staging, { recursive: true, force: true });
  }
}
