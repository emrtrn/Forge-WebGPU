// Ported from Forge WebGL engine/behavior/behaviorSubsystem.ts (LaunchOptions, TransformSink) @ forge-webgl-final (04b5fb23); docs/PORT_LOG.md §2.
// Movement owns these host types; Forge declared them beside the behavior host
// (behavior imports them from here when it is ported).
import type { TransformComponent } from "../legacy/components.ts";
import type { EntityId } from "../legacy/entity.ts";

/**
 * Options for {@link ActorCommands.launch} (Unreal `LaunchCharacter`): by default
 * the launch velocity is *added* to the character's current motion; the override
 * flags replace a component instead (horizontal for `xyOverride`, vertical for
 * `zOverride`).
 */
export interface LaunchOptions {
  readonly xyOverride?: boolean;
  readonly zOverride?: boolean;
}

export type TransformSink = (entityId: EntityId, transform: TransformComponent) => void;
