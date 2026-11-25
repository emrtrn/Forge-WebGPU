// A model recipe's live preview (vegetation plan §9, §9.1 B and E): the draft
// generated in a worker (recipePreview.worker.ts) and drawn with the draft's
// own materials, one seed and LOD at a time, the levels of one seed side by
// side (a tree's unthinned Source, its LODs and its impostor), or every seed
// beside the others. Plants answer the preview's weather through the plant
// drawing worlds use (previewEnvironment.ts), so a recipe's response profile
// is seen before it is generated. The counters are the generator's: what is
// drawn, the family's GPU memory, the worker's CPU time.

import {
  AmbientLight, Box3, BufferAttribute, BufferGeometry, Color, DataTexture, DirectionalLight, DoubleSide, FrontSide, GridHelper, Group,
  LinearFilter, LinearMipmapLinearFilter, Mesh, MeshStandardNodeMaterial, PerspectiveCamera, Scene, Sphere, SRGBColorSpace, Vector3,
  type Material, type NodeMaterial, type Texture,
} from "three/webgpu";
import { normalizeJsonAsset, type AssetPreviewController, type JsonObject } from "../../core/index.ts";
import { generatedOutputId } from "../../engine/procgen/recipeOutput.ts";
import { familyMemory, memoryText } from "../../engine/procgen/recipeMemory.ts";
import { defaultTreeLeafMaterial } from "../../engine/procgen/tree/treeRecipe.ts";
import type { TreeImpostor } from "../../engine/procgen/tree/treeImpostor.ts";
import type { PlantResponseProfile } from "../../engine/plant/plantResponse.ts";
import { createSurfaceMaterial, surfaceTextureSlots, type SurfaceMaterialData } from "../materials/surfaceMaterial.ts";
import { impostorPart } from "../plant/impostorMaterial.ts";
import type { WorldResources } from "../resources/worldResources.ts";
import type { AssetPreviewContext } from "./assetPreview.ts";
import { createAssetPreviewControls } from "./assetPreviewControls.ts";
import { createPreviewEnvironment, NEUTRAL_RESPONSE, previewControl, shadePreviewMesh } from "./previewEnvironment.ts";
import { createPreviewLabels } from "./previewLabels.ts";
import type { PreviewLod, PreviewMaterial, PreviewPart, PreviewPrototype, RecipeMeshes, RecipePreviewReply, RecipePreviewRequest } from "./recipePreview.worker.ts";

export type RecipePreviewKind = "tree" | "grass" | "rock";

function geometryOf({ mesh, uvs, wind, leaf }: PreviewPart): BufferGeometry {
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new BufferAttribute(mesh.positions, 3));
  geometry.setAttribute("normal", new BufferAttribute(mesh.normals, 3));
  if (uvs) geometry.setAttribute("uv", new BufferAttribute(uvs, 2));
  if (mesh.colors) geometry.setAttribute("color", new BufferAttribute(mesh.colors, 4));
  // The names a GLB's `_WIND` / `_LEAF` load under.
  if (wind) geometry.setAttribute("_wind", new BufferAttribute(wind, 4));
  if (leaf) geometry.setAttribute("_leaf", new BufferAttribute(leaf, 2));
  geometry.setIndex(new BufferAttribute(mesh.indices, 1));
  return geometry;
}

/** What one request drew with: materials the columns clone, and what they took. */
interface Look {
  readonly body: Material;
  readonly leaf: Material | null;
  /** No leaf material: the LODs of cards drawn from both sides say so themselves. */
  readonly leafSideByLod: boolean;
  dispose(): void;
}

interface Shown { readonly meshes: RecipeMeshes; readonly look: Look; readonly draft: boolean }

export function createRecipePreview(ctx: AssetPreviewContext, kind: RecipePreviewKind): AssetPreviewController {
  const doc = ctx.container.ownerDocument;
  const panel = doc.createElement("div"), surface = doc.createElement("div"), bar = doc.createElement("div"), weather = doc.createElement("div");
  const stats = doc.createElement("output"), memory = doc.createElement("output");
  panel.className = "tree-preview"; surface.className = "tree-preview-surface"; bar.className = "tree-preview-bar"; weather.className = "tree-preview-bar";
  const select = (name: string, hint: string) => previewControl(doc, bar, name, "select", hint);
  const option = (value: string, label: string) => new Option(label, value);
  const view = select("View", "Tek prototip, bir tohumun LOD'ları yan yana ya da bütün tohumlar.");
  view.append(option("single", "Single"), option("lods", "Side by Side"), option("seeds", "Gallery"));
  const variants = select("Seed", "Önizlenen tohum (prototip)."), levels = select("LOD", "Önizlenen LOD.");
  const woodOnly = doc.createElement("input"), woodLabel = doc.createElement("label");
  woodOnly.type = "checkbox"; woodLabel.append(woodOnly, "Wood only");
  if (kind === "tree") bar.append(woodLabel);
  stats.dataset.testid = `${kind}-preview-stats`;
  memory.dataset.testid = `${kind}-preview-memory`;
  memory.title = "Ailenin GPU belleği: sıkıştırılmış dokular (mip dahil) + bütün tohumların LOD'ları.";
  bar.append(stats, memory);
  panel.append(surface, bar);
  if (kind !== "rock") panel.append(weather);
  ctx.container.append(panel);

  const scene = new Scene(), subject = new Group(), camera = new PerspectiveCamera(35, 1, 0.01, 1000);
  scene.background = new Color(0x272d33);
  const key = new DirectionalLight(0xfff3dc, 2.6); key.position.set(4, 7, 3);
  const grid = new GridHelper(24, 24, 0x515960, 0x354048);
  scene.add(subject, grid, new AmbientLight(0xe3edff, 1.3), key);
  const controls = createAssetPreviewControls(surface, camera, { uvw: () => null, edit() {} });
  const labels = createPreviewLabels(surface);
  const environment = createPreviewEnvironment(doc, weather);
  let framed = "", ready = false;
  const release = ctx.host.preview(surface, (renderer, width, height) => {
    camera.aspect = width / height; camera.updateProjectionMatrix();
    environment.sync(1 / 60, camera);
    renderer.render(scene, camera);
    labels.place(camera, width, height);
    if (ready) ctx.container.dataset.previewReady = "1";
  });
  ctx.host.setCamera(camera);

  let recipe: JsonObject, ticket = 0, disposed = false;
  let worker: Worker | null = null, working = false, startTimer = 0, fullTimer = 0;
  let shown: Shown | null = null;
  let impostor: { readonly seed: number; readonly look: Look; readonly baked: TreeImpostor; readonly textures: readonly Texture[] } | null = null;

  const drawn: { dispose(): void }[] = [];
  const clearMeshes = () => {
    subject.clear();
    for (const item of drawn.splice(0)) item.dispose();
  };
  const dropImpostor = () => {
    for (const texture of impostor?.textures ?? []) texture.dispose();
    impostor = null;
  };
  const response = (): PlantResponseProfile => kind === "tree" ? recipe.response as unknown as PlantResponseProfile : NEUTRAL_RESPONSE;
  const sway = (height: number) => {
    const own = kind === "tree" ? recipe.sway as { amplitude: number; frequency: number } : { amplitude: Number(recipe.height) * 0.38, frequency: 0.72 };
    return { amplitude: own.amplitude, frequency: own.frequency, height: Math.max(height, 0.01), source: "vertex" as const };
  };
  /** The slots' names are the GLB's, so the family draw matches by them. */
  const familyOf = () => ({ id: "preview", wood: null, leaf: null, crown: kind === "tree" && recipe.generatorVersion === 6, response: response() });
  const shade = (material: NodeMaterial, name: string, origin: Vector3, seed: number, height: number): void => {
    if (kind === "rock") return;
    material.name = name;
    shadePreviewMesh(environment.plants.shading(familyOf(), sway(height), 0), material, origin, seed);
  };

  interface Column { readonly label: string; readonly lod: PreviewLod | null; readonly seed: number }
  const columnsOf = (state: Shown): Column[] => {
    const prototype = (seed: number): PreviewPrototype | undefined => state.meshes.prototypes.find((entry) => entry.seed === seed);
    const one = prototype(Number(variants.value)) ?? state.meshes.prototypes[0];
    if (!one) return [];
    if (view.value === "seeds") {
      return state.meshes.prototypes.map((entry) => ({ label: `Seed ${entry.seed}`, seed: entry.seed, lod: entry.lods[Math.min(Number(levels.value), entry.lods.length - 1)] ?? null }));
    }
    if (view.value === "lods") {
      const all = one.source ? [one.source, ...one.lods] : one.lods;
      return [
        ...all.map((lod) => ({ label: `${lod.name} · ${lod.triangles.toLocaleString("en-US")}`, seed: one.seed, lod })),
        ...(impostor?.seed === one.seed ? [{ label: "Impostor · 2", seed: one.seed, lod: null }] : []),
      ];
    }
    return [{ label: "", seed: one.seed, lod: one.lods[Number(levels.value)] ?? one.lods[0] ?? null }];
  };

  const meshOf = (part: PreviewPart, lod: PreviewLod, look: Look, origin: Vector3, seed: number, height: number): Mesh => {
    const isLeaf = part.role === "leaf";
    const material = (isLeaf && look.leaf ? look.leaf : look.body).clone() as NodeMaterial;
    if (isLeaf && look.leafSideByLod) material.side = lod.doubleSided ? DoubleSide : FrontSide;
    shade(material, isLeaf ? "Leaf" : part.role === "wood" ? "Wood" : "Grass", origin, seed, height);
    const geometry = geometryOf(part);
    drawn.push(geometry, material);
    const mesh = new Mesh(geometry, material);
    mesh.name = isLeaf ? "leaves" : "body";
    mesh.visible = !isLeaf || !woodOnly.checked;
    mesh.position.copy(origin);
    // The wind moves vertices past the still bounds.
    mesh.frustumCulled = false;
    return mesh;
  };

  const show = () => {
    if (!shown) return;
    clearMeshes();
    const columns = columnsOf(shown);
    const boxes = columns.map((column) => {
      const box = new Box3();
      for (const part of column.lod?.parts ?? []) box.union(new Box3().setFromArray(part.mesh.positions as unknown as number[]));
      if (!column.lod && impostor) box.setFromCenterAndSize(new Vector3(...impostor.baked.center), new Vector3().setScalar(impostor.baked.radius * 2));
      return box;
    });
    const widths = boxes.map((box) => box.isEmpty() ? 1 : box.max.x - box.min.x);
    const gap = Math.max(0.1, Math.max(0, ...widths) * 0.15);
    const total = widths.reduce((sum, width) => sum + width, 0) + gap * Math.max(0, columns.length - 1);
    let at = -total / 2;
    const places: { text: string; position: Vector3 }[] = [];
    columns.forEach((column, index) => {
      const box = boxes[index]!;
      const origin = new Vector3(columns.length > 1 ? at - box.min.x : 0, 0, 0);
      at += widths[index]! + gap;
      const height = box.isEmpty() ? 1 : box.max.y;
      if (column.lod) {
        for (const part of column.lod.parts) subject.add(meshOf(part, column.lod, shown!.look, origin, column.seed, height));
      } else if (impostor) {
        const { baked, textures } = impostor;
        const part = impostorPart({ albedo: textures[0]!, normal: textures[1]!, views: baked.views, center: new Vector3(...baked.center), radius: baked.radius }, "preview");
        const material = (part.material as Material).clone() as NodeMaterial;
        shade(material, "Impostor", origin, column.seed, height);
        drawn.push(part.geometry, part.material as Material, material);
        const mesh = new Mesh(part.geometry, material);
        mesh.position.copy(origin); mesh.frustumCulled = false;
        // The quad opens in the shader: framing needs its sphere.
        part.geometry.boundingBox = new Box3().setFromCenterAndSize(new Vector3(...baked.center), new Vector3().setScalar(baked.radius * 2));
        part.geometry.boundingSphere = new Sphere(new Vector3(...baked.center), baked.radius);
        subject.add(mesh);
      }
      if (column.label) places.push({ text: column.label, position: new Vector3(origin.x + (box.min.x + box.max.x) / 2, 0, 0) });
    });
    labels.set(places);
    const layout = `${view.value}:${columns.length}:${recipe.generatorVersion === 5}`;
    if (framed !== layout) { controls.frame(subject, columns.length > 1); framed = layout; }
    const first = shown.meshes.prototypes.find((entry) => entry.seed === columns[0]?.seed);
    const triangles = columns.reduce((sum, column) => sum + (column.lod?.triangles ?? 0), 0);
    stats.value = `${triangles.toLocaleString("en-US")} triangles · ${first?.detail ?? ""} · ${shown.meshes.milliseconds} ms CPU${shown.draft ? " · draft atlas" : ""}`;
    const settings = kind === "tree" && recipe.generatorVersion !== 5 ? recipe.impostor as { enabled: boolean; views: number; frameSize: string } : null;
    const bytes = familyMemory({
      atlasSize: shown.draft ? null : shown.meshes.atlas?.size ?? null, atlasTextures: shown.meshes.atlas?.normal ? 2 : 1,
      impostor: settings?.enabled ? { views: settings.views, frameSize: Number(settings.frameSize) } : null,
      prototypes: new Set(recipe.variants as number[]).size || 1, meshBytes: first?.bytes ?? 0,
    });
    memory.value = shown.draft ? "" : `GPU ≈ ${memoryText(bytes.total)} (textures ${memoryText(bytes.atlas + bytes.impostors)})`;
  };

  const materialDocument = (resources: WorldResources, guid: unknown): Promise<JsonObject | null> =>
    typeof guid === "string" ? resources.json(guid).then((raw) => raw as JsonObject) : Promise.resolve(null);

  /** The draft's materials; the leaf one reads this draft's atlas where the saved one would read the published. */
  const lookOf = async (meshes: RecipeMeshes, name: string): Promise<Look> => {
    const resources = ctx.host.resources(name);
    const owned: { dispose(): void }[] = [];
    const dispose = () => { for (const item of owned) item.dispose(); resources.releaseAll(); };
    const own = <M extends Material>(material: M): M => { owned.push(material); return material; };
    try {
      if (kind === "grass") return { body: own(new MeshStandardNodeMaterial({ vertexColors: true, side: DoubleSide, roughness: 0.88 })), leaf: null, leafSideByLod: false, dispose };
      if (kind === "rock") {
        const body = typeof recipe.material === "string" ? await resources.material(recipe.material) : own(new MeshStandardNodeMaterial({ color: new Color(0.5, 0.5, 0.5), roughness: 0.9 }));
        return { body, leaf: null, leafSideByLod: false, dispose };
      }
      const ids = recipe.materials as JsonObject;
      const body = typeof ids.wood === "string" ? await resources.material(ids.wood) : own(new MeshStandardNodeMaterial({ color: new Color(0.35, 0.27, 0.2), roughness: 0.9 }));
      const generated = defaultTreeLeafMaterial(ctx.guid, recipe.generatorVersion, ids.leaf);
      if (!ctx.materialType || (!generated && typeof ids.leaf !== "string")) {
        return { body, leaf: own(new MeshStandardNodeMaterial({ color: new Color(0.3, 0.45, 0.16), roughness: 0.8 })), leafSideByLod: true, dispose };
      }
      const checked = normalizeJsonAsset(ctx.materialType, generated ?? await resources.json(String(ids.leaf)), { strict: true });
      if (!checked.ok || !checked.value) throw new Error("Invalid leaf material.");
      const fields = checked.value as unknown as SurfaceMaterialData;
      const slots = new Map<string, Texture>(), ownAtlas = generatedOutputId(ctx.guid, "tree/leafTexture"), ownNormal = generatedOutputId(ctx.guid, "tree/leafNormal");
      for (const { guid, slot, colorSpace } of surfaceTextureSlots(fields)) {
        const pixels = guid === ownAtlas ? meshes.atlas!.rgba : guid === ownNormal ? meshes.atlas!.normal : undefined;
        if (!pixels) { slots.set(slot, await resources.texture(guid, colorSpace)); continue; }
        const texture = new DataTexture(pixels, meshes.atlas!.size, meshes.atlas!.size);
        if (colorSpace === "srgb") texture.colorSpace = SRGBColorSpace;
        texture.generateMipmaps = true; texture.minFilter = LinearMipmapLinearFilter; texture.needsUpdate = true;
        slots.set(slot, texture); owned.push(texture);
      }
      return { body, leaf: own(createSurfaceMaterial(fields, slots)), leafSideByLod: false, dispose };
    } catch (error) {
      dispose();
      throw error;
    }
  };

  const wantsImpostor = () => kind === "tree" && view.value === "lods" && recipe.generatorVersion !== 5 && (recipe.impostor as { enabled: boolean }).enabled;

  /** The materials the impostor bake reads, with their generated textures' recipes. */
  const previewMaterial = async (resources: WorldResources, guid: unknown): Promise<PreviewMaterial | null> => {
    const document = await materialDocument(resources, guid);
    if (!document) return null;
    for (const recipeId of ctx.assetsOf?.("forge.surfaceTextureRecipe") ?? []) {
      if (document.baseColorTexture === generatedOutputId(recipeId, "surface/basecolor")) return { document, surface: await resources.json(recipeId) as JsonObject };
    }
    return { document, surface: null };
  };

  const requestImpostor = async () => {
    const current = ++ticket, seed = Number(variants.value);
    stats.value += " · baking impostor…";
    const resources = ctx.host.resources(`recipe-preview-looks:${ctx.guid}:${current}`);
    try {
      const ids = recipe.materials as JsonObject;
      const leaf = defaultTreeLeafMaterial(ctx.guid, recipe.generatorVersion, ids.leaf) ? null : await previewMaterial(resources, ids.leaf);
      const wood = await previewMaterial(resources, ids.wood);
      if (disposed || current !== ticket) return;
      post({ kind: "impostor", ticket: current, recipe, seed, wood, leaf });
    } catch (error) {
      if (!disposed && current === ticket) stats.value = String(error);
    } finally { resources.releaseAll(); }
  };

  const acceptMeshes = async (reply: Extract<RecipePreviewReply, { kind: "meshes" }>, draft: boolean) => {
    const { meshes } = reply;
    let look: Look;
    try { look = await lookOf(meshes, `recipe-preview:${ctx.guid}:${reply.ticket}:${draft}`); } catch (error) {
      if (!disposed && reply.ticket === ticket) stats.value = String(error);
      return;
    }
    if (disposed || reply.ticket !== ticket) { look.dispose(); return; }
    clearMeshes();
    dropImpostor();
    shown?.look.dispose();
    shown = { meshes, look, draft };
    const lods = meshes.prototypes[0]?.lods.length ?? 0, selected = levels.value;
    levels.replaceChildren(...Array.from({ length: lods }, (_, index) => option(String(index), String(index))));
    levels.value = selected && Number(selected) < lods ? selected : "0";
    show();
    if (draft) { fullTimer = window.setTimeout(() => run(false), 160); return; }
    if (wantsImpostor()) void requestImpostor(); else ready = true;
  };

  const acceptImpostor = ({ impostor: baked, milliseconds }: Extract<RecipePreviewReply, { kind: "impostor" }>) => {
    if (!shown) return;
    dropImpostor();
    const textures = (["albedo", "normal"] as const).map((slot) => {
      const texture = new DataTexture(baked[slot], baked.width, baked.height);
      if (slot === "albedo") texture.colorSpace = SRGBColorSpace;
      texture.generateMipmaps = true; texture.magFilter = LinearFilter; texture.minFilter = LinearMipmapLinearFilter; texture.needsUpdate = true;
      return texture;
    });
    impostor = { seed: Number(variants.value), look: shown.look, baked, textures };
    show();
    stats.value += ` · impostor ${milliseconds} ms`;
    ready = true;
  };

  const accept = (reply: RecipePreviewReply, draft: boolean) => {
    if (disposed || reply.ticket !== ticket) return;
    if (reply.kind === "error") { stats.value = reply.error; return; }
    if (reply.kind === "impostor") acceptImpostor(reply); else void acceptMeshes(reply, draft);
  };

  const post = (request: RecipePreviewRequest, draft = false) => {
    const active = worker ??= new Worker(new URL("./recipePreview.worker.ts", import.meta.url), { type: "module" });
    working = true;
    active.onmessage = (event: MessageEvent<RecipePreviewReply>) => {
      if (worker !== active || disposed) return;
      working = false;
      accept(event.data, draft);
    };
    active.onerror = (event) => {
      active.terminate();
      if (worker === active) { worker = null; working = false; }
      if (request.ticket === ticket) stats.value = event.message;
    };
    active.postMessage(request);
  };
  const stop = (close = false) => {
    window.clearTimeout(startTimer); window.clearTimeout(fullTimer);
    if (working || close) { worker?.terminate(); worker = null; working = false; }
  };
  const seedsOf = (): number[] => { const seeds = [...new Set(recipe.variants as number[])]; return seeds.length > 0 ? seeds : [1]; };
  const run = (draft: boolean) => post({
    kind: "meshes", ticket: ++ticket, recipe, draft,
    seeds: view.value === "seeds" ? seedsOf() : [Number(variants.value)], source: view.value === "lods" && !draft,
  }, draft);
  const schedule = (editing: boolean) => {
    stop(); ticket++; ready = false; ctx.container.dataset.previewReady = "0";
    stats.value = "Generating preview…";
    startTimer = window.setTimeout(() => run(editing && kind === "tree"), editing ? 75 : 0);
  };
  variants.onchange = () => schedule(false);
  view.onchange = () => {
    levels.disabled = view.value === "lods";
    variants.disabled = view.value === "seeds";
    schedule(false);
  };
  levels.onchange = show;
  woodOnly.onchange = () => { for (const child of subject.children) if (child.name === "leaves") child.visible = !woodOnly.checked; };

  return {
    async update(value) {
      const initial = !recipe;
      const previous = recipe;
      recipe = value as JsonObject;
      const seeds = seedsOf(), at = variants.selectedIndex;
      variants.replaceChildren(...seeds.map((seed) => option(String(seed), String(seed))));
      variants.selectedIndex = Math.max(0, Math.min(at, seeds.length - 1));
      // A response or sway edit changes no geometry: the same meshes, shaded again.
      const shape = (entry: JsonObject) => JSON.stringify({ ...entry, response: null, sway: null, collision: null });
      if (!initial && shown && ready && shape(previous) === shape(recipe)) {
        environment.plants.setResponse("preview", response());
        if (JSON.stringify(previous.sway) !== JSON.stringify(recipe.sway)) show();
        return;
      }
      schedule(!initial);
    },
    focus: () => controls.frame(subject, view.value !== "single"), setTool() {}, info: () => ({ slots: [], meshes: [] }),
    dispose() {
      disposed = true; ticket++; stop(true); clearMeshes(); dropImpostor(); shown?.look.dispose(); controls.dispose(); labels.dispose();
      grid.dispose(); release(); scene.clear(); panel.remove();
    },
  };
}
