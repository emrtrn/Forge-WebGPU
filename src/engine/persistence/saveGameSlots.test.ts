// Ported from Forge WebGL tools/engine-tests.ts @ forge-webgl-final (04b5fb23): each check is
// copied unchanged and runs as a Vitest test; docs/PORT_LOG.md §2. By hand: the level path is a slot
// label string here, not content the check reads.
import assert from "node:assert/strict";
import { buildSaveGameUiFields, emptySaveGameUiSlots, readSaveGameUiCommand } from "./saveGameSlots.ts";
import { test } from "vitest";

const check = test;

check("save-game UI commands and ViewModel fields stay slot-scoped", () => {
  assert.deepEqual(readSaveGameUiCommand("save:write:quick"), { kind: "write", slot: "quick" });
  assert.deepEqual(readSaveGameUiCommand("save:load:slot-1"), { kind: "load", slot: "slot-1" });
  assert.deepEqual(readSaveGameUiCommand("save:delete:slot-2"), { kind: "delete", slot: "slot-2" });
  assert.equal(readSaveGameUiCommand("save:load:unknown"), null);
  assert.equal(readSaveGameUiCommand("travel:foo"), null);

  const fields = buildSaveGameUiFields([
    {
      slot: "quick",
      label: "Quick Save",
      updatedAt: "2026-07-02T10:30:00.000Z",
      levelPath: "assets/starter-content/Levels/Playground.level.json",
    },
    ...emptySaveGameUiSlots().slice(1),
  ]);
  assert.equal(fields["save.slots.quick.label"], "Quick Save");
  assert.match(String(fields["save.slots.quick.status"]), /^Saved /);
  assert.equal(fields["save.slots.quick.level"], "Playground.level.json");
  assert.equal(fields["save.slots.slot-1.status"], "Empty");
  assert.equal(fields["save.slots.slot-1.level"], "No saved level");
});
