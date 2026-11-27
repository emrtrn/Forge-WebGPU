import type { Vec2 } from "../../core/index.ts";
import type { InputHost } from "../../engine/input/inputService.ts";
import { GamepadInputSource } from "./gamepadInputSource.ts";
import { TouchInputSource } from "./touchInputSource.ts";

export function createBrowserInput(host: HTMLElement, target: Window): InputHost {
  return (actions) => {
    const document = host.ownerDocument;
    const scope = new AbortController();
    const { signal } = scope;
    const gamepad = new GamepadInputSource(actions, {
      getGamepads: () => document.hasFocus() ? target.navigator.getGamepads?.() ?? [] : [],
    });
    gamepad.attach();
    let touch: TouchInputSource | null = null;
    let pointerLock = false;
    let pointer: Vec2 = [0, 0];
    const mouseButtons = new Set<string>();

    const releasePointer = () => {
      for (const code of mouseButtons) actions.handleUp(code);
      mouseButtons.clear();
      pointer = [0, 0];
    };
    const blur = () => {
      releasePointer();
      actions.reset();
      gamepad.detach();
      touch?.setVisible(false);
    };
    target.addEventListener("keydown", (event) => {
      const element = event.target as Element | null;
      if (!event.repeat && !element?.closest?.("input, textarea, select, [contenteditable='true']")) actions.handleDown(event.code);
    }, { signal });
    target.addEventListener("keyup", (event) => actions.handleUp(event.code), { signal });
    target.addEventListener("blur", blur, { signal });
    target.addEventListener("focus", () => touch?.setVisible(true), { signal });
    host.addEventListener("pointerdown", (event) => {
      if (event.pointerType === "touch") return;
      if (pointerLock && document.pointerLockElement !== host) {
        if (event.button === 0) {
          try { void Promise.resolve(host.requestPointerLock()).catch(() => {}); }
          catch { /* Unsupported pointer lock leaves the cursor available. */ }
        }
        return;
      }
      const code = `Mouse${event.button}`;
      actions.handleDown(code);
      mouseButtons.add(code);
    }, { signal });
    target.addEventListener("pointerup", (event) => {
      if (event.pointerType === "touch") return;
      const code = `Mouse${event.button}`;
      actions.handleUp(code);
      mouseButtons.delete(code);
    }, { signal });
    target.addEventListener("pointercancel", releasePointer, { signal });
    document.addEventListener("pointerlockchange", () => {
      if (document.pointerLockElement !== host) releasePointer();
    }, { signal });
    document.addEventListener("pointermove", (event) => {
      if (document.pointerLockElement !== host) return;
      pointer[0] += event.movementX;
      pointer[1] += event.movementY;
    }, { signal });
    host.addEventListener("contextmenu", (event) => {
      if (pointerLock) event.preventDefault();
    }, { signal });

    return {
      poll() {
        gamepad.poll();
        const delta = pointer;
        pointer = [0, 0];
        return delta;
      },
      setPointerLock(enabled) {
        pointerLock = enabled;
        if (!enabled && document.pointerLockElement === host) document.exitPointerLock();
      },
      setTouchEnabled(enabled) {
        if (!enabled) {
          touch?.detach();
          touch = null;
        } else if (!touch && target.navigator.maxTouchPoints > 0) {
          touch = new TouchInputSource(actions, host);
          touch.attach();
        }
      },
      dispose() {
        scope.abort();
        blur();
        touch?.detach();
        if (document.pointerLockElement === host) document.exitPointerLock();
      },
    };
  };
}
