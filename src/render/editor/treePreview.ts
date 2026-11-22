import {
  AmbientLight, BufferAttribute, BufferGeometry, Color, DataTexture, DirectionalLight, DoubleSide, FrontSide, GridHelper, Group,
  LinearMipmapLinearFilter, Mesh, MeshStandardNodeMaterial, PerspectiveCamera, Scene, SRGBColorSpace,
  type Material, type Texture,
} from "three/webgpu";
import { normalizeJsonAsset, type AssetPreviewController, type JsonObject } from "../../core/index.ts";
import { generatedOutputId } from "../../engine/procgen/recipeOutput.ts";
import { defaultTreeLeafMaterial } from "../../engine/procgen/tree/treeRecipe.ts";
import type { ProcMesh } from "../../engine/procgen/mesh.ts";
import { createSurfaceMaterial, surfaceTextureSlots, type SurfaceMaterialData } from "../materials/surfaceMaterial.ts";
import type { AssetPreviewContext } from "./assetPreview.ts";
import { createAssetPreviewControls } from "./assetPreviewControls.ts";
import type { TreePreviewReply, TreePreviewRequest } from "./treePreview.worker.ts";

function geometry(mesh: ProcMesh & { uvs?: Float32Array }) {
  const geo = new BufferGeometry();
  geo.setAttribute("position", new BufferAttribute(mesh.positions, 3));
  geo.setAttribute("normal", new BufferAttribute(mesh.normals, 3));
  if (mesh.uvs) geo.setAttribute("uv", new BufferAttribute(mesh.uvs, 2));
  if (mesh.colors) geo.setAttribute("color", new BufferAttribute(mesh.colors, 4));
  geo.setIndex(new BufferAttribute(mesh.indices, 1));
  return geo;
}

export function createTreePreview(ctx: AssetPreviewContext, grass = false): AssetPreviewController {
  const doc = ctx.container.ownerDocument;
  const panel = doc.createElement("div"), surface = doc.createElement("div"), bar = doc.createElement("div");
  const stats = doc.createElement("output");
  panel.className = "tree-preview"; surface.className = "tree-preview-surface"; bar.className = "tree-preview-bar";
  const select = (name: string) => {
    const label = doc.createElement("label"), input = doc.createElement("select");
    label.append(name, input); bar.append(label); return input;
  };
  const variants = select("Seed"), levels = select("LOD");
  const woodOnly = doc.createElement("input"), woodLabel = doc.createElement("label");
  woodOnly.type = "checkbox"; woodLabel.append(woodOnly, "Wood only");
  if (!grass) bar.append(woodLabel);
  stats.dataset.testid = grass ? "grass-preview-stats" : "tree-preview-stats";
  bar.append(stats); panel.append(surface, bar); ctx.container.append(panel);
  const scene = new Scene(), subject = new Group(), camera = new PerspectiveCamera(35, 1, 0.01, 1000);
  scene.background = new Color(0x272d33);
  const key = new DirectionalLight(0xfff3dc, 2.6); key.position.set(4, 7, 3);
  const grid = new GridHelper(24, 24, 0x515960, 0x354048);
  scene.add(subject, grid, new AmbientLight(0xe3edff, 1.3), key);
  const controls = createAssetPreviewControls(surface, camera, { uvw: () => null, edit() {} });
  let framed = false, ready = false;
  const release = ctx.host.preview(surface, (renderer, width, height) => {
    camera.aspect = width / height; camera.updateProjectionMatrix();
    renderer.render(scene, camera);
    if (ready) ctx.container.dataset.previewReady = "1";
  });
  ctx.host.setCamera(camera);
  let recipe: JsonObject, ticket = 0, disposed = false;
  let worker: Worker | null = null, working = false, startTimer = 0, fullTimer = 0;
  let current: {
    lods: readonly { body: ProcMesh; leaves?: ProcMesh | null; label: string }[];
    body: Material; leaf?: Material; fallbackSides?: boolean[]; dispose(): void;
  } | null = null;
  const clearMeshes = () => {
    for (const child of subject.children) if (child instanceof Mesh) child.geometry.dispose();
    subject.clear();
  };
  let quality = "";
  const showLod = () => {
    if (!current) return;
    const index = Number(levels.value), mesh = current.lods[index];
    if (!mesh) return;
    clearMeshes();
    subject.add(new Mesh(geometry(mesh.body), current.body));
    if (mesh.leaves && current.leaf) {
      if (current.fallbackSides) {
        const side = current.fallbackSides[index] ? DoubleSide : FrontSide;
        if (current.leaf.side !== side) { current.leaf.side = side; current.leaf.needsUpdate = true; }
      }
      const leaves = new Mesh(geometry(mesh.leaves), current.leaf);
      leaves.name = "leaves"; leaves.visible = !woodOnly.checked; subject.add(leaves);
    }
    if (!framed) { controls.frame(subject); framed = true; }
    stats.value = mesh.label + quality;
  };
  const display = (next: NonNullable<typeof current>, draft: boolean) => {
    const selected = levels.value;
    levels.replaceChildren(...next.lods.map((_, i) => new Option(String(i), String(i))));
    levels.value = selected && Number(selected) < next.lods.length ? selected : "0";
    current?.dispose(); current = next;
    quality = draft ? " · draft atlas" : "";
    showLod(); ready = !draft;
  };
  const accept = async (reply: TreePreviewReply, draft: boolean) => {
    if (disposed || reply.ticket !== ticket) return;
    if ("error" in reply) { stats.value = reply.error; return; }
    if ("grass" in reply) {
      const { lods, bladeCount, milliseconds } = reply.grass;
      const body = new MeshStandardNodeMaterial({ vertexColors: true, side: DoubleSide, roughness: 0.88 });
      display({ body, dispose: () => body.dispose(), lods: lods.map((mesh, index) => ({
        body: mesh,
        label: `${mesh.indices.length / 3} triangles · ${index === 0 ? bladeCount : Math.min(6, bladeCount)} blades · ${milliseconds} ms CPU`,
      })) }, false);
      return;
    }
    const tree = reply.tree, ids = recipe.materials as JsonObject;
    const resources = ctx.host.resources(`tree-preview:${ctx.guid}:${ticket}:${draft}`);
    const owned: { dispose(): void }[] = [];
    const dispose = () => { owned.forEach(item => item.dispose()); resources.releaseAll(); };
    try {
      const wood = typeof ids.wood === "string" ? await resources.material(ids.wood)
        : new MeshStandardNodeMaterial({ color: new Color(0.35, 0.27, 0.2), roughness: 0.9 });
      if (typeof ids.wood !== "string") owned.push(wood);
      let leaf: Material;
      let fallbackSides: boolean[] | undefined;
      const generatedLeaf = defaultTreeLeafMaterial(ctx.guid, recipe.generatorVersion, ids.leaf);
      if (ctx.materialType && (generatedLeaf || typeof ids.leaf === "string")) {
        const document = generatedLeaf ?? await resources.json(String(ids.leaf));
        const checked = normalizeJsonAsset(ctx.materialType, document, { strict: true });
        if (!checked.ok || !checked.value) throw new Error("Invalid leaf material.");
        const fields = checked.value as unknown as SurfaceMaterialData;
        const slots = new Map<string, Texture>(), ownAtlas = generatedOutputId(ctx.guid, "tree/leafTexture");
        for (const { guid, slot, colorSpace } of surfaceTextureSlots(fields)) {
          if (guid !== ownAtlas) { slots.set(slot, await resources.texture(guid, colorSpace)); continue; }
          const texture = new DataTexture(tree.rgba, tree.size, tree.size);
          if (colorSpace === "srgb") texture.colorSpace = SRGBColorSpace;
          texture.generateMipmaps = true; texture.minFilter = LinearMipmapLinearFilter; texture.needsUpdate = true;
          slots.set(slot, texture); owned.push(texture);
        }
        leaf = createSurfaceMaterial(fields, slots);
      } else {
        leaf = new MeshStandardNodeMaterial({ color: new Color(0.3, 0.45, 0.16), roughness: 0.8 });
        fallbackSides = (recipe.lods as JsonObject[]).map(lod => lod.leafCards === "clustersMaterialBackfaces");
      }
      owned.push(leaf);
      if (disposed || reply.ticket !== ticket) { dispose(); return; }
      display({ body: wood, leaf, ...(fallbackSides && { fallbackSides }), dispose, lods: tree.lods.map((mesh, index) => ({
        body: mesh.wood, leaves: mesh.leaves,
        label: `${tree.triangles[index]!.toLocaleString()} triangles · ${tree.stems} stems · ${tree.clusters} leaf clusters · ${tree.milliseconds} ms CPU`,
      })) }, draft);
    } catch (error) {
      dispose();
      if (!disposed && reply.ticket === ticket) stats.value = String(error);
    }
  };
  const stop = (close = false) => {
    window.clearTimeout(startTimer); window.clearTimeout(fullTimer);
    if (working || close) { worker?.terminate(); worker = null; working = false; }
  };
  const run = (draft: boolean) => {
    const active = worker ??= new Worker(new URL("./treePreview.worker.ts", import.meta.url), { type: "module" });
    working = true;
    const request: TreePreviewRequest = { ticket: ++ticket, recipe, seed: Number(variants.value), draft };
    active.onmessage = (event: MessageEvent<TreePreviewReply>) => {
      if (worker !== active || disposed) return;
      working = false;
      void accept(event.data, draft);
      if (draft && request.ticket === ticket && !("error" in event.data)) fullTimer = window.setTimeout(() => run(false), 160);
    };
    active.onerror = (event) => {
      active.terminate();
      if (worker === active) { worker = null; working = false; }
      if (request.ticket === ticket) stats.value = event.message;
    };
    active.postMessage(request);
  };
  const schedule = (editing: boolean) => {
    stop(); ticket++; ready = false; ctx.container.dataset.previewReady = "0";
    stats.value = "Generating preview…";
    startTimer = window.setTimeout(() => run(editing && !grass), editing ? 75 : 0);
  };
  variants.onchange = () => schedule(false);
  levels.onchange = showLod;
  woodOnly.onchange = () => {
    const leaves = subject.getObjectByName("leaves");
    if (leaves) leaves.visible = !woodOnly.checked;
  };
  return {
    async update(value) {
      const initial = !recipe;
      if (!initial && (recipe.generatorVersion === 5) !== (value.generatorVersion === 5)) framed = false;
      recipe = value as JsonObject;
      const previous = variants.selectedIndex;
      const seeds = [...new Set(recipe.variants as number[])];
      if (!seeds.length) seeds.push(1);
      variants.replaceChildren(...seeds.map(seed => new Option(String(seed), String(seed))));
      variants.selectedIndex = Math.max(0, Math.min(previous, seeds.length - 1));
      schedule(!initial);
    },
    focus: () => controls.frame(subject), setTool() {}, info: () => ({ slots: [], meshes: [] }),
    dispose() {
      disposed = true; ticket++; stop(true); clearMeshes(); current?.dispose(); controls.dispose();
      grid.dispose(); release(); scene.clear(); panel.remove();
    },
  };
}
