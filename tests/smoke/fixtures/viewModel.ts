import {
  ACESFilmicToneMapping, Color, Group, Mesh, MeshBasicNodeMaterial, PerspectiveCamera,
  PlaneGeometry, Scene, WebGPURenderer,
} from "three/webgpu";
import type { Transform } from "../../../src/core/index.ts";
import { createResourceCache } from "../../../src/render/resources/resourceCache.ts";
import { createWorldResources } from "../../../src/render/resources/worldResources.ts";
import { createViewModelLayer } from "../../../src/render/viewer/viewModel.ts";

const SIZE = 128;

async function probeViewModel(forceWebGL: boolean) {
  const renderer = new WebGPURenderer({ forceWebGL, antialias: true, reversedDepthBuffer: !forceWebGL });
  renderer.setSize(SIZE, SIZE);
  renderer.toneMapping = ACESFilmicToneMapping;
  await renderer.init();
  document.body.append(renderer.domElement);
  const scene = new Scene();
  scene.background = new Color("#245cff");
  const camera = new PerspectiveCamera(45, 1, 0.1, 100);
  const geometry = new PlaneGeometry(1, 1);
  const front = new MeshBasicNodeMaterial({ color: "#ff2222" });
  const back = new MeshBasicNodeMaterial({ color: "#22ff22" });
  const wall = new Mesh(geometry, back);
  wall.position.z = -0.2;
  scene.add(wall);

  const template = new Group();
  template.add(new Mesh(geometry, front));
  const hidden = new Mesh(geometry, back);
  hidden.position.z = -0.2;
  template.add(hidden);
  const cache = createResourceCache();
  const resources = createWorldResources(cache, "probe", {
    load: async () => ({ scene: template, slots: [front, back], slotMaterials: [] }),
  });
  const layer = createViewModelLayer(resources);
  const local: Transform = { p: [0, 0, -1], r: [0, 0, 0, 1], s: [1, 1, 1] };
  const model = "probe";
  const copy = document.createElement("canvas");
  copy.width = copy.height = SIZE;
  const pixels = copy.getContext("2d")!;
  function draw() {
    renderer.render(scene, camera);
    layer.render({ renderer, scene, camera, sceneDepth: null });
    pixels.drawImage(renderer.domElement, 0, 0);
    return [5, SIZE / 2, 30].map((x) => [...pixels.getImageData(x, SIZE / 2, 1, 1).data.slice(0, 3)]);
  }
  try {
    const world = draw();
    layer.update({ model, local, fov: 60 });
    await new Promise(requestAnimationFrame);
    const narrow = draw();
    layer.update({ model, local, fov: 120 });
    const wide = draw();
    layer.update(null);
    const cleared = draw();
    return { world, narrow, wide, cleared, webgpu: "isWebGPUBackend" in renderer.backend };
  } finally {
    layer.dispose();
    geometry.dispose();
    front.dispose();
    back.dispose();
    renderer.dispose();
    renderer.domElement.remove();
  }
}

Object.assign(window, { probeViewModel });
export type ViewModelProbe = typeof probeViewModel;
