import { readFileSync } from "node:fs";
import { expect, test as check } from "vitest";
import { normalizeJsonAsset } from "../../core/index.ts";
import { readSaveGameUiCommand, SAVE_GAME_UI_SLOTS } from "../../engine/persistence/saveGameSlots.ts";
import { collectUiBindings } from "../../engine/ui/uiBinding.ts";
import { readUiAction, type UiNode } from "../../engine/ui/uiWidget.ts";
import { UiWidget } from "./schema.ts";
import { widgetFromData } from "./widgetData.ts";

function readWidget(name: string) {
  const url = new URL(`../../../content/packs/starter/ui/${name}.ui.json`, import.meta.url);
  const result = normalizeJsonAsset(UiWidget, JSON.parse(readFileSync(url, "utf8")), { strict: true });
  expect(result.issues).toEqual([]);
  return widgetFromData(result.value!);
}

function messages(node: UiNode): string[] {
  const action = readUiAction(node);
  return [...(action?.type === "message" ? [action.message] : []), ...node.children.flatMap(messages)];
}

check("starter save/load UI asset binds slots and emits reserved save messages", () => {
  const menu = readWidget("Checkpoint");
  const emitted = messages(menu.root).filter((message) => message !== "menu:resume");
  for (const { slot } of SAVE_GAME_UI_SLOTS) {
    expect(emitted).toEqual(expect.arrayContaining([`save:write:${slot}`, `save:load:${slot}`, `save:delete:${slot}`]));
  }
  expect(emitted.every((message) => readSaveGameUiCommand(message) !== null)).toBe(true);
  const paths = collectUiBindings(menu).flatMap(({ binds }) => binds.map(({ path }) => path));
  expect(paths).toEqual(expect.arrayContaining(["save.slots.quick.status", "save.slots.slot-1.level", "save.slots.slot-2.label"]));
  expect(collectUiBindings(readWidget("HUD")).flatMap(({ binds }) => binds.map(({ path }) => path))).toEqual(["player.speedLabel"]);
});
