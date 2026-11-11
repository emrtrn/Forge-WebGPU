// Violation: the runtime reaches the engine's transition model.
import type { EntityId } from "../engine/legacy/entity";

export const id = (value: string): EntityId => value;
