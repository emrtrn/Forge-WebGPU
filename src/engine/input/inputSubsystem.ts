// Ported from Forge WebGL engine/input/inputSubsystem.ts @ forge-webgl-final (04b5fb23); docs/PORT_LOG.md §2.
import type { Subsystem } from "../subsystem.ts";
import type { ActionMap } from "./actionMap.ts";

/** Stable registry id for the input subsystem. */
export const INPUT_SUBSYSTEM_ID = "input.action-map";

/**
 * Advances an {@link ActionMap} once per engine tick, turning the raw
 * down/up codes fed in by a DOM source into this tick's pressed/held/released
 * action edges. DOM-free: the raw events arrive via the action map, not here.
 *
 * Register this before any behavior subsystem so behaviors read current-tick
 * action state.
 */
export class InputSubsystem implements Subsystem {
  readonly id = INPUT_SUBSYSTEM_ID;

  // Was a constructor parameter property in Forge; spelled out because this repo
  // allows only erasable TypeScript syntax (Node type stripping).
  private readonly actions: ActionMap;
  constructor(actions: ActionMap) {
    this.actions = actions;
  }

  update(): void {
    this.actions.advance();
  }
}
