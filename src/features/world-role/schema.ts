// World Role: component schema.
//
// What an object is (`building.residential.detached`, `prop.rock`) and, when
// World Builder placed it, which stage did. The role lets a placeholder be
// swapped for a model later (a region profile says which model shows a
// role); the stage replaces Forge WebGL's `recipe.generatedBy` ledger, which
// moved onto the objects (plan 2b, user decision 2026-11-12). An object a
// person placed has a role and no stage.

import { defineComponent, text, type ComponentData } from "../../core/index.ts";

/** Dotted segments, each starting with a lower-case letter (Forge's `isSemanticRole`). */
export const WORLD_ROLE_PATTERN = "^[a-z][A-Za-z0-9_]*(\\.[a-z][A-Za-z0-9_]*)*$";

/** A World Builder stage id (`roads`, `buildings`). */
export const WORLD_STAGE_PATTERN = "^[a-z][A-Za-z0-9-]*$";

export const WorldRole = defineComponent(
  "forge.worldRole",
  1,
  {
    role: text({
      pattern: WORLD_ROLE_PATTERN,
      hint: "Nesnenin ne olduğu, noktalı adla (building.residential.detached). Bölge profili hangi modelin gösterileceğini buna göre seçer.",
    }),
    stage: text({
      pattern: WORLD_STAGE_PATTERN,
      hint: "Nesneyi koyan World Builder aşaması (roads, buildings). Elle konan nesnede boş.",
    }),
  },
  {
    label: "World Role",
    hint: "Nesnenin anlamsal rolü ve onu üreten World Builder aşaması.",
  },
);

export type WorldRoleData = ComponentData<typeof WorldRole>;
