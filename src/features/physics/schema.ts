import { bool, defineComponent, enumOf, num, text, vec3, type ComponentData } from "../../core/index.ts";

const shapes = ["box", "sphere", "capsule", "cylinder", "cone"] as const;

export const Collider = defineComponent("forge.collider", 1, {
  shape: enumOf(shapes, { default: "box", hint: "Çarpışma geometrisinin tipi." }),
  size: vec3({ default: [1, 1, 1], min: 0.001, hint: "Aktör ölçeğinden önceki tam boyut, metre." }),
  enabled: bool({ default: true, hint: "Çarpışma ve sorgulara katılır." }),
  sensor: bool({ default: false, hint: "Örtüşme olayı verir, hareketi engellemez." }),
  motion: enumOf(["static", "dynamic"], { default: "static", hint: "Dynamic, aktörün konumunu fizik simülasyonundan alır." }),
  mass: num({ default: 1, min: 0.001, hint: "Dinamik gövde kütlesi, kilogram." }),
  gravity: bool({ default: true, hint: "Dinamik gövdeye yer çekimi uygular." }),
  friction: num({ min: 0, default: 0.8, hint: "Temas yüzeyinin sürtünmesi." }),
  restitution: num({ min: 0, max: 1, default: 0, hint: "Temas yüzeyinin sekmesi." }),
  physicalMaterial: text({ hint: "Fizik sorgularının döndürdüğü yüzey profili kimliği." }),
}, {
  spatial: true, label: "Collider", hint: "Aktöre çarpışma ve fizik sorgusu geometrisi ekler.", persistTransform: true,
});

export const BlockingVolume = defineComponent("forge.blockingVolume", 1, {
  shape: enumOf(["box", "sphere", "cylinder", "cone"], {
    default: "box", hint: "Engelleme hacminin biçimi.",
  }),
  size: vec3({ default: [1, 1, 1], min: 0.001, hint: "Aktör ölçeğinden önceki tam boyut, metre." }),
  visibleInGame: bool({ default: false, hint: "Oyun görünümünde hacmi gösterir." }),
}, {
  spatial: true, label: "Blocking Volume", hint: "Hareketi sınırlayan statik hacim.",
});

export type ColliderData = ComponentData<typeof Collider>;
export type BlockingVolumeData = ComponentData<typeof BlockingVolume>;
