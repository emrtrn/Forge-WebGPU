// Model assets through three's glTF loader (architecture §4.9): meshopt and
// KTX2 with the decoders three ships in `examples/jsm/libs` (no new npm
// dependency, no vendored copy; Forge WebGL used the `meshoptimizer` package
// and a copied basis transcoder under public/vendor). The basis transcoder's
// two files are emitted by Vite (`?url`) and the loading manager points
// KTX2Loader's default request at them, so the same code works in the dev
// server and in a build.
//
// GLB files only for now: a `.gltf` with side files would need its relative
// URIs mapped to asset GUIDs (the material step, plan phase 3 step 4).

import basisTranscoderJs from "three/examples/jsm/libs/basis/basis_transcoder.js?url";
import basisTranscoderWasm from "three/examples/jsm/libs/basis/basis_transcoder.wasm?url";
import { MeshoptDecoder } from "three/examples/jsm/libs/meshopt_decoder.module.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { KTX2Loader } from "three/examples/jsm/loaders/KTX2Loader.js";
import { LoadingManager, type WebGPURenderer } from "three/webgpu";
import type { AssetUrls } from "./assetUrls.ts";
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
  dispose(): void;
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
      return { scene: gltf.scene };
    },
    dispose: () => ktx2.dispose(),
  };
}
