import { describe, expect, test } from "vitest";
import { BoxGeometry, Group, Mesh, MeshBasicNodeMaterial, PerspectiveCamera } from "three/webgpu";
import type { PuddleMaterial, PuddleReflection } from "../materials/puddle.ts";
import { PUDDLE_REFLECTION_SOURCES, PuddleReflections, type PuddleReflectionSettings, type PuddleSourceFactory } from "./puddleReflections.ts";

/** A capture factory without a GPU: counts what it makes and disposes. */
function factory() {
  const made: { level: number; quality: string; disposed: boolean }[] = [];
  const create: PuddleSourceFactory = (level, quality) => {
    const record = { level, quality, disposed: false };
    made.push(record);
    return { reflection: { node: record, texel: 1 }, target: new Group(), dispose: () => (record.disposed = true) };
  };
  return { made, create };
}

function surface(root: Group, x: number, level: number) {
  const mesh = new Mesh(new BoxGeometry(3, 0.01, 3), new MeshBasicNodeMaterial());
  mesh.position.set(x, level, -20);
  mesh.updateMatrixWorld();
  root.add(mesh);
  let current: PuddleReflection | null = null;
  const material = { setReflection: (next: PuddleReflection | null) => (current = next), get reflection() { return current; } } as unknown as PuddleMaterial;
  return { mesh, material, reflected: () => current };
}

const planar = (level: number, quality: PuddleReflectionSettings["quality"] = "high"): PuddleReflectionSettings => ({ level, mode: "planar", quality, planarStrength: 1 });

function camera(): PerspectiveCamera {
  const cam = new PerspectiveCamera(60, 1, 0.1, 500);
  cam.position.set(2, 10, -10);
  cam.lookAt(2, 0, -20);
  cam.updateMatrixWorld();
  return cam;
}

describe("puddle reflections (Forge's PuddlePlanarReflections rules)", () => {
  test("puddles at one level share a capture; at most two captures; the quality ceiling lowers them", () => {
    const root = new Group();
    const { made, create } = factory();
    const reflections = new PuddleReflections(root, create);
    const a = surface(root, -3, 0.5);
    const b = surface(root, 0.5, 0.5);
    const c = surface(root, 4, 1.25);
    const d = surface(root, 7.5, 2);
    reflections.set(a.mesh, a.material, planar(0.5));
    reflections.set(b.mesh, b.material, planar(0.5));
    reflections.set(c.mesh, c.material, planar(1.25));
    reflections.set(d.mesh, d.material, planar(2));
    reflections.update(camera(), 0);
    expect(reflections.sourceCount).toBe(PUDDLE_REFLECTION_SOURCES);
    expect(a.reflected()).not.toBeNull();
    expect(b.reflected()).toBe(a.reflected());
    expect([a, b, c, d].filter((s) => s.reflected() !== null)).toHaveLength(3);
    expect(made.every((record) => record.quality === "high")).toBe(true);

    // The profile's medium tier: the captures are remade at medium.
    reflections.setCeiling("medium");
    reflections.update(camera(), 1);
    expect(made.filter((record) => !record.disposed).every((record) => record.quality === "medium")).toBe(true);
    // Off: nothing reflects and every capture is given back.
    reflections.setCeiling("off");
    expect(reflections.sourceCount).toBe(0);
    expect([a, b, c, d].every((s) => s.reflected() === null)).toBe(true);
    expect(made.every((record) => record.disposed)).toBe(true);
  });

  test("environment mode, low quality, zero strength or a hidden surface take no capture; removal gives it back", () => {
    const root = new Group();
    const { made, create } = factory();
    const reflections = new PuddleReflections(root, create);
    const a = surface(root, 0, 0.5);
    const view = camera();
    for (const settings of [{ ...planar(0.5), mode: "environment" as const }, planar(0.5, "low"), { ...planar(0.5), planarStrength: 0 }]) {
      reflections.set(a.mesh, a.material, settings);
      reflections.update(view, 0);
      expect(reflections.sourceCount).toBe(0);
    }
    reflections.set(a.mesh, a.material, planar(0.5));
    a.mesh.visible = false;
    reflections.update(view, 0);
    expect(reflections.sourceCount).toBe(0);
    a.mesh.visible = true;
    // Within 0.1 s nothing is chosen again, unless something changed.
    reflections.update(view, 50);
    expect(reflections.sourceCount).toBe(0);
    reflections.update(view, 200);
    expect(reflections.sourceCount).toBe(1);
    reflections.remove(a.mesh);
    expect(a.reflected()).toBeNull();
    expect(made.at(-1)!.disposed).toBe(true);
  });

  test("a group under 1 % of the screen takes no capture", () => {
    const root = new Group();
    const { create } = factory();
    const reflections = new PuddleReflections(root, create);
    const far = surface(root, 0, 0.5);
    far.mesh.scale.set(0.02, 1, 0.02);
    far.mesh.position.set(0, 0.5, -200);
    far.mesh.updateMatrixWorld();
    reflections.set(far.mesh, far.material, planar(0.5));
    reflections.update(camera(), 0);
    expect(reflections.sourceCount).toBe(0);
  });
});
