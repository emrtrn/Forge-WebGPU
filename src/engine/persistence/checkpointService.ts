import { createServiceKey, type ActorDoc, type ActorId, type SaveGameDoc, type SaveStateData, type SaveStateDef, type WorldActor } from "../../core/index.ts";
import type { SaveGameSlotInfo } from "./saveGameStore.ts";

export interface CheckpointService {
  save(slot: string): boolean;
  slots(): readonly (SaveGameSlotInfo & { readonly levelName: string | null })[];
  delete(slot: string): boolean;
  restore(slot: string): boolean;
  state<S extends SaveStateDef>(definition: S): SaveStateData<S>;
  setState<S extends SaveStateDef>(definition: S, value: SaveStateData<S>): void;
  capture(): SaveGameDoc;
}

export const CheckpointKey = createServiceKey<CheckpointService>("forge.checkpoint");

export const CheckpointActorTrackingKey = createServiceKey<{
  spawned(doc: ActorDoc): void;
  destroyed(id: ActorId, origin: "level" | "spawned"): void;
  unloaded(actor: WorldActor): void;
}>("forge.checkpoint.actorTracking");
