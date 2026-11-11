// Control: the engine layer may read the transition model. Must not be reported.
import type { EntityId } from "./legacy/entity";

export const id = (value: string): EntityId => value;
