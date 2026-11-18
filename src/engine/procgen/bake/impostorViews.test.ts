import assert from "node:assert/strict";
import { test } from "vitest";
import { cross, dot } from "../vector.ts";
import type { Vec3 } from "../vector.ts";
import { hemiOctDecode, hemiOctEncode, impostorBlend, impostorFrameBasis, impostorViewDirection } from "./impostorViews.ts";

const near = (a: Vec3, b: Vec3, tolerance = 1e-6): boolean => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]) < tolerance;

test("hemi-octahedral encoding round trips on the upper hemisphere", () => {
  for (let i = 0; i < 300; i++) {
    const y = (i + 0.5) / 300, r = Math.sqrt(1 - y * y), phi = i * 2.399963;
    const dir: Vec3 = [r * Math.cos(phi), y, r * Math.sin(phi)];
    assert.ok(near(hemiOctDecode(...hemiOctEncode(dir)), dir, 1e-6), `${dir}`);
  }
});

test("frames sit on grid points: zenith in the middle, horizon on the outer ring", () => {
  const views = 9;
  for (let j = 0; j < views; j++) for (let i = 0; i < views; i++) {
    const dir = impostorViewDirection(views, i, j);
    const [u, v] = hemiOctEncode(dir);
    assert.ok(Math.abs(u * (views - 1) - i) < 1e-6 && Math.abs(v * (views - 1) - j) < 1e-6, `${i},${j}`);
    if (i === 0 || j === 0 || i === views - 1 || j === views - 1) assert.ok(Math.abs(dir[1]) < 1e-6, `horizon ${i},${j}`);
  }
  assert.ok(near(impostorViewDirection(views, 4, 4), [0, 1, 0]));
});

test("blend weights sum to 1 and pick the exact frame on a frame direction", () => {
  const views = 8;
  for (let i = 0; i < 400; i++) {
    const y = (i + 0.5) / 400, r = Math.sqrt(1 - y * y), phi = i * 2.399963;
    const { weights, frames } = impostorBlend(views, [r * Math.cos(phi), y, r * Math.sin(phi)]);
    assert.ok(Math.abs(weights[0] + weights[1] + weights[2] - 1) < 1e-9);
    assert.ok(weights.every((w) => w >= -1e-9));
    assert.ok(frames.flat().every((k) => k >= 0 && k < views));
  }
  for (let j = 0; j < views; j++) for (let i = 0; i < views; i++) {
    const { frames, weights } = impostorBlend(views, impostorViewDirection(views, i, j));
    const best = weights.indexOf(Math.max(...weights));
    assert.ok(weights[best]! > 1 - 1e-6, `${i},${j}: ${weights}`);
    assert.deepEqual(frames[best], [i, j]);
  }
});

test("frame bases are orthonormal and right-handed, the zenith too", () => {
  const views = 8;
  for (let j = 0; j < views; j++) for (let i = 0; i < views; i++) {
    const { right, up, forward } = impostorFrameBasis(views, i, j);
    const v = impostorViewDirection(views, i, j);
    for (const axis of [right, up, forward]) assert.ok(Math.abs(Math.hypot(...axis) - 1) < 1e-9);
    assert.ok(Math.abs(dot(right, up)) < 1e-9 && Math.abs(dot(right, forward)) < 1e-9);
    assert.ok(near(cross(right, up), v), `${i},${j}`);
  }
  const top = impostorFrameBasis(9, 4, 4);
  assert.ok(near(top.forward, [0, -1, 0]));
});
