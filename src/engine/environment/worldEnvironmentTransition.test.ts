// The controller's timed hour transition (plan phase 3 step 7). Forge's own
// controller checks stay in worldEnvironment.test.ts, unchanged.
import { describe, expect, test } from "vitest";
import { WorldEnvironmentController } from "./worldEnvironmentController.ts";

function controllerAt(hour: number): WorldEnvironmentController {
  const controller = new WorldEnvironmentController();
  controller.load({ time: { hour, dayLengthMinutes: 0 } } as Parameters<WorldEnvironmentController["load"]>[0]);
  return controller;
}

const steps = (controller: WorldEnvironmentController, count: number, dt: number): void => {
  for (let i = 0; i < count; i += 1) controller.advance(dt);
};

describe("world environment controller: timed transition", () => {
  test("runs the hour forward over the seconds, resolves true and stops there", async () => {
    const controller = controllerAt(10);
    const hours: number[] = [];
    controller.onChanged((state) => hours.push(state.hour));
    const reached = controller.transitionTo({ hour: 22, seconds: 5 });
    expect(controller.transitioning).toBe(true);
    expect(controller.current()?.hour).toBe(10);
    steps(controller, 150, 1 / 30);
    expect(controller.current()?.hour).toBe(22);
    expect(controller.transitioning).toBe(false);
    await expect(reached).resolves.toBe(true);
    // Every frame moved the hour forward, and the last one landed on the target.
    expect(hours.every((hour, i) => i === 0 || hour >= hours[i - 1]!)).toBe(true);
    expect(hours.at(-1)).toBe(22);
    const revision = controller.revision;
    steps(controller, 30, 1 / 30);
    expect(controller.current()?.hour).toBe(22);
    expect(controller.revision).toBe(revision);
  });

  test("across midnight the live hour stays in [0, 24) and ends on the target", async () => {
    const controller = controllerAt(20);
    const reached = controller.transitionTo({ hour: 6, seconds: 2 });
    const hours: number[] = [];
    for (let i = 0; i < 40; i += 1) {
      controller.advance(0.05);
      hours.push(controller.current()!.hour);
    }
    expect(Math.min(...hours)).toBeGreaterThanOrEqual(0);
    expect(Math.max(...hours)).toBeLessThan(24);
    expect(hours.some((hour) => hour < 6)).toBe(true);
    expect(hours.at(-1)).toBe(6);
    await expect(reached).resolves.toBe(true);
  });

  test("a new transition replaces the running one from the hour it reached", async () => {
    const controller = controllerAt(10);
    const first = controller.transitionTo({ hour: 22, seconds: 4 });
    steps(controller, 20, 0.1);
    const reachedHour = controller.current()!.hour;
    expect(reachedHour).toBeCloseTo(16, 9);
    const second = controller.transitionTo({ hour: 18, seconds: 1 });
    await expect(first).resolves.toBe(false);
    expect(controller.current()?.hour).toBe(reachedHour);
    steps(controller, 10, 0.1);
    expect(controller.current()?.hour).toBe(18);
    await expect(second).resolves.toBe(true);
  });

  test("setHour and clear cut a running transition short", async () => {
    const controller = controllerAt(10);
    const jumped = controller.transitionTo({ hour: 22, seconds: 4 });
    controller.advance(1);
    controller.setHour(7);
    await expect(jumped).resolves.toBe(false);
    expect(controller.transitioning).toBe(false);
    controller.advance(1);
    expect(controller.current()?.hour).toBe(7);
    const cleared = controller.transitionTo({ hour: 22, seconds: 4 });
    controller.clear();
    await expect(cleared).resolves.toBe(false);
    expect(controller.transitioning).toBe(false);
  });

  test("no seconds or no distance sets the hour at once; no World Environment or a bad hour does nothing", async () => {
    const controller = controllerAt(10);
    await expect(controller.transitionTo({ hour: 3, seconds: 0 })).resolves.toBe(true);
    expect(controller.current()?.hour).toBe(3);
    expect(controller.transitioning).toBe(false);
    await expect(controller.transitionTo({ hour: 3, seconds: 5 })).resolves.toBe(true);
    expect(controller.transitioning).toBe(false);
    await expect(controller.transitionTo({ hour: Number.NaN, seconds: 5 })).resolves.toBe(false);
    expect(controller.current()?.hour).toBe(3);
    const inactive = new WorldEnvironmentController();
    await expect(inactive.transitionTo({ hour: 12, seconds: 1 })).resolves.toBe(false);
    expect(inactive.transitioning).toBe(false);
  });

  test("the season and weather change during a transition without stopping it", async () => {
    const controller = controllerAt(10);
    const reached = controller.transitionTo({ hour: 14, seconds: 1 });
    controller.advance(0.5);
    controller.setWeather("rain", 0.5);
    controller.setSeason("winter");
    expect(controller.transitioning).toBe(true);
    controller.advance(0.5);
    expect(controller.current()).toMatchObject({ hour: 14, season: "winter", weather: { preset: "rain", intensity: 0.5 } });
    await expect(reached).resolves.toBe(true);
  });
});

// Vegetation plan PG2 (§6.9): a timed season change in simulation seconds.
describe("world environment controller: season transition", () => {
  test("moves from the season it left over the seconds, then is reached; setSeason cuts it short", async () => {
    const controller = controllerAt(12);
    const done = controller.transitionSeason({ season: "autumn", seconds: 10 });
    expect(controller.current()).toMatchObject({ season: "autumn", seasonFrom: "summer", seasonProgress: 0 });
    steps(controller, 4, 1);
    expect(controller.current()!.seasonProgress).toBeCloseTo(0.4);
    // The hour does not move: the season and the clock are separate inputs.
    expect(controller.current()!.hour).toBe(12);
    steps(controller, 7, 1);
    await expect(done).resolves.toBe(true);
    expect(controller.current()).not.toHaveProperty("seasonProgress");
    expect(controller.current()!.season).toBe("autumn");

    const cut = controller.transitionSeason({ season: "winter", seconds: 5 });
    controller.setSeason("spring");
    await expect(cut).resolves.toBe(false);
    expect(controller.current()).toMatchObject({ season: "spring" });
    expect(controller.current()).not.toHaveProperty("seasonFrom");
  });

  test("the same total time in different steps gives the same progress; a restore resumes it", () => {
    const a = controllerAt(12), b = controllerAt(12);
    void a.transitionSeason({ season: "winter", seconds: 8 });
    void b.transitionSeason({ season: "winter", seconds: 8 });
    steps(a, 30, 0.1);
    steps(b, 3, 1);
    expect(a.current()!.seasonProgress).toBeCloseTo(b.current()!.seasonProgress!, 9);
    const saved = { ...structuredClone(a.current()!), surfaceTarget: a.getSurfaceTarget() };
    const c = controllerAt(12);
    c.restore(saved);
    expect(c.current()).toMatchObject({ season: "winter", seasonFrom: "summer" });
    expect(c.current()!.seasonProgress).toBeCloseTo(0.375, 9);
    steps(c, 5, 1);
    expect(c.current()).not.toHaveProperty("seasonProgress");
  });
});
