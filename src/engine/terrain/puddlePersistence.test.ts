// Ported from Forge WebGL tests/engine/puddlePersistence.test.ts @ forge-webgl-final (04b5fb23): checks unchanged, run by
// Vitest; 15 check(s) not yet portable left out. docs/PORT_LOG.md §2.
import assert from "node:assert/strict";
import { PuddleWindMotion } from "../environment/puddleWind.ts";
import { resolveLevelWind } from "../environment/wind.ts";
import { puddleRippleStops } from "./puddleInteraction.ts";
import type { PuddleWaterBody } from "./puddleWater.ts";
import { test } from "vitest";


const body = (): PuddleWaterBody => ({ schema: 1, kind: "puddle", coordinateSpace: "world", id: "puddle-1", name: "Courtyard",
  terrainRef: "terrain", seed: [30, 0], bounds: { min: [24, -6], max: [36, 6] }, surfaceLevel: 10.2,
  hidden: false, locked: false, appearance: { color: "#504a35", opacity: .8, roughness: .2, reflectionStrength: 1,
    reflectionMode: "sharedPlanar", reflectionQuality: "high", planarReflectionStrength: .7 } });

export async function registerPuddlePersistenceTests(check: (label: string, fn: () => Promise<void>) => Promise<void>): Promise<void> {
  await check("puddle wind: time integration pauses, stays continuous on strength edits and follows global wind", async () => {
    const motion = new PuddleWindMotion(), east = resolveLevelWind({ worldSettings: { wind: { directionDeg: 90, strength: 1, gust: 0 } } }, null);
    motion.update(east, 100); motion.update(east, 101);
    assert.ok(motion.offset[0]! > 0); assert.ok(Math.abs(motion.offset[1]!) < 1e-12);
    const before = [...motion.offset], crestPhase = motion.phase;
    motion.update(east, 101); assert.deepEqual(motion.offset, before, "pause freezes travel"); assert.equal(motion.phase, crestPhase);
    motion.update({ ...east, strength: .2 }, 101, { windSpeedResponse: 3 });
    assert.deepEqual(motion.offset, before, "new speed/strength never jumps absolute phase");
    assert.equal(motion.phase, crestPhase, "curved crests keep phase when speed/strength changes");
    motion.update({ ...east, strength: 0 }, 102); assert.equal(motion.strength, 0); assert.deepEqual(motion.offset, before);
    motion.update(east, 103, { windRipplesEnabled: false }); assert.equal(motion.strength, 0);
    motion.update(east, 104); assert.ok(motion.strength > 0);
    const still = [...motion.offset]; motion.update(east, 104, { windSpeedResponse: 0 }); assert.deepEqual(motion.offset, still);
    motion.update(east, 105, { windSpeedResponse: 0 }); assert.deepEqual(motion.offset, still);
    const frames = [30, 60, 144].map(hz => {
      const m = new PuddleWindMotion(); for (let i = 0; i <= hz; i++) m.update(east, i / hz); return m.offset;
    });
    for (const frame of frames) frame.forEach((v, i) => assert.ok(Math.abs(v - frames[0]![i]!) < 1e-10));
  });
  await check("puddle wheel ripples: conservative sectors stop at narrow islands and complexity limit", async () => {
    const shore = new Float32Array([-4,-4,4,-4, 4,-4,4,4, 4,4,-4,4, -4,4,-4,-4]);
    const open = puddleRippleStops(0, 0, shore, 10); assert.ok(open.every(v => v >= 3.99 && v < 5.7));
    const island = new Float32Array([...shore, 1,.01,1,.02]);
    const blocked = puddleRippleStops(0, 0, island, 10);
    assert.ok(blocked[0]! < 1.01, "an island between centre rays blocks the whole sector");
    assert.equal(blocked[16], open[16]);
    assert.ok(puddleRippleStops(0,0,new Float32Array(4100),10).every(v => v === 0));
  });
}

await registerPuddlePersistenceTests(test as unknown as Parameters<typeof registerPuddlePersistenceTests>[0]);
