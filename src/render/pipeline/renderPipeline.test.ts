import { expect, test } from "vitest";
import { Group, PerspectiveCamera, RenderTarget, Scene, type WebGPURenderer } from "three/webgpu";
import { mrt, output } from "three/tsl";
import { createFramePipeline } from "./renderPipeline.ts";

test("async precompile restores caller target/MRT both before yielding and after completion", async () => {
  const originalTarget = new RenderTarget(2, 2), leakedTarget = new RenderTarget(4, 4);
  const originalMrt = mrt({ output });
  let target: RenderTarget | null = originalTarget, activeMrt: ReturnType<typeof mrt> | null = originalMrt;
  let finish!: () => void;
  const held = new Promise<void>((resolve) => { finish = resolve; });
  const renderer = {
    getRenderTarget: () => target, setRenderTarget: (next: RenderTarget | null) => { target = next; },
    getMRT: () => activeMrt, setMRT: (next: ReturnType<typeof mrt> | null) => { activeMrt = next; },
    async compileAsync() {
      target = null; activeMrt = null;
      await held;
      target = leakedTarget; activeMrt = null;
    },
  } as unknown as WebGPURenderer;
  const pipeline = createFramePipeline(renderer);
  const work = pipeline.compile(new Group(), new Scene(), new PerspectiveCamera());
  expect(target).toBe(originalTarget); expect(activeMrt).toBe(originalMrt);
  finish(); await work;
  expect(target).toBe(originalTarget); expect(activeMrt).toBe(originalMrt);
  pipeline.dispose(); originalTarget.dispose(); leakedTarget.dispose();
});
