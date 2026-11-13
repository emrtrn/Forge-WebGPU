/**
 * Forge WebGL `lights[]` as light actors (plan phase 3 step 3, importer table):
 * one actor per light with a `forge.directionalLight`, `forge.pointLight` or
 * `forge.spotLight` component. Forge's defaults are written out where the
 * light leaves a field out (engine/scene/lights.ts `defaultLightIntensity`,
 * engine/render-three/lights.ts: colour white, directional 2 / point 2.5 /
 * spot 3, reach 8 / 10 m, decay 2, cone 30 degrees, penumbra 0.35, only a
 * directional light casts shadows unless told), so an imported level looks the
 * same if a component default changes later.
 *
 * The sun: Forge elects the directional light whose id is `sun`, else the
 * first directional light of the level (its cells' lights after the level's);
 * that one gets `atmosphereSun`. A directional light lives in the persistent
 * layer (Forge never routes one into a cell); point and spot lights keep their
 * `spatiallyLoaded`.
 */
import type { ActorDoc, ActorId, ComponentMap, JsonObject } from "../../core/index.ts";
import { isJsonObject } from "../../core/index.ts";
import { eulerXyzQuaternion } from "./placements.ts";

/** Forge's `DEFAULT_SCENE_SUN_ID`. */
export const FORGE_SUN_ID = "sun";

/** Light fields the converter reads. */
export const CONVERTED_LIGHT_FIELDS: ReadonlySet<string> = new Set([
  "id", "type", "name", "position", "rotation", "color", "intensity", "castShadow", "cascadedShadows",
  "distance", "angle", "penumbra", "decay", "spatiallyLoaded",
]);

export const LIGHT_FIELD_PHASES: Readonly<Record<string, string>> = {
  hidden: "4",
  locked: "4",
  scaleLocked: "4",
  groupId: "4",
  nodeId: "4",
  parentId: "4",
};

const TAGS = { directional: "forge.directionalLight@1", point: "forge.pointLight@1", spot: "forge.spotLight@1" } as const;
const DEFAULT_INTENSITY = { directional: 2, point: 2.5, spot: 3 } as const;
const IDENTITY_LOCAL = { p: [0, 0, 0], r: [0, 0, 0, 1], s: [1, 1, 1] };

export interface ForgeLightSource {
  readonly light: JsonObject;
  /** Actor id key prefix: `` for the level, `cells/<key>/` for a cell. */
  readonly keyPrefix: string;
}

export interface LightActors {
  readonly actors: ActorDoc[];
  /** Lights left out because Forge has no such type, by type. */
  readonly unknownTypes: ReadonlyMap<string, number>;
  /** Fields the converter does not read, with how many lights carry them. */
  readonly unread: ReadonlyMap<string, number>;
}

const num = (value: unknown, fallback: number): number => (typeof value === "number" && Number.isFinite(value) ? value : fallback);
const vec3 = (value: unknown): [number, number, number] =>
  Array.isArray(value) && value.length === 3 && value.every((n) => typeof n === "number" && Number.isFinite(n))
    ? [value[0], value[1], value[2]]
    : [0, 0, 0];

/** Index of the light Forge treats as the sun, or -1. */
export function forgeSunIndex(lights: readonly JsonObject[]): number {
  const preferred = lights.findIndex((light) => light.type === "directional" && light.id === FORGE_SUN_ID);
  return preferred >= 0 ? preferred : lights.findIndex((light) => light.type === "directional");
}

export function lightActors(sources: readonly ForgeLightSource[], actorId: (key: string) => ActorId): LightActors {
  const actors: ActorDoc[] = [];
  const unknownTypes = new Map<string, number>();
  const unread = new Map<string, number>();
  const sun = forgeSunIndex(sources.map((source) => source.light));
  sources.forEach(({ light, keyPrefix }, index) => {
    const type = light.type;
    if (type !== "directional" && type !== "point" && type !== "spot") {
      const key = String(type);
      unknownTypes.set(key, (unknownTypes.get(key) ?? 0) + 1);
      return;
    }
    for (const field of Object.keys(light)) {
      if (CONVERTED_LIGHT_FIELDS.has(field)) continue;
      if (field === "hidden" && light.hidden === false) continue;
      unread.set(field, (unread.get(field) ?? 0) + 1);
    }
    const id = typeof light.id === "string" && light.id !== "" ? light.id : `${type}#${index}`;
    const [rx, ry, rz] = vec3(light.rotation);
    const component: JsonObject = {
      type: TAGS[type],
      parent: null,
      local: structuredClone(IDENTITY_LOCAL),
      color: typeof light.color === "string" ? light.color.toLowerCase() : "#ffffff",
      intensity: num(light.intensity, DEFAULT_INTENSITY[type]),
    };
    if (type === "point" || type === "spot") {
      component.distance = num(light.distance, type === "point" ? 8 : 10);
    }
    if (type === "spot") {
      component.angle = num(light.angle, 30);
      component.penumbra = num(light.penumbra, 0.35);
    }
    if (type === "point" || type === "spot") component.decay = num(light.decay, 2);
    component.castShadow = typeof light.castShadow === "boolean" ? light.castShadow : type === "directional";
    if (type === "directional") {
      component.cascadedShadows = light.cascadedShadows === true;
      component.atmosphereSun = index === sun;
    }
    actors.push({
      id: actorId(`${keyPrefix}light/${id}`),
      name: typeof light.name === "string" && light.name !== "" ? light.name : id,
      class: null,
      parent: null,
      spatiallyLoaded: type === "directional" ? false : light.spatiallyLoaded !== false,
      transform: { p: vec3(light.position), r: eulerXyzQuaternion(rx, ry, rz), s: [1, 1, 1] },
      components: { light: component as unknown as ComponentMap[string] },
    });
  });
  return { actors, unknownTypes, unread };
}

/** The lights of a level document and its cells, level first. */
export function forgeLightSources(layout: JsonObject, cells: ReadonlyArray<{ readonly key: string; readonly doc: unknown }>): ForgeLightSource[] {
  const of = (doc: unknown, keyPrefix: string): ForgeLightSource[] =>
    isJsonObject(doc) && Array.isArray(doc.lights) ? doc.lights.filter(isJsonObject).map((light) => ({ light, keyPrefix })) : [];
  return [...of(layout, ""), ...cells.flatMap((cell) => of(cell.doc, `cells/${cell.key}/`))];
}
