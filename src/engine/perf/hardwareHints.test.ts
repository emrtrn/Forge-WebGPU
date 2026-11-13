// Ported from Forge WebGL tools/engine-tests.ts @ forge-webgl-final (04b5fb23): each check is
// copied unchanged and runs as a Vitest test; docs/PORT_LOG.md §2.
import assert from "node:assert/strict";
import { type FrameMetrics } from "./frameMetrics.ts";
import { calibrateFromMeasurement, stepQualityLevel, suggestStartingQualityLevel } from "./hardwareHints.ts";
import { test } from "vitest";

const check = test;

check("hardware hints: no signals default to Medium; strong/weak devices split apart", () => {
  // No hints at all → neutral Medium, zero confidence (plan §4).
  const blank = suggestStartingQualityLevel({});
  assert.equal(blank.level, "medium");
  assert.equal(blank.confidence, 0);

  // A gaming desktop lands on Ultra.
  const desktop = suggestStartingQualityLevel({
    hardwareConcurrency: 16,
    deviceMemoryGb: 8,
    webglRenderer: "ANGLE (NVIDIA, NVIDIA GeForce RTX 4070 Direct3D11 vs_5_0 ps_5_0, D3D11)",
    isTouch: false,
  });
  assert.equal(desktop.level, "ultra");
  assert.ok(desktop.confidence > 0);

  // A mid laptop (8 cores, integrated Iris) lands around High.
  const laptop = suggestStartingQualityLevel({
    hardwareConcurrency: 8,
    deviceMemoryGb: 8,
    webglRenderer: "ANGLE (Intel, Intel(R) Iris(R) Xe Graphics Direct3D11, D3D11)",
  });
  assert.equal(laptop.level, "high");

  // A phone (touch + Mali) drops to Low.
  const phone = suggestStartingQualityLevel({
    hardwareConcurrency: 8,
    isTouch: true,
    webglRenderer: "Mali-G78",
  });
  assert.equal(phone.level, "low");

  // A software renderer is decisive → Low, higher confidence.
  const software = suggestStartingQualityLevel({
    hardwareConcurrency: 16,
    webglRenderer: "Google SwiftShader",
  });
  assert.equal(software.level, "low");
  assert.ok(software.confidence >= 0.7);
});

check("quality ladder: stepQualityLevel moves one rung and clamps at the ends", () => {
  assert.equal(stepQualityLevel("high", "down"), "medium");
  assert.equal(stepQualityLevel("high", "up"), "ultra");
  assert.equal(stepQualityLevel("ultra", "up"), "ultra"); // clamp top
  assert.equal(stepQualityLevel("low", "down"), "low"); // clamp bottom
  assert.equal(stepQualityLevel("medium", "none"), "medium");
});

check("measurement calibration: steps down when over budget, up with headroom, holds otherwise", () => {
  const metrics = (avg: number, p95: number, sampleCount = 300): FrameMetrics => ({
    frameTimeMs: avg,
    averageFrameTimeMs: avg,
    p95FrameTimeMs: p95,
    spikeCount: 0,
    sampleWindowSeconds: 5,
    sampleCount,
    estimatedRefreshIntervalMs: 8.3,
  });

  // Over budget at 60 FPS (target 16.7, avg 30 > 20.9) → one step down.
  const down = calibrateFromMeasurement({
    currentLevel: "high",
    metrics: metrics(30, 40),
    targetFrameRate: 60,
  });
  assert.equal(down.direction, "down");
  assert.equal(down.level, "medium");
  assert.equal(down.changed, true);

  // Comfortable headroom (avg 10 < 12.5, p95 within budget) → one step up.
  const up = calibrateFromMeasurement({
    currentLevel: "medium",
    metrics: metrics(10, 15),
    targetFrameRate: 60,
  });
  assert.equal(up.direction, "up");
  assert.equal(up.level, "high");

  // Good average but hitchy P95 → do not raise (holds).
  const hitchy = calibrateFromMeasurement({
    currentLevel: "medium",
    metrics: metrics(10, 30),
    targetFrameRate: 60,
  });
  assert.equal(hitchy.direction, "none");
  assert.equal(hitchy.changed, false);

  // Near target → hold.
  const hold = calibrateFromMeasurement({
    currentLevel: "high",
    metrics: metrics(16, 22),
    targetFrameRate: 60,
  });
  assert.equal(hold.changed, false);

  // A clamp at the ladder end reports as held even when the frame is slow.
  const floor = calibrateFromMeasurement({
    currentLevel: "low",
    metrics: metrics(50, 70),
    targetFrameRate: 60,
  });
  assert.equal(floor.level, "low");
  assert.equal(floor.changed, false);
  assert.equal(floor.direction, "none");

  // Too few samples → decline to act regardless of the numbers.
  const sparse = calibrateFromMeasurement({
    currentLevel: "high",
    metrics: metrics(30, 40, 5),
    targetFrameRate: 60,
  });
  assert.equal(sparse.changed, false);
});
