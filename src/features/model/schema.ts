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
// - `optimize` (phase 4 step 6e): how the editor's import shrinks the GLB
//   (textures to WebP under a size limit, meshopt geometry, normal maps kept
//   or dropped, embedded textures stripped); a Reimport applies it again.
//   Added with defaults, so version 2 files read as they are.
// - `collision` (vegetation plan PG1, user decision 2026-11-18): simple
//   collision shapes in model space, where Forge WebGL kept `*.collision.json`.
//   For now only convex hulls (`convex`, flat XYZ point lists), which the rock
//   generator writes; phase 6 widens the group (Forge's primitives,
//   complexity) and builds the collider from it. Empty: the physics default.
// A placement can override the materials (`forge.staticMesh.materials`).
// Version 1 had no settings; its files migrate to the defaults.

import { array, assetRef, bool, defineAssetType, enumOf, num, object, text, vec3, type FieldValues } from "../../core/index.ts";
import { COLLISION_COMPLEXITY_VALUES, COLLISION_ENABLED_VALUES, COLLISION_OBJECT_CHANNELS, COLLISION_PRESET_IDS, COLLISION_RESPONSE_VALUES } from "../../core/schema/collisionChannels.ts";

export const UVW_MAP_TYPES = ["none", "planar", "box", "sphere", "cylinder"] as const;
export type UvwMapType = (typeof UVW_MAP_TYPES)[number];

/** Forge WebGL's limit on a vertex colour entry (engine/scene/assetVertexColors.ts). */
export const MAX_VERTEX_COLOR_VERTICES = 2_000_000;

const collisionResponse = () => enumOf(COLLISION_RESPONSE_VALUES, { default: "block" });

export const ModelCollisionFields = {
  complexity: enumOf(COLLISION_COMPLEXITY_VALUES, {
    default: "projectDefault", hint: "Complex As Simple, statik yerleşimlerde modelin üçgen yüzeyini kullanır.",
  }),
  enabled: bool({ default: true, hint: "Model yerleşimleri fizik dünyasına çarpışma geometrisi ekler." }),
  sensor: bool({ default: false, hint: "Hareketi engellemeden örtüşme algılar." }),
  profile: object({
    preset: enumOf(["default", ...COLLISION_PRESET_IDS], { default: "default", hint: "Custom seçildiğinde aşağıdaki kanallar kullanılır." }),
    collisionEnabled: enumOf(COLLISION_ENABLED_VALUES, { default: "queryAndPhysics" }),
    objectType: enumOf(COLLISION_OBJECT_CHANNELS, { default: "worldStatic" }),
    responses: object({
      worldStatic: collisionResponse(), worldDynamic: collisionResponse(), pawn: collisionResponse(),
      physicsBody: collisionResponse(), trigger: collisionResponse(), visibility: collisionResponse(), camera: collisionResponse(),
    }),
  }, { label: "Collision Profile" }),
  physicalMaterial: text({ hint: "Fizik sorgularının döndürdüğü yüzey profili kimliği." }),
  primitives: array(object({
    shape: enumOf(["box", "sphere", "capsule", "cylinder", "cone"], { default: "box" }),
    size: vec3({ default: [1, 1, 1], min: 0.001, hint: "Model uzayındaki tam boyut, metre." }),
    center: vec3({ default: [0, 0, 0], hint: "Şeklin model uzayındaki merkezi, metre." }),
    rotation: vec3({ default: [0, 0, 0], hint: "Model uzayındaki XYZ dönüşü, derece." }),
  }), { hint: "Model uzayındaki basit çarpışma şekilleri." }),
  convex: array(object({
    points: array(num({ default: 0 }), { hint: "Kabuğun noktaları, model uzayında X Y Z sırasıyla, metre." }),
  }, { label: "Convex Hull" }), { hint: "Dışbükey çarpışma kabukları (prosedürel kaya yazar)." }),
} as const;

export type ModelCollisionSettings = FieldValues<typeof ModelCollisionFields>;

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
      optimize: object(
        {
          enabled: bool({ default: true, label: "Optimize", hint: "İçe aktarırken GLB'yi küçültür (dokular WebP, geometri meshopt)." }),
          maxTextureSize: num({ min: 64, max: 8192, step: 1, default: 1024, label: "Max Texture Size", hint: "Dokunun uzun kenarı en çok bu kadar piksel." }),
          keepNormals: bool({ default: true, label: "Keep Normal Maps", hint: "Normal haritalarını korur; kapalıyken atılır (üretilmiş modellerde çoğu gürültüdür)." }),
          meshopt: bool({ default: true, label: "Compress Geometry", hint: "Geometriyi meshopt ile sıkıştırır." }),
          stripTextures: bool({
            default: false,
            label: "Strip Embedded Textures",
            hint: "Slotlar projenin materyallerini kullanıyorsa GLB'nin gömülü dokularını atar; materyaller sayısı ve sırasıyla kalır.",
          }),
        },
        { label: "Optimize", hint: "İçe aktarmada GLB optimizasyonu; Reimport aynı ayarla uygular." },
      ),
      collision: object(ModelCollisionFields, { label: "Collision", hint: "Model uzayındaki çarpışma şekilleri. Boşsa modelin sınır kutusu kullanılır." }),
    },
  },
  {
    label: "Model",
    hint: "3B model (glTF / GLB): slot materyalleri, UVW izdüşümü ve köşe renkleriyle.",
    migrations: { 1: (data) => ({ ...data }) },
  },
);
