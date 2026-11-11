// Ported from Forge WebGL engine/scene/entity.ts @ forge-webgl-final (04b5fb23); docs/PORT_LOG.md §2.
// TRANSITION (plan 2b, user decision 2026-11-11): Forge WebGL's old entity and
// component model, only the part ported subsystems read. Faz 6 replaces it with
// schema components (each subsystem binds to the world with its feature) and
// deletes src/engine/legacy. Kept inside src/engine (engine-legacy-stays-in-engine).
export type EntityId = string;
export type ComponentType = string;

export type SceneJsonValue =
  | string
  | number
  | boolean
  | null
  | SceneJsonValue[]
  | { [key: string]: SceneJsonValue };

export type EntityComponentData = Record<string, SceneJsonValue>;
export type EntityComponentMap = Record<ComponentType, EntityComponentData>;

export interface Entity {
  id: EntityId;
  name?: string;
  tags?: string[];
  parentId?: EntityId;
  components: EntityComponentMap;
}
