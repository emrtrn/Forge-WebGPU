// Isolated real-GPU regression fixture: a lit plane, with no possible caster
// in the far-depth case. An empty map cannot legitimately darken this plane.
import { AmbientLight, BoxGeometry, Color, DirectionalLight, Mesh, MeshStandardNodeMaterial, OrthographicCamera, PlaneGeometry, RenderTarget, Scene, Vector3, WebGPURenderer } from "three/webgpu";
import { configureShadow, updateFollowShadow } from "../../../src/render/sync/sunShadow.ts";

const SIZE = 256;
let dispose: (() => void) | null = null;

export interface ShadowProbeResult {
  readonly backend: boolean;
  readonly reversed: boolean;
  readonly altitude: number;
  readonly reference: readonly number[];
  readonly shadowed: readonly number[];
  readonly centerDelta: number;
  readonly casterDelta: number;
}

async function probe(options: { reversed: boolean; altitude: number; occluder: boolean }): Promise<ShadowProbeResult> {
  dispose?.();
  const renderer = new WebGPURenderer({ antialias: false, reversedDepthBuffer: options.reversed });
  renderer.setSize(SIZE, SIZE);
  renderer.shadowMap.enabled = true;
  await renderer.init();
  document.body.append(renderer.domElement);
  const scene = new Scene();
  scene.background = new Color("#ffffff");
  const camera = new OrthographicCamera(-80, 80, 80, -80, .1, 2000);
  camera.position.set(0, options.altitude, 0);
  camera.up.set(0, 0, -1);
  camera.lookAt(0, 0, 0);
  camera.updateMatrixWorld();
  const material = new MeshStandardNodeMaterial({ color: "#808080", roughness: 1 });
  const plane = new Mesh(new PlaneGeometry(2000, 2000), material);
  plane.rotation.x = -Math.PI / 2;
  plane.receiveShadow = true;
  plane.castShadow = false;
  scene.add(plane, new AmbientLight("#ffffff", .2));
  const sun = new DirectionalLight("#ffffff", 2);
  sun.position.set(options.occluder ? 10 : 0, options.occluder ? 20 : 10, 0);
  scene.add(sun, sun.target);
  configureShadow(sun, 512);
  updateFollowShadow(sun, camera.position, new Vector3(0, 0, 0), 45);
  const box = new Mesh(new BoxGeometry(8, 10, 8), material);
  box.position.y = 5;
  box.castShadow = true;
  if (options.occluder) scene.add(box);
  const target = new RenderTarget(SIZE, SIZE);
  const draw = async (enabled: boolean) => {
    sun.castShadow = enabled;
    material.needsUpdate = true;
    renderer.setRenderTarget(target);
    renderer.render(scene, camera);
    return new Uint8Array(await renderer.readRenderTargetPixelsAsync(target, 0, 0, SIZE, SIZE));
  };
  const reference = await draw(false);
  const shadowed = await draw(true);
  const sample = (pixels: Uint8Array, x: number) => [...pixels.slice((128 * SIZE + x) * 4, (128 * SIZE + x) * 4 + 3)];
  const delta = (x: number) => sample(reference, x).reduce((sum, n, i) => sum + Math.abs(n - sample(shadowed, x)[i]!), 0) / 3;
  renderer.setRenderTarget(null);
  renderer.render(scene, camera);
  dispose = () => {
    target.dispose(); plane.geometry.dispose(); box.geometry.dispose(); material.dispose(); sun.dispose(); renderer.dispose(); renderer.domElement.remove();
  };
  return { backend: (renderer.backend as unknown as { isWebGPUBackend: boolean }).isWebGPUBackend,
    reversed: options.reversed, altitude: options.altitude, reference: sample(reference, 128), shadowed: sample(shadowed, 128),
    centerDelta: delta(128), casterDelta: delta(117) };
}

(window as unknown as { followShadowProbe: typeof probe }).followShadowProbe = probe;
document.body.dataset.ready = "1";
