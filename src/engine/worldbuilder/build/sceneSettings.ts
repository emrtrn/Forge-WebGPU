/**
 * What World Builder leaves alone in a level it builds into (user decision
 * 2026-11-25): the level's settings and its scene settings actors, i.e. the
 * one-per-level environment actors (sky, Sky Light, fog, clouds, World
 * Environment, Post Process, shadow settings) and the directional lights.
 * Everything else in the level is replaced. Pure; the build and the editor's
 * window share it.
 */
import type { ActorDoc, ActorId, ClassResolver, ComponentMap, SchemaRegistry } from "../../../core/index.ts";
import { effectiveComponents, parseComponentTypeTag } from "../../../core/index.ts";

export interface SceneSettingsOptions {
  readonly registry: SchemaRegistry;
  readonly resolveClass: ClassResolver;
}

const DIRECTIONAL_LIGHT = "forge.directionalLight";
/** A level with one of these has a look of its own: the greybox look is not added. */
const LOOK = ["forge.skyAtmosphere", "forge.skyLight", DIRECTIONAL_LIGHT];

function typesOf(actor: ActorDoc, options: SceneSettingsOptions): string[] {
  const components: ComponentMap = actor.class === null ? actor.components : effectiveComponents(actor, options.resolveClass(actor.class));
  return Object.values(components).flatMap((component) => parseComponentTypeTag(component.type)?.name ?? []);
}

export function isSceneSettingsActor(actor: ActorDoc, options: SceneSettingsOptions): boolean {
  return typesOf(actor, options).some((type) => type === DIRECTIONAL_LIGHT || options.registry.getComponent(type)?.singleton === true);
}

/** The scene settings actors with their ancestors (a group they are in), in level order. */
export function sceneSettingsActors(actors: readonly ActorDoc[], options: SceneSettingsOptions): ActorDoc[] {
  const byId = new Map<ActorId, ActorDoc>(actors.map((actor) => [actor.id, actor]));
  const kept = new Set<ActorId>();
  for (const actor of actors) {
    if (!isSceneSettingsActor(actor, options)) continue;
    for (let at: ActorDoc | undefined = actor; at && !kept.has(at.id); at = at.parent === null ? undefined : byId.get(at.parent)) kept.add(at.id);
  }
  return actors.filter((actor) => kept.has(actor.id));
}

export function hasLook(actors: readonly ActorDoc[], options: SceneSettingsOptions): boolean {
  return actors.some((actor) => typesOf(actor, options).some((type) => LOOK.includes(type)));
}
