import { describe, expect, test } from "vitest";
import type { ActorDoc, ActorId, Transform } from "../../core/index.ts";
import { actorId } from "../../core/level/testKit.ts";
import { composeMat4, decomposeMat4, transformPoint } from "../../engine/math/affine.ts";
import { eulerDegreesToQuaternion } from "../../engine/math/euler.ts";
import { isSelfOrAncestor, reparentActors, worldMatrixOf } from "./hierarchy.ts";

const doc = (seed: string, parent: string | null, transform: Partial<Transform>): ActorDoc => ({
  id: actorId(seed),
  name: seed,
  class: null,
  parent: parent === null ? null : actorId(parent),
  spatiallyLoaded: true,
  transform: { p: [0, 0, 0], r: [0, 0, 0, 1], s: [1, 1, 1], ...transform },
  components: {},
});

// g turned 90° about Y at (10, 0, 0), scaled 2; a under it; b at the root; c under a.
const turned = eulerDegreesToQuaternion([0, 90, 0]);
const LEVEL = [doc("g", null, { p: [10, 0, 0], r: turned, s: [2, 2, 2] }), doc("a", "g", { p: [1, 0, 0] }), doc("b", null, { p: [0, 3, 0] }), doc("c", "a", { p: [0, 1, 0] })];
const lookup = (docs: readonly ActorDoc[]) => (id: ActorId) => docs.find((one) => one.id === id);
const near = (actual: readonly number[], expected: readonly number[]) => actual.forEach((value, index) => expect(value).toBeCloseTo(expected[index]!, 9));
const worldPoint = (docs: readonly ActorDoc[], seed: string) => transformPoint(worldMatrixOf(lookup(docs), lookup(docs)(actorId(seed))!), [0, 0, 0]);
const apply = (docs: readonly ActorDoc[], edited: readonly ActorDoc[]) => docs.map((one) => edited.find((next) => next.id === one.id) ?? one);

describe("parenting keeps the world placement (INV-A08)", () => {
  test("an actor moved under a turned, scaled parent and back to the root stays where it was", () => {
    const before = worldMatrixOf(lookup(LEVEL), LEVEL[2]!);
    const under = reparentActors(lookup(LEVEL), [actorId("b")], actorId("g"));
    expect(under.refused).toEqual([]);
    const level = apply(LEVEL, under.docs);
    near(worldMatrixOf(lookup(level), lookup(level)(actorId("b"))!), before);
    expect(under.docs[0]!.transform.s).toEqual([0.5, 0.5, 0.5]);
    const back = reparentActors(lookup(level), [actorId("b")], null);
    expect(back.docs[0]!.transform).toEqual({ p: [0, 3, 0], r: [0, 0, 0, 1], s: [1, 1, 1] });
  });

  test("only the roots of the given actors move; a child follows and keeps its own transform", () => {
    const result = reparentActors(lookup(LEVEL), [actorId("c"), actorId("a")], actorId("b"));
    expect(result.docs.map((one) => one.name)).toEqual(["a"]);
    const level = apply(LEVEL, result.docs);
    near(worldPoint(level, "c"), worldPoint(LEVEL, "c"));
  });

  test("an actor cannot go under itself or its descendant; one already there is no change", () => {
    const result = reparentActors(lookup(LEVEL), [actorId("g"), actorId("b")], actorId("c"));
    expect(result.refused).toEqual([actorId("g")]);
    expect(result.docs.map((one) => one.name)).toEqual(["b"]);
    expect(reparentActors(lookup(LEVEL), [actorId("a")], actorId("g")).docs).toEqual([]);
    expect(isSelfOrAncestor(lookup(LEVEL), actorId("g"), actorId("c"))).toBe(true);
    expect(isSelfOrAncestor(lookup(LEVEL), actorId("b"), actorId("c"))).toBe(false);
  });

  test("the written numbers carry no float noise", () => {
    const rotated = [doc("p", null, { p: [0.1, 0.2, 0.3], r: eulerDegreesToQuaternion([0, 30, 0]) }), doc("q", null, { p: [0.7, 0, 0] })];
    const result = reparentActors(lookup(rotated), [actorId("q")], actorId("p"));
    const back = reparentActors(lookup(apply(rotated, result.docs)), [actorId("q")], null);
    expect(back.docs[0]!.transform.p).toEqual([0.7, 0, 0]);
    expect(decomposeMat4(composeMat4([1, 2, 3], [0, 0, 0, 1], [1, 1, 1])).p).toEqual([1, 2, 3]);
  });
});
