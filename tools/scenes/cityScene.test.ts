import { NodeIO } from "@gltf-transform/core";
import { expect, test } from "vitest";
import { createSchemaRegistry, isId, normalizeLevel, type PlainActor } from "../../src/core/index.ts";
import { composeMat4 } from "../../src/engine/math/affine.ts";
import { generateZones } from "../../src/engine/world/zoneGeneration.ts";
import { zoneOccluders } from "../../src/engine/world/zoneLevel.ts";
import { DirectionalLight } from "../../src/features/light/schema.ts";
import { Shape } from "../../src/features/shape/schema.ts";
import { StaticMesh } from "../../src/features/static-mesh/schema.ts";
import { cityModelGlb, cityModels } from "./cityModels.ts";
import { cityScene } from "./cityScene.ts";

test("the default city has the specified populations and reproducible, valid placement data", () => {
  const scene = cityScene();
  expect(JSON.stringify(cityScene())).toBe(JSON.stringify(scene));
  expect(scene.bounds).toEqual({ min: [0, -.28, 0], max: [768, 120, 768] });
  expect(scene.counts).toEqual({
    buildings: 252, indoorBuildings: 26, courtyards: 2, twoStorey: 2, landmarks: 1,
    furniture: (26 + 2) * 9 * 12, heavyFurniture: 0, lamps: 1152, benches: 576, bins: 576,
    hydrants: 300, signals: 324, shelters: 60, smallObjects: 20_000,
    trees: 2300, vehicles: 400, meshPlacements: 28_964, modelSlots: 125,
  });
  expect(scene.actors.filter(({ name }) => /Building \d+ Furniture/.test(name))).toHaveLength(26 * 9 * 12);
  expect(scene.poses.map(({ id }) => id)).toEqual(["street", "square", "inside", "threshold", "facade", "high"]);
  expect(scene.walk).toContainEqual(scene.poses.find(({ id }) => id === "inside")!.position);

  const registered = new Set(scene.models.map(({ id }) => id));
  expect(registered.size).toBe(45);
  expect(new Set(scene.actors.map(({ id }) => id)).size).toBe(scene.actors.length);
  const modelPlacements = scene.actors.filter(({ components }) => components.mesh !== undefined);
  expect(modelPlacements.every(({ components }) => {
    const id = components.mesh!.mesh;
    return isId(id, "asset") && registered.has(id);
  })).toBe(true);

  const registry = createSchemaRegistry();
  registry.registerComponent(DirectionalLight);
  registry.registerComponent(Shape);
  registry.registerComponent(StaticMesh);
  const normalized = normalizeLevel({ schema: "forge.level/1", id: `lvl_${"f".repeat(32)}`,
    settings: scene.settings, actors: scene.actors }, { strict: true, registry, resolveClass: () => undefined });
  expect(normalized.issues).toEqual([]);
  expect(normalized.value?.actors).toHaveLength(scene.actors.length);
});

test("building footprints are outside roads, sidewalks and street furniture", () => {
  const { actors } = cityScene({ seed: 28 });
  const buildings = actors.filter(({ name }) => /^Building \d+$/.test(name));
  const street = actors.filter(({ name }) => /^(lamp|bench|bin|hydrant|Traffic signal|shelter|Street tree|Parked vehicle)$/.test(name));
  const footprint = ({ transform: { p: [x, , z], s: [width, , depth], r } }: PlainActor) => {
    const rotated = Math.abs(r[1]) > .1 && Math.abs(r[3]) > .1;
    const hx = (rotated ? depth : width) / 2, hz = (rotated ? width : depth) / 2;
    return { left: x - hx, right: x + hx, near: z - hz, far: z + hz };
  };
  const streetBounds = street.map(footprint);
  for (const actor of buildings) {
    const { left, right, near, far } = footprint(actor);
    const col = Math.floor(actor.transform.p[0] / 96), row = Math.floor(actor.transform.p[2] / 96);
    expect(left).toBeGreaterThan(col * 96 + 8);
    expect(right).toBeLessThan((col + 1) * 96 - 8);
    expect(near).toBeGreaterThan(row * 96 + 8);
    expect(far).toBeLessThan((row + 1) * 96 - 8);
    expect(streetBounds.some(other => left < other.right && right > other.left && near < other.far && far > other.near)).toBe(false);
  }
});

test("the current zone generator finds nine rooms and twelve interior portals in the baseline building", () => {
  const { actors, poses } = cityScene({ blocks: 3, smallObjects: 0 });
  const { position: [x, , z] } = poses.find(({ id }) => id === "inside")!;
  const building = actors.find(({ name, transform }) => /^Building \d+$/.test(name)
    && transform.p[0] === x && transform.p[2] === z)!;
  const pieces = actors.filter(({ name }) => name.startsWith(`${building.name} `));
  const occluders = zoneOccluders(pieces.map(({ id, name, components, transform: { p, r, s } }) => ({
    id, name, components, world: composeMat4(p, r, s),
  })), () => ({ min: [-.5, -.5, -.5], max: [.5, .5, .5] }));
  const result = generateZones(occluders, { floorY: 0 });
  expect(result.zones).toHaveLength(9);
  expect(result.portals).toHaveLength(12);
  expect(generateZones(occluders, { floorY: 0 })).toEqual(result);
});

test("heavy mode changes half the furniture placements to 36,500-triangle assets", () => {
  const options = { blocks: 3, seed: 54, smallObjects: 0 };
  const scene = cityScene({ ...options, heavy: true });
  const heavyModels = new Set<string>(scene.models.filter(({ slots }) =>
    slots.reduce((sum, { triangles }) => sum + triangles, 0) === 36_500).map(({ id }) => id));
  const heavyActors = scene.actors.filter(({ components }) => heavyModels.has(components.mesh?.mesh as string));
  expect(heavyActors).toHaveLength(scene.counts.furniture / 2);
  expect(heavyActors).toHaveLength(scene.counts.heavyFurniture);
  expect(cityScene(options).counts.heavyFurniture).toBe(0);
  expect(cityScene({ ...options, seed: 55 }).actors).not.toEqual(cityScene(options).actors);
});

test("every normal and heavy model round-trips as a deterministic GLB with its exact slot triangle counts", async () => {
  const io = new NodeIO();
  const normal = cityScene({ blocks: 3 }).models;
  const heavy = cityModels(true).furniture.slice(8);
  for (const spec of [...normal, ...heavy]) {
    const bytes = cityModelGlb(spec);
    expect(Buffer.compare(bytes, cityModelGlb(spec)), spec.name).toBe(0);
    const doc = await io.readBinary(bytes);
    const primitives = doc.getRoot().listMeshes()[0]!.listPrimitives();
    expect(primitives).toHaveLength(spec.slots.length);
    for (const [index, primitive] of primitives.entries()) {
      const slot = spec.slots[index]!;
      const positions = primitive.getAttribute("POSITION")!.getArray()!;
      const normals = primitive.getAttribute("NORMAL")!.getArray()!;
      const indices = primitive.getIndices()!.getArray()!;
      expect(primitive.getMaterial()?.getName()).toBe(slot.name);
      expect(indices.length / 3).toBe(slot.triangles);
      expect(positions.length).toBe(normals.length);
      expect(positions.every(value => Number.isFinite(value) && Math.abs(value) <= .500001)).toBe(true);
      let degenerate = 0;
      for (let i = 0; i < indices.length; i += 3) {
        const a = 3 * indices[i]!, b = 3 * indices[i + 1]!, c = 3 * indices[i + 2]!;
        const ux = positions[b]! - positions[a]!, uy = positions[b + 1]! - positions[a + 1]!, uz = positions[b + 2]! - positions[a + 2]!;
        const vx = positions[c]! - positions[a]!, vy = positions[c + 1]! - positions[a + 1]!, vz = positions[c + 2]! - positions[a + 2]!;
        const facing = (uy * vz - uz * vy) * normals[a]! + (uz * vx - ux * vz) * normals[a + 1]!
          + (ux * vy - uy * vx) * normals[a + 2]!;
        if (!(facing > 0)) degenerate += 1;
      }
      expect(degenerate, `${spec.name} / ${slot.name}`).toBe(0);
    }
  }
});
