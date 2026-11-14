// Shared asset preview: private geometry/material drafts on the level's GPU.
// Runtime class-world construction is injected by the editor (layer boundary).
import { AmbientLight, Box3, BufferAttribute, Color, DirectionalLight, Group, Mesh, NoToneMapping, PerspectiveCamera, Scene, SphereGeometry, SRGBColorSpace, type Material, type Object3D, type Texture } from "three/webgpu";
import { isJsonObject, normalizeJsonAsset, type AssetPreviewController, type AssetPreviewInfo, type JsonAssetTypeDef } from "../../core/index.ts";
import type { RenderHost } from "../host/renderHost.ts";
import { createSurfaceMaterial, surfaceTextureSlots, type SurfaceMaterialData } from "../materials/surfaceMaterial.ts";
import type { AssetUrls } from "../resources/assetUrls.ts";
import { createGltfModelSource, uvwOf } from "../resources/gltfModels.ts";
import { applyModelVertexColors, applyUvwMapping, modelPrimitives, type ModelVertexColors } from "../resources/modelSetup.ts";
import { assignSlotMaterials } from "../resources/modelSlots.ts";
import { resourceKey } from "../resources/resourceCache.ts";
import type { ModelTemplate } from "../resources/worldResources.ts";
import { createAssetPreviewControls } from "./assetPreviewControls.ts";

export interface PreviewClassWorld { readonly scene: Object3D; frame(dt: number): void; dispose(): void }
export interface AssetPreviewContext {
  readonly host: RenderHost;
  readonly container: HTMLElement;
  readonly guid: string;
  readonly urls: AssetUrls;
  readonly materialType: JsonAssetTypeDef | null;
  readonly readOnly: boolean;
  readonly classWorld?: (document: Readonly<Record<string, unknown>>) => PreviewClassWorld;
  edit(path: readonly (string | number)[], value: unknown, phase: "input" | "commit"): void;
  status(message: string): void;
}
export interface AssetPreviewRegistration {
  readonly key: string;
  create(context: AssetPreviewContext): AssetPreviewController;
}

export function createAssetPreview(ctx: AssetPreviewContext, kind: "material" | "model" | "class"): AssetPreviewController {
  const scene = new Scene(), subject = new Group(), camera = new PerspectiveCamera(35, 1, 0.001, 10000);
  scene.background = new Color(0x191b1f);
  const sun = new DirectionalLight(0xffffff, 2.4); sun.position.set(3, 5, 4);
  scene.add(new AmbientLight(0xffffff, 1.4), sun, subject);
  const resources = ctx.host.resources(`asset-preview:${ctx.guid}`);
  let doc: Readonly<Record<string, unknown>> = {};
  const controls = createAssetPreviewControls(ctx.container, camera, {
    uvw: () => kind === "model" ? uvwOf(doc.import) : null,
    edit: (uvw, phase) => { if (!ctx.readOnly) ctx.edit(["import", "uvw"], uvw, phase); },
  });
  let world: PreviewClassWorld | null = null, disposed = false, generation = 0, framed = false, loaded = false, settledFrames = 0;
  let info: AssetPreviewInfo = { slots: [], meshes: [] };
  let privateGeometries: { dispose(): void }[] = [], privateMaterials: Material[] = [], held: string[] = [];
  const clear = () => {
    subject.clear();
    world?.dispose(); world = null;
    for (const geometry of privateGeometries) geometry.dispose();
    for (const material of privateMaterials) material.dispose();
    for (const key of held) resources.release(key);
    privateGeometries = []; privateMaterials = []; held = [];
  };
  const release = ctx.host.preview(ctx.container, (renderer, width, height) => {
    camera.aspect = width / height; camera.updateProjectionMatrix();
    world?.frame(1 / 60);
    // Instanced class geometry receives its matrices in renderSync, after
    // its async loads settle. Frame the real subject, not the empty rig.
    const bounds = new Box3().setFromObject(subject);
    if (kind === "class" && !framed && !bounds.isEmpty() && bounds.min.distanceToSquared(bounds.max) > 1e-10) { controls.frame(subject); framed = true; }
    const toneMapping = renderer.toneMapping, exposure = renderer.toneMappingExposure, colorSpace = renderer.outputColorSpace;
    try {
      renderer.toneMapping = NoToneMapping; renderer.toneMappingExposure = 1; renderer.outputColorSpace = SRGBColorSpace;
      renderer.render(scene, camera);
      controls.draw(renderer, width, height);
      if (loaded && ctx.host.cache.stats().pending === 0) settledFrames++;
      else settledFrames = 0;
      if (settledFrames >= 2) ctx.container.dataset.previewReady = "1";
    } finally { renderer.toneMapping = toneMapping; renderer.toneMappingExposure = exposure; renderer.outputColorSpace = colorSpace; }
  });
  ctx.host.setCamera(camera);
  // Load a private raw model: draft UVW never compounds on saved UVW or
  // mutates geometry used by placements. The decoder still uses the same GPU.
  const source = kind === "model" ? createGltfModelSource(ctx.host.renderer, { ...ctx.urls, importSettings: () => null }) : null;
  let raw: Promise<ModelTemplate> | null = null;
  const rawTextures = new Set<Texture>();
  const rawModel = () => raw ??= source!.load(ctx.guid).then((model) => {
    model.scene.traverse((object) => {
      if (!(object instanceof Mesh)) return;
      for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
        for (const value of Object.values(material)) if (value && typeof value === "object" && (value as Texture).isTexture) rawTextures.add(value as Texture);
      }
    });
    return model;
  });
  return {
    async update(next) {
      doc = next;
      const ticket = ++generation;
      loaded = false; settledFrames = 0; ctx.container.dataset.previewReady = "0";
      const geometries: { dispose(): void }[] = [], materials: Material[] = [], keys: string[] = [];
      const abandon = () => { for (const value of geometries) value.dispose(); for (const material of materials) material.dispose(); for (const key of keys) resources.release(key); };
      try {
        let object: Object3D;
        if (kind === "material") {
          if (!ctx.materialType) throw new Error("No material schema is installed.");
          const checked = normalizeJsonAsset(ctx.materialType, next, { strict: true });
          if (!checked.ok || !checked.value) throw new Error("The material draft cannot be previewed.");
          const fields = checked.value as unknown as SurfaceMaterialData;
          const textures = new Map<string, Texture>();
          await Promise.all(surfaceTextureSlots(fields).map(async ({ slot, guid, colorSpace }) => {
            const key = resourceKey.texture(guid, colorSpace); keys.push(key);
            textures.set(slot, await resources.texture(guid, colorSpace));
          }));
          const material = createSurfaceMaterial(fields, textures); materials.push(material);
          const geometry = new SphereGeometry(1, 48, 32); geometries.push(geometry);
          const positions = geometry.getAttribute("position"), colors = new Float32Array(positions.count * 4);
          for (let i = 0; i < positions.count; i++) { const t = (positions.getY(i) + 1) / 2; colors.set([t, 1 - t, 0.5, t], i * 4); }
          geometry.setAttribute("color", new BufferAttribute(colors, 4));
          object = new Mesh(geometry, material);
        } else if (kind === "model") {
          const template = await rawModel();
          if (disposed || ticket !== generation) return;
          object = template.scene.clone(true);
          object.traverse((child) => { if (child instanceof Mesh) { child.geometry = child.geometry.clone(); geometries.push(child.geometry); } });
          const settings = isJsonObject(next.import) ? next.import : {};
          const ids = Array.isArray(settings.materials) ? settings.materials : [];
          const chosen = await Promise.all(template.slots.map(async (original, index) => {
            const id = ids[index];
            if (typeof id !== "string") return original;
            keys.push(resources.materialKey(id));
            return resources.material(id);
          }));
          const copies = chosen.map((material) => { const copy = material.clone(); materials.push(copy); return copy; });
          assignSlotMaterials(object, template.slots, copies);
          applyUvwMapping(object, uvwOf(settings), false);
          if (Array.isArray(settings.vertexColors)) applyModelVertexColors(object, settings.vertexColors as unknown as ModelVertexColors[], ctx.status);
          info = { slots: template.slots.map((material, i) => material.name || `Element ${i}`), meshes: modelPrimitives(object).map(({ meshName, primitiveIndex, vertexCount }) => ({ meshName, primitiveIndex, vertexCount })) };
        } else {
          if (disposed || ticket !== generation) return;
          clear();
          world = ctx.classWorld?.(next) ?? null;
          object = world?.scene ?? new Group();
          subject.add(object);
          await ctx.host.cache.settled();
          if (disposed || ticket !== generation) return;
          loaded = true;
          return;
        }
        if (disposed || ticket !== generation) { abandon(); return; }
        clear();
        privateGeometries = geometries; privateMaterials = materials; held = keys;
        subject.add(object);
        if (!framed) { controls.frame(subject); framed = true; }
        loaded = true;
      } catch (error) {
        abandon();
        if (!disposed && ticket === generation) ctx.status(error instanceof Error ? error.message : String(error));
      }
    },
    info: () => info,
    focus: () => controls.frame(subject),
    setTool: (tool) => controls.setTool(ctx.readOnly ? "select" : tool),
    dispose() {
      if (disposed) return;
      disposed = true; generation++;
      clear(); controls.dispose(); release(); resources.releaseAll(); source?.dispose();
      if (raw) void raw.then((model) => {
        model.scene.traverse((object) => { if (object instanceof Mesh) { object.geometry.dispose(); for (const material of Array.isArray(object.material) ? object.material : [object.material]) material.dispose(); } });
        for (const texture of rawTextures) texture.dispose();
      }).catch(() => {});
      scene.clear();
    },
  };
}
