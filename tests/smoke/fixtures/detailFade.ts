import { AmbientLight, BoxGeometry, Color, DirectionalLight, Group, Matrix4, Mesh, MeshStandardNodeMaterial, OrthographicCamera, PerspectiveCamera, PlaneGeometry, RenderTarget, Scene, WebGPURenderer } from "three/webgpu";
import { createInstanceBatch } from "../../../src/render/sync/instanceBatches.ts";

async function probe() {
  const renderer = new WebGPURenderer({ antialias: false }); renderer.setSize(256, 256); renderer.shadowMap.enabled = true; await renderer.init();
  const scene = new Scene(); scene.background = new Color("#ffffff");
  const root = new Group(); scene.add(root, new AmbientLight("#ffffff", .5));
  const sun = new DirectionalLight("#ffffff", 2); sun.position.set(40, 20, 0); sun.castShadow = true;
  sun.shadow.mapSize.set(512, 512); Object.assign(sun.shadow.camera, { left: -30, right: 30, top: 30, bottom: -30, near: .1, far: 100 }); sun.shadow.camera.updateProjectionMatrix(); scene.add(sun, sun.target);
  const groundMaterial = new MeshStandardNodeMaterial({ color: "#ffffff" });
  const ground = new Mesh(new PlaneGeometry(100, 100), groundMaterial); ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; scene.add(ground);
  const source = new MeshStandardNodeMaterial({ color: "#ee2222" }); const geometry = new BoxGeometry(8, 10, 8);
  const batch = createInstanceBatch({ name: "probe", parent: root, castShadow: true });
  batch.setParts([{ geometry, material: source, local: new Matrix4().makeTranslation(0, 5, 0), name: "box" }], 1);
  batch.set("a", new Matrix4(), null, "act_1"); batch.flush();
  const camera = new OrthographicCamera(-22, 22, 22, -22, .1, 200); camera.position.set(30, 50, 60); camera.lookAt(0, 0, 0); camera.updateMatrixWorld();
  const distanceCamera = new PerspectiveCamera(); const target = new RenderTarget(256, 256);
  renderer.setRenderTarget(target);
  const draw = async (distance: number) => {
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    distanceCamera.position.set(0, 0, distance); batch.updateCulling(distanceCamera, 1);
    renderer.render(scene, camera); return new Uint8Array(await renderer.readRenderTargetPixelsAsync(target, 0, 0, 256, 256));
  };
  const near = await draw(150), fade = await draw(180), gone = await draw(250);
  const count = (data: Uint8Array) => {
    let red = 0, shadow = 0;
    for (let at = 0; at < data.length; at += 4) {
      if (data[at]! > data[at + 1]! * 1.5) red++;
      // Filtering spreads a dithered shadow across pale pixels: compare its
      // integrated darkening instead of imposing a per-pixel darkness cutoff.
      else shadow += Math.max(0, gone[at]! - data[at]!);
    }
    return { red, shadow };
  };
  const result = { backend: (renderer.backend as unknown as { isWebGPUBackend: boolean }).isWebGPUBackend, near: count(near), fade: count(fade), gone: count(gone) };
  target.dispose(); batch.dispose(); source.dispose(); geometry.dispose(); ground.geometry.dispose(); groundMaterial.dispose(); sun.dispose(); renderer.dispose();
  return result;
}
(window as unknown as { detailFadeProbe: typeof probe }).detailFadeProbe = probe;
document.body.dataset.ready = "1";
