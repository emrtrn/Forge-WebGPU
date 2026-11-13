// Model assets through three's glTF loader (architecture §4.9): meshopt and
// KTX2 with the decoders three ships in `examples/jsm/libs` (no new npm
// dependency, no vendored copy; Forge WebGL used the `meshoptimizer` package
// and a copied basis transcoder under public/vendor). The basis transcoder's
// two files are emitted by Vite (`?url`) and the loading manager points
// KTX2Loader's default request at them, so the same code works in the dev
// server and in a build.
//
// GLB files only for now: a `.gltf` with side files would need its relative
// URIs mapped to asset GUIDs.
//
// A loaded model is prepared once (`modelSetup.ts`, plan phase 3 step 4):
// normals where missing, the default anisotropy on its own textures, its UVW
// projection; its material slots and their default materials (`forge.model@2`)
// travel with the template for the placements.

import basisTranscoderJs from "three/examples/jsm/libs/basis/basis_transcoder.js?url";
import basisTranscoderWasm from "three/examples/jsm/libs/basis/basis_transcoder.wasm?url";
import { MeshoptDecoder } from "three/examples/jsm/libs/meshopt_decoder.module.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { KTX2Loader } from "three/examples/jsm/loaders/KTX2Loader.js";
import { LoadingManager, type WebGPURenderer } from "three/webgpu";
import { isJsonObject } from "../../core/index.ts";
import type { AssetUrls } from "./assetUrls.ts";
import { applyDefaultModelTextureAnisotropy, applyUvwMapping, ensureVertexNormals, modelMaterialSlots, type UvwSettings } from "./modelSetup.ts";
import type { ModelSource, ModelTemplate } from "./worldResources.ts";

export class ModelNotFoundError extends Error {
  constructor(guid: string) {
    super(`Model ${guid} is not in the asset index.`);
    this.name = "ModelNotFoundError";
  }
}

function transcoderManager(): LoadingManager {
  const manager = new LoadingManager();
  manager.setURLModifier((url) => {
    if (url.endsWith("basis_transcoder.js")) return basisTranscoderJs;
    if (url.endsWith("basis_transcoder.wasm")) return basisTranscoderWasm;
    return url;
  });
  return manager;
}

export interface GltfModelSource extends ModelSource {
  /** The KTX2 loader, shared with texture assets. */
  readonly ktx2: KTX2Loader;
  dispose(): void;
}

const isNumberTriple = (value: unknown): value is [number, number, number] =>
  Array.isArray(value) && value.length === 3 && value.every((element) => typeof element === "number");

/** The model's UVW settings from its normalised import settings; none when absent. */
export function uvwOf(settings: unknown): UvwSettings {
  const uvw = isJsonObject(settings) && isJsonObject(settings.uvw) ? settings.uvw : {};
  const mapType = ["planar", "box", "sphere", "cylinder"].includes(String(uvw.mapType)) ? (uvw.mapType as UvwSettings["mapType"]) : "none";
  return {
    mapType,
    position: isNumberTriple(uvw.position) ? uvw.position : [0, 0, 0],
    rotation: isNumberTriple(uvw.rotation) ? uvw.rotation : [0, 0, 0],
    scale: isNumberTriple(uvw.scale) ? uvw.scale : [1, 1, 1],
  };
}

/** The model's default material per slot from its import settings. */
export function slotMaterialsOf(settings: unknown): (string | null)[] {
  const list = isJsonObject(settings) && Array.isArray(settings.materials) ? settings.materials : [];
  return list.map((entry) => (typeof entry === "string" ? entry : null));
}

export function createGltfModelSource(renderer: WebGPURenderer, urls: AssetUrls): GltfModelSource {
  const ktx2 = new KTX2Loader(transcoderManager()).detectSupport(renderer);
  const loader = new GLTFLoader();
  loader.setMeshoptDecoder(MeshoptDecoder);
  loader.setKTX2Loader(ktx2);
  loader.setRequestHeader({ ...urls.headers });
  return {
    async load(guid): Promise<ModelTemplate> {
      const url = urls.url(guid);
      if (url === null) throw new ModelNotFoundError(guid);
      const gltf = await loader.loadAsync(url);
      gltf.scene.name = guid;
      const settings = urls.importSettings(guid);
      ensureVertexNormals(gltf.scene);
      applyDefaultModelTextureAnisotropy(gltf.scene, renderer.getMaxAnisotropy());
      applyUvwMapping(gltf.scene, uvwOf(settings));
      return { scene: gltf.scene, slots: modelMaterialSlots(gltf.scene), slotMaterials: slotMaterialsOf(settings) };
    },
    ktx2,
    dispose: () => ktx2.dispose(),
  };
}
