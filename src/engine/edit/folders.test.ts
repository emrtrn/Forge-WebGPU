import { describe, expect, test } from "vitest";
import type { ActorDoc, ActorId } from "../../core/index.ts";
import { actorId, createOptions } from "../../core/level/testKit.ts";
import { groupActors, ungroupActors, type OpsContext } from "./actorOps.ts";
import { moveToFolder, rebaseFolderActors, withFolder } from "./folders.ts";

const doc = (seed: string, folder = "", parent: string | null = null, x = 0): ActorDoc => ({
  id: actorId(seed), name: seed, class: null, parent: parent === null ? null : actorId(parent), spatiallyLoaded: true,
  transform: { p: [x, 0, 0], r: [0, 0, 0, 1], s: [1, 1, 1] }, components: {}, ...(folder === "" ? {} : { folder }),
});
const lookup = (docs: readonly ActorDoc[]) => (id: ActorId) => docs.find((one) => one.id === id);
const brief = (docs: readonly ActorDoc[]) => docs.map((one) => [one.name, one.folder ?? "", one.parent]);

describe("Outliner folder edits", () => {
  const LEVEL = [doc("a", "World/Fences", null, 5), doc("b", "World/Fences/Old"), doc("c", "", "a", 1), doc("d", "Worlds")];

  test("roots go into the folder; a child leaves its parent and keeps its place; an actor already there is no change", () => {
    const moved = moveToFolder(lookup(LEVEL), [actorId("c"), actorId("d")], "Props");
    expect(brief(moved)).toEqual([["c", "Props", null], ["d", "Props", null]]);
    expect(moved[0]!.transform.p).toEqual([6, 0, 0]);
    // A selected child follows its selected parent.
    expect(brief(moveToFolder(lookup(LEVEL), [actorId("a"), actorId("c")], ""))).toEqual([["a", "", null]]);
    expect(moveToFolder(lookup(LEVEL), [actorId("a")], "World/Fences")).toEqual([]);
    expect(withFolder(LEVEL[0]!, "")).not.toHaveProperty("folder");
  });

  test("a folder's actors follow it with their subfolders; a folder whose name only starts the same does not", () => {
    expect(brief(rebaseFolderActors(LEVEL, "World/Fences", "World/Walls"))).toEqual([["a", "World/Walls", null], ["b", "World/Walls/Old", null]]);
    expect(brief(rebaseFolderActors(LEVEL, "World", ""))).toEqual([["a", "Fences", null], ["b", "Fences/Old", null]]);
  });

  test("a group takes the folder its members share, and ungrouping (nested too) leaves them in it", () => {
    const options = createOptions(true);
    const context = (docs: readonly ActorDoc[]): OpsContext => ({ lookup: lookup(docs), actors: () => docs, registry: options.registry, resolveClass: options.resolveClass });
    const docs = [doc("a", "Props"), doc("b", "Props"), doc("e", "Other")];
    expect(groupActors(context(docs), [actorId("a"), actorId("e")])!.group).not.toHaveProperty("folder");
    const inner = groupActors(context(docs), [actorId("a"), actorId("b")])!;
    expect(inner.group.folder).toBe("Props");
    const outer = doc("f", "Kept");
    const nested = [outer, ...inner.docs.map((one) => (one.id === inner.group.id ? { ...one, parent: outer.id } : one))];
    expect(brief(ungroupActors(context(nested), [outer.id, inner.group.id])!.docs)).toEqual([["a", "Kept", null], ["b", "Kept", null]]);
  });
});
