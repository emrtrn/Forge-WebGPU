// The save state of what is not loaded (decision A11: "not loaded yet" is a
// valid state, so a save must hold actors whose cells are out of range).
//
// One ledger per played level. When a cell unloads, the run time captures its
// actors (`captureActorState`) and remembers them here; when the cell loads
// again it takes their entries back and applies them before the actors join
// the world. Saving writes the ledger plus the loaded actors' state now, so a
// save and cell streaming are the same bookkeeping (Forge kept two: the save
// payload and `StreamedActorStateCache`). Pure: no I/O, no world.

import type { ActorId, LevelId } from "../id.ts";
import type { ActorDoc } from "../level/model.ts";
import { parseComponentTypeTag } from "../schema/component.ts";
import { createSaveGame, type SaveGameDoc, type SavedActor, type SavedEntry } from "./saveGame.ts";

const byKey = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

export class SaveLedger {
  readonly level: LevelId;
  private readonly actors = new Map<ActorId, SavedActor>();
  private readonly removed = new Set<ActorId>();
  private readonly spawned = new Map<ActorId, ActorDoc>();
  private readonly states = new Map<string, SavedEntry>();

  /** A ledger for `level`, seeded from a save of that level. */
  constructor(level: LevelId, from: SaveGameDoc | null = null) {
    if (from && from.level !== level) {
      throw new Error(`SaveLedger: the save is of ${from.level}, not ${level}.`);
    }
    this.level = level;
    if (!from) return;
    for (const [id, saved] of Object.entries(from.actors)) this.actors.set(id as ActorId, structuredClone(saved));
    for (const id of from.removed) this.removed.add(id);
    for (const actor of from.spawned) this.spawned.set(actor.id, structuredClone(actor));
    for (const [name, saved] of Object.entries(from.states)) this.states.set(name, structuredClone(saved));
  }

  /** An actor leaves the world (its cell unloads): what it keeps; null when it is as authored. */
  remember(id: ActorId, saved: SavedActor | null): void {
    if (saved) this.actors.set(id, structuredClone(saved));
    else this.actors.delete(id);
  }

  /** An actor joins the world: its saved entry, handed over once. */
  take(id: ActorId): SavedActor | undefined {
    const saved = this.actors.get(id);
    this.actors.delete(id);
    return saved;
  }

  has(id: ActorId): boolean {
    return this.actors.has(id);
  }

  /** An authored actor destroyed in play: it is not built again, and its entry goes. */
  markRemoved(id: ActorId): void {
    this.removed.add(id);
    this.actors.delete(id);
  }

  isRemoved(id: ActorId): boolean {
    return this.removed.has(id);
  }

  /** A spawned actor whose cell unloaded: its document, to build it again. */
  rememberSpawned(actor: ActorDoc): void {
    this.spawned.set(actor.id, structuredClone(actor));
  }

  /** A spawned actor destroyed in play, or built again from the ledger. */
  forgetSpawned(id: ActorId): void {
    this.spawned.delete(id);
  }

  spawnedActors(): ActorDoc[] {
    return [...this.spawned.values()].map((actor) => structuredClone(actor));
  }

  /** A game-wide save state (`defineSaveState`), stored whole under its name. */
  setState(saved: SavedEntry): void {
    const tag = parseComponentTypeTag(saved.type);
    if (!tag) throw new Error(`SaveLedger: "${saved.type}" is not a save state stamp.`);
    this.states.set(tag.name, structuredClone(saved));
  }

  getState(name: string): SavedEntry | undefined {
    const saved = this.states.get(name);
    return saved ? structuredClone(saved) : undefined;
  }

  /**
   * The save document: the ledger plus the loaded actors (`live`: actor id ->
   * captured state, null when as authored; a loaded actor's entry wins) and
   * the loaded spawned actors. Canonical order, a fresh copy.
   */
  toDocument(live: ReadonlyMap<ActorId, SavedActor | null>, liveSpawned: readonly ActorDoc[] = []): SaveGameDoc {
    const doc = createSaveGame(this.level);
    const actors = new Map(this.actors);
    for (const [id, saved] of live) {
      if (saved) actors.set(id, saved);
      else actors.delete(id);
    }
    for (const id of [...actors.keys()].sort(byKey)) {
      if (!this.removed.has(id)) doc.actors[id] = structuredClone(actors.get(id)!);
    }
    doc.removed = [...this.removed].sort(byKey);
    const spawned = new Map(this.spawned);
    for (const actor of liveSpawned) spawned.set(actor.id, actor);
    doc.spawned = [...spawned.keys()].sort(byKey).map((id) => structuredClone(spawned.get(id)!));
    for (const name of [...this.states.keys()].sort(byKey)) doc.states[name] = structuredClone(this.states.get(name)!);
    return doc;
  }
}
