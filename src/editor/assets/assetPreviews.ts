// The asset editor's previews: what a registered preview (features/*/
// editorRender.ts) and the actor class preview get from the editor. One at a
// time, on the viewport's renderer.

import { normalizeActorClass, normalizeActorDoc, type AssetPreviewController, type ClassResolver, type FeatureDef, type JsonAssetTypeDef, type SchemaRegistry } from "../../core/index.ts";
import { createAssetPreview, type AssetPreviewContext, type AssetPreviewRegistration, type PreviewClassWorld } from "../../render/editor/assetPreview.ts";
import type { RenderHost } from "../../render/host/renderHost.ts";
import type { AssetUrls } from "../../render/resources/assetUrls.ts";
import { createWorld } from "../../runtime/world.ts";
import type { AssetEditorExtensionContext } from "../host/assetEditorTypes.ts";
import type { AssetCatalog } from "./assetCatalog.ts";
import type { EditableAsset } from "./assetDocument.ts";
import { fetchRecipeLinks } from "./recipeClient.ts";

export interface AssetPreviewsOptions {
  /** The viewport's render host; null before it starts and once the device is lost. */
  readonly host: () => RenderHost | null;
  readonly previews: readonly AssetPreviewRegistration[];
  readonly registry: SchemaRegistry;
  readonly features: readonly FeatureDef[];
  readonly resolveClass: ClassResolver;
  readonly assetUrls: AssetUrls;
  readonly materialType: JsonAssetTypeDef | null;
  readonly catalog: AssetCatalog;
}

export type OpenAssetPreview = (key: string, asset: EditableAsset, container: HTMLElement, edit: AssetEditorExtensionContext["edit"], status: (message: string) => void) => AssetPreviewController | null;

export function createAssetPreviews(options: AssetPreviewsOptions): OpenAssetPreview {
  const { registry, resolveClass } = options;

  /** An editor world holding one instance of a class draft. */
  const classWorld = (host: RenderHost) => (document: Readonly<Record<string, unknown>>): PreviewClassWorld => {
    const result = normalizeActorClass(document, { strict: true, registry });
    if (!result.ok || !result.value) throw new Error("Invalid actor class draft.");
    const cls = result.value;
    const resolver: ClassResolver = (id) => id === cls.id ? cls : resolveClass(id);
    const world = createWorld({ strict: true, registry, resolveClass: resolver, features: [...options.features, host.feature(options.features, "asset-class-preview", { prepare: false })], mode: "editor" });
    try {
      world.init();
      const actor = normalizeActorDoc({ id: `act_${"f".repeat(32)}`, class: cls.id, name: cls.name, spatiallyLoaded: false }, { strict: true, registry, resolveClass: resolver });
      if (!actor.ok || !actor.value) throw new Error("Cannot preview this class.");
      world.addActors([actor.value], "level"); world.beginPlay();
      return { scene: host.world!.scene, frame: (dt) => world.tick(dt), dispose: () => world.dispose() };
    } catch (error) { world.dispose(); throw error; }
  };

  return (key, asset, container, edit, status) => {
    const host = options.host();
    if (!host) return null;
    const context: AssetPreviewContext = {
      host, container, guid: asset.id, urls: options.assetUrls, materialType: options.materialType, readOnly: !asset.writable, status,
      edit: (path, value, phase) => edit("Edit in preview", path, value, phase),
      assetsOf: (type) => options.catalog.ofType(type).map((item) => item.guid),
      recipeLinks: fetchRecipeLinks,
      classWorld: classWorld(host),
    };
    if (key === "forge.actorClass") return createAssetPreview(context, "class");
    return options.previews.find((entry) => entry.key === key)?.create(context) ?? null;
  };
}
