import assert from "node:assert/strict";
import { test } from "vitest";
import { createStream, hashString, streamSeed } from "./random.ts";

test("versioned random primitives retain their reference sequence", () => {
  assert.equal(hashString("çınar"), 3326547272);
  assert.equal(streamSeed(42, "tree"), 884893347);
  const stream = createStream(42, "tree");
  assert.deepEqual(Array.from({ length: 5 }, () => stream.next()), [
    0.00922886817716062, 0.7677172925323248, 0.11640255548991263, 0.2293301287572831, 0.15360926580615342,
  ]);
});

test("streams replay, fork independently of parent state, and isolate new child paths", () => {
  const parent = createStream(42, "tree");
  const baseline = createStream(42, "tree");
  const samples = (stream: ReturnType<typeof createStream>): number[] => Array.from({ length: 32 }, () => stream.next());
  const branch = samples(parent.fork("branch/0"));
  samples(parent.fork("new/leaves"));
  assert.deepEqual(samples(parent), samples(baseline));
  assert.deepEqual(samples(parent.fork("branch/0")), branch);
  assert.notDeepEqual(samples(parent.fork("branch/1")), branch);
  assert.notDeepEqual(samples(createStream(43, "tree").fork("branch/0")), branch);
  assert.notEqual(streamSeed(1, "ab"), streamSeed(1, "a/b"));
  assert.notEqual(hashString("çınar"), hashString("cinar"));
  assert.equal(hashString("çınar"), hashString("çınar"));
  assert.equal(hashString("stable") >>> 0, hashString("stable"));
  assert.notDeepEqual(samples(createStream(1, "a").fork("bc")), samples(createStream(1, "ab").fork("c")));
});

test("random values stay in range and directions have unit length without polar bias", () => {
  const random = createStream(0, "geometry");
  const sum = [0, 0, 0];
  const seen = new Set<number>();
  for (let i = 0; i < 4096; i++) {
    const value = random.next(), range = random.range(-4, 3), integer = random.int(-2, 2);
    assert.ok(value >= 0 && value < 1);
    assert.ok(range >= -4 && range < 3);
    assert.ok(Number.isInteger(integer) && integer >= -2 && integer <= 2);
    seen.add(integer);
    const v = random.unitVector();
    assert.ok(Math.abs(Math.hypot(...v) - 1) < 1e-12);
    v.forEach((component, axis) => { sum[axis] = sum[axis]! + component; });
  }
  assert.equal(seen.size, 5);
  assert.ok(sum.every(value => Math.abs(value / 4096) < 0.04));
});
