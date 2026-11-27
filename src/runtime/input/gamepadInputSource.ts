// Ported from Forge WebGL input sources.
import type { ActionMap } from "../../engine/input/actionMap.ts";
import {
  GAMEPAD_AXIS_BINDINGS,
  GAMEPAD_BUTTON_BINDINGS,
  firstConnectedGamepad,
  readGamepadCodes,
  type GamepadSnapshotLike,
} from "../../engine/input/gamepadInput.ts";

/** The slice of `navigator` this source needs (injectable for tests). */
export interface GamepadProvider {
  getGamepads(): ReadonlyArray<GamepadSnapshotLike | null>;
}

/**
 * Gamepad → {@link ActionMap} bridge (runtime DOM layer).
 *
 * Unlike keyboard/pointer sources the Gamepad API is poll-only, so the runtime
 * loop calls {@link poll} once per frame before the input subsystem advances.
 * On {@link attach} it installs the gamepad button/axis bindings on the shared
 * action map (additive — keyboard bindings stay intact); each poll diffs the
 * pressed codes against the previous frame to emit down/up edges and feeds the
 * right stick as analog look axes. Disconnect releases everything so a held
 * button or deflected stick can't stick.
 */
export class GamepadInputSource {
  private prevDown = new Set<string>();
  private connected = false;

  private readonly actions: ActionMap;
  private readonly provider: GamepadProvider;

  constructor(actions: ActionMap, provider: GamepadProvider = navigator) {
    this.actions = actions;
    this.provider = provider;
  }

  /** Installs the gamepad bindings on the action map. Safe to call once at boot. */
  attach(): void {
    for (const [code, action] of Object.entries(GAMEPAD_BUTTON_BINDINGS)) {
      this.actions.bind(code, action);
    }
    for (const [code, binding] of Object.entries(GAMEPAD_AXIS_BINDINGS)) {
      if (typeof binding === "string") this.actions.bindAxis(code, binding);
      else this.actions.bindAxis(code, binding.axis, binding);
    }
  }

  /** Polls the first connected gamepad and feeds the action map. Call per frame. */
  poll(): void {
    const pad = firstConnectedGamepad(this.provider.getGamepads());
    if (!pad) {
      if (this.connected) this.clear();
      return;
    }
    this.connected = true;
    const { down, axes } = readGamepadCodes(pad);
    const downSet = new Set(down);
    for (const code of downSet) if (!this.prevDown.has(code)) this.actions.handleDown(code);
    for (const code of this.prevDown) if (!downSet.has(code)) this.actions.handleUp(code);
    this.prevDown = downSet;
    for (const [code, value] of axes) this.actions.handleAxis(code, value);
  }

  detach(): void {
    this.clear();
  }

  /** Releases all held codes + zeroes the look axes (disconnect / teardown). */
  private clear(): void {
    for (const code of this.prevDown) this.actions.handleUp(code);
    this.prevDown.clear();
    for (const code of Object.keys(GAMEPAD_AXIS_BINDINGS)) this.actions.handleAxis(code, 0);
    this.connected = false;
  }
}
