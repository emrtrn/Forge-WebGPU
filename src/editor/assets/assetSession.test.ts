import { describe, expect, test } from "vitest";
import { array, createSchemaRegistry, defineJsonAssetType, num, object, text, type SaveClient, type SaveRequestBody, type SaveResponseBody } from "../../core/index.ts";
import { assetDocumentAdapter, type EditableAsset } from "./assetDocument.ts";
import { openAssetSession } from "./assetSession.ts";
import { visibleTableRows } from "./assetTable.ts";

const id = `ast_${"1".repeat(32)}`;
const type = defineJsonAssetType("test.values", 1, { suffix: ".values.json", fields: {
  amount: num({ default: 1, min: 0, max: 10 }), rows: array(object({ label: text(), value: num({ default: 0 }) })),
} });
function fixture(writable = true) {
  const registry = createSchemaRegistry(); registry.registerAssetType(type);
  const asset: EditableAsset = { id, type: type.name, file: "content/test.values.json", name: "Test", writable };
  let disk = { schema: "test.values/1", id, amount: 1, rows: [{ label: "A", value: 2 }] };
  let revision = "0000000000000001", fail: SaveResponseBody | null = null;
  const requests: SaveRequestBody[] = [];
  const client: SaveClient = {
    read: async () => ({ text: JSON.stringify(disk), revision }),
    save: async (request) => {
      requests.push(request);
      if (fail) return fail;
      disk = JSON.parse(request.writes[0]!.text!); revision = "0000000000000002";
      return { status: "saved", files: [{ path: asset.file, revision }], warnings: [] };
    },
    identity: async () => { throw new Error("unused"); }, classes: async () => [], stageBinary: async () => { throw new Error("unused"); },
    play: async () => { throw new Error("unused"); }, playSession: async () => { throw new Error("unused"); },
  };
  return { open: () => openAssetSession(asset, assetDocumentAdapter(asset, registry)!, client), requests,
    fail: (result: SaveResponseBody) => { fail = result; }, disk: () => disk,
  };
}

describe("asset documents have their own edit/save session", () => {
  test("one slider gesture is one undo; untouched arrays are shared", async () => {
    const session = await fixture().open(); const rows = session.value().rows;
    session.edit("Amount", ["amount"], 2, "input"); session.edit("Amount", ["amount"], 3, "input"); session.edit("Amount", ["amount"], 3, "commit");
    expect(session.value().rows).toBe(rows); expect(session.dirty()).toBe(true);
    session.undo(); expect(session.value().amount).toBe(1); expect(session.dirty()).toBe(false); expect(session.canUndo()).toBe(false);
    session.redo(); expect(session.value().amount).toBe(3);
    session.edit("Amount", ["amount"], 4); session.undo(); expect(session.value().amount).toBe(3);
  });
  test("canonical save keeps the envelope and reads the saved revision", async () => {
    const fix = fixture(), session = await fix.open(); session.edit("Amount", ["amount"], 99);
    expect(await session.save()).toMatchObject({ ok: true }); expect(session.value().amount).toBe(10);
    expect(session.value().id).toBe(id); expect(session.revision()).toBe("0000000000000002"); expect(session.dirty()).toBe(false);
    expect(fix.requests[0]!.writes[0]).toMatchObject({ path: "content/test.values.json", base: "0000000000000001" });
    expect(session.canUndo()).toBe(false);
  });
  test("a 409 or refused document keeps the draft and history", async () => {
    for (const failure of [{ status: "conflict", conflicts: [] }, { status: "rejected", reason: "document", message: "invalid" }] as SaveResponseBody[]) {
      const fix = fixture(), session = await fix.open(); fix.fail(failure); session.edit("Amount", ["amount"], 4);
      expect(await session.save()).toMatchObject({ ok: false }); expect(session.dirty()).toBe(true); expect(session.canUndo()).toBe(true);
      expect(session.value().amount).toBe(4); expect(fix.disk().amount).toBe(1);
      await session.reload(); expect(session.dirty()).toBe(false); expect(session.value().amount).toBe(1);
    }
  });
  test("validation, read-only and envelope changes never write", async () => {
    const fix = fixture(), session = await fix.open();
    expect(session.edit("Identity", ["id"], "other")).toBe(false);
    expect(session.edit("Identity", [], { ...session.value(), id: "other" })).toBe(false);
    session.edit("Amount", ["amount"], "invalid"); expect(await session.save()).toMatchObject({ ok: false }); expect(fix.requests).toHaveLength(0);
    const readonly = await fixture(false).open(); expect(readonly.edit("Amount", ["amount"], 3)).toBe(false); expect(await readonly.save()).toMatchObject({ ok: false });
  });
  test("array operations and edits across form/table are the same history", async () => {
    const session = await fixture().open(); session.edit("Cell", ["rows", 0, "value"], 7);
    session.edit("Add", ["rows"], [...session.value().rows as unknown[], { label: "B", value: 8 }]);
    session.undo(); expect(session.value().rows).toEqual([{ label: "A", value: 7 }]); session.undo(); expect(session.dirty()).toBe(false);
  });
  test("a 1,000 row table only asks for the visible range", () => {
    expect(visibleTableRows(1000, 0, 360)).toEqual({ start: 0, end: 11 });
    const end = visibleTableRows(1000, 72000, 360); expect(end.end).toBe(1000); expect(end.end - end.start).toBeLessThan(200);
  });
});
