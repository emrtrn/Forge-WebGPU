// Model: binary asset type.
//
// A 3D model file (glTF / GLB). Version 2 (phase 3 step 4) carries what Forge
// WebGL kept in three sidecars next to the model:
// - `materials` (`*.materials.json`): the model's default material per slot.
//   Slot i is the i-th unique material met walking the loaded model (Forge's
//   "unique GLB material order"); null keeps the GLB's own material.
// - `uvw` (`*.uvw.json`): a UVW projection that replaces the model's UVs
//   (planar, box, sphere, cylinder) through a gizmo transform; `none` keeps
//   them.
// - `vertexColors` (`*.vertexcolors.json`): default RGBA vertex colours per
//   mesh primitive (Mesh Paint's "To Mesh"); a layer blend can read them.
// A placement can override the materials (`forge.staticMesh.materials`).
// Version 1 had no settings; its files migrate to the defaults.

import { array, assetRef, defineAssetType, enumOf, num, object, text, vec3 } from "../../core/index.ts";

export const UVW_MAP_TYPES = ["none", "planar", "box", "sphere", "cylinder"] as const;
export type UvwMapType = (typeof UVW_MAP_TYPES)[number];

/** Forge WebGL's limit on a vertex colour entry (engine/scene/assetVertexColors.ts). */
export const MAX_VERTEX_COLOR_VERTICES = 2_000_000;

export const ModelAssetType = defineAssetType(
  "forge.model",
  2,
  {
    extensions: ["glb", "gltf"],
    importFields: {
      materials: array(assetRef({ assetType: "forge.material", hint: "Bu slotun materyali; boşsa GLB'nin kendi materyali." }), {
        hint: "Slot başına varsayılan materyal, GLB'deki materyal sırasıyla (Element 0, 1, …). Yerleşim değiştirebilir.",
      }),
      uvw: object(
        {
          mapType: enumOf(UVW_MAP_TYPES, {
            default: "none",
            labels: { none: "None", planar: "Planar", box: "Box", sphere: "Sphere", cylinder: "Cylinder" },
            hint: "UV'leri bir izdüşümle yeniden üretir. None modelin kendi UV'lerini korur.",
          }),
          position: vec3({ default: [0, 0, 0], hint: "İzdüşüm gizmosunun konumu, model uzayında metre." }),
          rotation: vec3({ default: [0, 0, 0], hint: "İzdüşüm gizmosunun dönüşü, XYZ derece." }),
          scale: vec3({ default: [1, 1, 1], min: 0.001, hint: "İzdüşüm gizmosunun boyutu; bir doku tekrarı bu kadar metre." }),
        },
        { label: "UVW", hint: "UVW izdüşümü (açma değil; hızlı UVW Map değiştiricisi gibi)." },
      ),
      vertexColors: array(
        object({
          meshName: text({ hint: "Renklerin ait olduğu mesh'in adı." }),
          primitiveIndex: num({ min: 0, max: 1_000_000, step: 1, default: 0, hint: "Mesh içindeki primitive sırası." }),
          vertexCount: num({ min: 0, max: MAX_VERTEX_COLOR_VERTICES, step: 1, default: 0, hint: "Köşe sayısı; modelinkiyle uyuşmazsa renkler uygulanmaz." }),
          colors: array(num({ min: 0, max: 1, default: 0 }), { hint: "Köşe başına RGBA, 0–1." }),
          positions: array(num({ default: 0 }), { hint: "Köşelerin yerel konumları; yeniden içe aktarmada eşleştirme için." }),
        }),
        { hint: "Mesh primitive'i başına varsayılan köşe renkleri (Mesh Paint)." },
      ),
    },
  },
  {
    label: "Model",
    hint: "3B model (glTF / GLB): slot materyalleri, UVW izdüşümü ve köşe renkleriyle.",
    migrations: { 1: (data) => ({ ...data }) },
  },
);
