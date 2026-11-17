import type { ActorId } from "../../core/id.ts";
import { createServiceKey } from "../../core/world/services.ts";

/** A renderer may delay first visibility until its pipelines are compiled. */
export const RenderReadinessKey = createServiceKey<{ isActorReady(id: ActorId): boolean }>("forge.renderReadiness");
