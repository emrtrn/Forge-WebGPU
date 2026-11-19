import type { ActorId } from "../../core/id.ts";
import { createServiceKey } from "../../core/world/services.ts";

/** A renderer may delay first visibility until its pipelines are compiled. */
export interface RenderReadiness {
  /** If provided, changes whenever a previously ready actor could become unready. */
  readonly revision?: number;
  isActorReady(id: ActorId): boolean;
}

export const RenderReadinessKey = createServiceKey<RenderReadiness>("forge.renderReadiness");
