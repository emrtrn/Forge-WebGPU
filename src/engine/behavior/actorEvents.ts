// Ported from Forge WebGL engine/scene/actorScript.ts (ACTOR_EVENT_KINDS, ActorEventKind) @ forge-webgl-final (04b5fb23); docs/PORT_LOG.md §2.

/**
 * Runtime event a binding hooks into. A small fixed set mirroring the existing
 * behavior triggers (`src/game/behaviors.ts`): begin-play one-shots, per-tick
 * updates, sensor overlap, physics hit, physics impact strength, interaction,
 * and the end-play teardown one-shot (Unreal `Event EndPlay`).
 */
export const ACTOR_EVENT_KINDS = [
  "beginPlay",
  "tick",
  "overlap",
  "hit",
  "impact",
  "interact",
  "endPlay",
] as const;
export type ActorEventKind = (typeof ACTOR_EVENT_KINDS)[number];
