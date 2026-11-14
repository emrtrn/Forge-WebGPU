import { expect, test } from "vitest";
import { isEditableTarget, shortcutOf } from "./shortcuts.ts";

const key = (code: string, mods: Partial<{ ctrlKey: boolean; metaKey: boolean; altKey: boolean; shiftKey: boolean }> = {}) => ({ code, ctrlKey: false, metaKey: false, altKey: false, shiftKey: false, ...mods });

test("Forge's keys: Ctrl (or Cmd) actions, plain keys, Shift + H / G; Alt is never a shortcut", () => {
  expect(shortcutOf(key("KeyD", { ctrlKey: true }))).toBe("duplicate");
  expect(shortcutOf(key("KeyZ", { metaKey: true }))).toBe("undo");
  expect(shortcutOf(key("KeyZ", { ctrlKey: true, shiftKey: true }))).toBe("redo");
  expect(shortcutOf(key("KeyC", { ctrlKey: true }))).toBe("copy");
  expect(shortcutOf(key("KeyX"))).toBe("toggleSpace");
  expect(shortcutOf(key("KeyX", { ctrlKey: true }))).toBe("cut");
  expect(shortcutOf(key("Delete"))).toBe("delete");
  expect(shortcutOf(key("KeyH", { shiftKey: true }))).toBe("showHidden");
  expect(shortcutOf(key("KeyG", { shiftKey: true }))).toBe("ungroup");
  expect(shortcutOf(key("KeyW", { altKey: true }))).toBeNull();
  expect(shortcutOf(key("KeyK"))).toBeNull();
});

test("a field the user types into keeps its keys", () => {
  expect(isEditableTarget({ tagName: "INPUT" } as unknown as EventTarget)).toBe(true);
  expect(isEditableTarget({ tagName: "DIV", isContentEditable: true } as unknown as EventTarget)).toBe(true);
  expect(isEditableTarget({ tagName: "DIV", isContentEditable: false } as unknown as EventTarget)).toBe(false);
  expect(isEditableTarget(null)).toBe(false);
});
