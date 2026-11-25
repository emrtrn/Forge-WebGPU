import { expect, test } from "vitest";
import { Group, PerspectiveCamera, RenderTarget, Scene, type WebGPURenderer } from "three/webgpu";
import { mrt, output } from "three/tsl";
import { createLateLayer } from "./lateLayer.ts";
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

test("a frame without passes draws the late layer under the scene, prepared once while it is still hidden", async () => {
  const prepared: { object: unknown; parent: unknown; visible: boolean[] }[] = [];
  const drawn: unknown[] = [];
  const late = createLateLayer();
  const renderer = {
    toneMapping: 0, toneMappingExposure: 1,
    getRenderTarget: () => null, setRenderTarget: () => {}, getMRT: () => null, setMRT: () => {},
    compileAsync: async (object: unknown, _camera: unknown, parent: unknown) => { prepared.push({ object, parent, visible: late.root.children.map((child) => child.visible) }); },
    render: (scene: unknown) => { drawn.push(scene); },
  } as unknown as WebGPURenderer;
  const pipeline = createFramePipeline(renderer);
  const scene = new Scene(), camera = new PerspectiveCamera();
  const output = { toneMapping: "none", exposure: 1, skyRadiance: 1, postProcess: null } as unknown as Parameters<typeof pipeline.render>[2];
  const quality = {} as Parameters<typeof pipeline.render>[3];
  pipeline.render(scene, camera, output, quality, late);
  expect(prepared).toEqual([]);
  expect(late.active).toBe(false);
  const rain = new Group();
  rain.visible = false;
  late.root.add(rain);
  pipeline.render(scene, camera, output, quality, late);
  pipeline.render(scene, camera, output, quality, late);
  expect(prepared).toEqual([{ object: late.root, parent: scene, visible: [true] }]);
  expect(rain.visible).toBe(false);
  expect(late.active).toBe(false);
  rain.visible = true;
  expect(late.active).toBe(true);
  late.root.visible = false;
  expect(late.active).toBe(false);
  expect(late.root.parent).toBe(scene);
  expect(drawn).toHaveLength(3);
  late.dispose();
  expect(scene.children).toEqual([]);
  pipeline.dispose();
  await Promise.resolve();
});
