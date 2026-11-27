import { createServiceKey, type Vec2 } from "../../core/index.ts";
import type { ActionMap, ActionState, AxisModifiers } from "./actionMap.ts";

export interface InputService {
  get(action: string): ActionState;
  axis(axis: string): number;
  /** Mouse displacement in CSS pixels collected for the current frame. */
  pointerDelta(): Readonly<Vec2>;
  bind(code: string, action: string): void;
  bindAxis(code: string, axis: string, modifiers?: AxisModifiers): void;
  /** The next pointer gesture acquires pointer lock while enabled. */
  setPointerLock(enabled: boolean): void;
  setTouchEnabled(enabled: boolean): void;
}

export interface InputSource {
  poll(): Readonly<Vec2>;
  setPointerLock(enabled: boolean): void;
  setTouchEnabled(enabled: boolean): void;
  dispose(): void;
}

export type InputHost = (actions: ActionMap) => InputSource;

export const InputServiceKey = createServiceKey<InputService>("forge.input");
export const InputHostKey = createServiceKey<InputHost>("forge.input.host");
