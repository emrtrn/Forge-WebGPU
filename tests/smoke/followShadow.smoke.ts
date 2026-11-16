// Regression for Island's camera-following dark rectangle. Real WebGPU,
// both depth conventions: an empty shadow map never darkens a far receiver,
// while a real nearby caster must still cast a visible shadow.
import { expect, test } from "@playwright/test";
import type { ShadowProbeResult } from "./fixtures/followShadow.ts";

for (const reversed of [true, false]) {
  test(`follow shadow: bounded depth (reversed=${reversed})`, async ({ page }, info) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
    await page.goto("/tests/smoke/fixtures/followShadow.html");
    await expect(page.locator("body")).toHaveAttribute("data-ready", "1");
    const run = (altitude: number, occluder: boolean) => page.evaluate(async (options) =>
      (window as unknown as { followShadowProbe(options: { reversed: boolean; altitude: number; occluder: boolean }): Promise<ShadowProbeResult> }).followShadowProbe(options),
    { reversed, altitude, occluder });
    const far = await run(500, false);
    await info.attach("far-empty-map.png", { body: await page.screenshot({ clip: { x: 0, y: 0, width: 256, height: 256 } }), contentType: "image/png" });
    console.log(`follow shadow far: ${JSON.stringify(far)}`);
    expect(far.backend, "real WebGPU").toBe(true);
    expect(far.reference.every((channel) => channel > 20), "the reference plane is actually lit").toBe(true);
    expect(far.centerDelta, "a plane outside the shadow's depth interval stays lit").toBeLessThanOrEqual(1);
    const near = await run(80, false);
    expect(near.centerDelta, "an empty map stays lit inside the interval too").toBeLessThanOrEqual(1);
    const caster = await run(80, true);
    console.log(`follow shadow caster: ${JSON.stringify(caster)}`);
    expect(caster.casterDelta, "a real box still shadows the nearby ground").toBeGreaterThan(20);
    expect(errors).toEqual([]);
  });
}
