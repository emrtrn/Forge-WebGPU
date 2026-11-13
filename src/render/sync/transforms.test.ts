import { describe, expect, test } from "vitest";
import { Vector3 } from "three/webgpu";
import type { ActorId, WorldActor } from "../../core/index.ts";
import { actorWorldMatrix, componentWorldMatrix } from "./transforms.ts";

const at = (p: [number, number, number]): WorldActor["transform"] => ({ p, r: [0, 0, 0, 1], s: [1, 1, 1] });
// 90 degrees about +Y.
const TURN_Y: [number, number, number, number] = [0, Math.SQRT1_2, 0, Math.SQRT1_2];

function actor(id: string, parent: string | null, transform: WorldActor["transform"], components: WorldActor["components"] = {}): WorldActor {
  return { id: id as ActorId, name: id, parent: parent as ActorId | null, transform, components, origin: "level" };
}

function origin(matrix: { elements: readonly number[] }): number[] {
  return new Vector3().setFromMatrixPosition(matrix as never).toArray().map((value) => Math.round(value * 1e6) / 1e6 + 0);
}

describe("world matrices", () => {
  test("an actor's transform is relative to its parent actor", () => {
    const root = actor("a", null, { p: [10, 0, 0], r: TURN_Y, s: [2, 2, 2] });
    const child = actor("b", "a", { p: [1, 0, 0], r: [0, 0, 0, 1], s: [1, 1, 1] });
    const world = { actor: (id: ActorId) => [root, child].find((one) => one.id === id) };
    // Parent turns +X onto -Z and doubles it: (10, 0, 0) + (0, 0, -2).
    expect(origin(actorWorldMatrix(world, child))).toEqual([10, 0, -2]);
  });

  test("a component's local follows its parent component up to the actor root", () => {
    const owner = actor("a", null, { p: [0, 1, 0], r: [0, 0, 0, 1], s: [1, 1, 1] }, {
      arm: { type: "test.shape@1", parent: null, local: { p: [0, 0, 3], r: TURN_Y, s: [1, 1, 1] } },
      hand: { type: "test.shape@1", parent: "arm", local: { p: [1, 0, 0], r: [0, 0, 0, 1], s: [1, 1, 1] } },
    });
    const world = { actor: () => undefined };
    expect(origin(componentWorldMatrix(world, owner, "arm"))).toEqual([0, 1, 3]);
    // The arm's turn sends the hand's +X onto -Z.
    expect(origin(componentWorldMatrix(world, owner, "hand"))).toEqual([0, 1, 2]);
  });

  test("a parent cycle in broken data ends instead of looping", () => {
    const a = actor("a", "b", at([1, 0, 0]));
    const b = actor("b", "a", at([0, 1, 0]));
    const world = { actor: (id: ActorId) => (id === a.id ? a : b) };
    expect(origin(actorWorldMatrix(world, a))).toEqual([1, 1, 0]);
  });
});
