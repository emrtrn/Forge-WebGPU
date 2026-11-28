import {
  AmbientLight, Color, ColorManagement, DirectionalLight, Group, HalfFloatType, NodeMaterial,
  NoToneMapping, PerspectiveCamera, QuadMesh, RenderTarget, Scene, SkinnedMesh, Vector2, type Node,
} from "three/webgpu";
import { clone } from "three/addons/utils/SkeletonUtils.js";
import { Fn, max, screenUV, sRGBTransferOETF, texture, vec4 } from "three/tsl";
import type { RuntimeViewModel } from "../../engine/camera/worldCamera.ts";
import type { RenderOverlay } from "../host/renderHost.ts";
import { assignSlotMaterials, slotMaterialIds } from "../resources/modelSlots.ts";
import type { WorldResources } from "../resources/worldResources.ts";

export function createViewModelLayer(resources: WorldResources): RenderOverlay & {
  update(view: RuntimeViewModel | null): void;
  dispose(): void;
} {
  const scene = new Scene();
  const holder = new Group();
  const key = new DirectionalLight(0xffffff, 2);
  key.position.set(-1, 2, 2);
  scene.add(holder, key, new AmbientLight(0xffffff, 1));
  const camera = new PerspectiveCamera(60, 1, 0.01, 100);
  const size = new Vector2();
  const clearColor = new Color();
  const target = new RenderTarget(1, 1, { type: HalfFloatType, samples: 4 });
  const material = new NodeMaterial();
  material.transparent = true;
  material.depthTest = false;
  material.depthWrite = false;
  const layer = texture(target.texture);
  material.fragmentNode = Fn(() => {
    const sampled = layer.sample(screenUV) as unknown as Node<"vec4">;
    const alpha = sampled.a as Node<"float">;
    // Drawing over transparent black stores premultiplied RGB.
    const rgb = sampled.rgb.div(max(alpha, 1e-4)) as Node<"vec3">;
    return vec4(sRGBTransferOETF(rgb) as Node<"vec3">, alpha);
  })();
  const composite = new QuadMesh(material);
  let selection: { readonly model: string } | null = null;

  function clear() {
    holder.traverse((object) => {
      if (object instanceof SkinnedMesh) object.skeleton.dispose();
    });
    holder.clear();
    selection = null;
    resources.releaseAll();
  }

  return {
    update(view) {
      if ((view?.model ?? null) !== (selection?.model ?? null)) {
        clear();
        if (view) {
          const pending = { model: view.model };
          selection = pending;
          void (async () => {
            const model = await resources.model(pending.model);
            if (selection !== pending) return;
            const materials = await Promise.all(slotMaterialIds(model, []).map((guid, index) =>
              guid === null ? model.slots[index]! : resources.material(guid).catch(() => model.slots[index]!)));
            if (selection !== pending) return;
            const placement = clone(model.scene);
            assignSlotMaterials(placement, model.slots, materials);
            holder.add(placement);
          })().catch(() => {
            // The resource cache reports a failed load. The world is still drawable.
          });
        }
      }
      if (!view) return;
      holder.position.fromArray(view.local.p);
      holder.quaternion.fromArray(view.local.r);
      holder.scale.fromArray(view.local.s);
      camera.fov = view.fov;
    },
    render({ renderer }) {
      if (holder.children.length === 0) return;
      renderer.getDrawingBufferSize(size);
      if (size.x === 0 || size.y === 0) return;
      camera.aspect = size.x / size.y;
      camera.updateProjectionMatrix();
      target.setSize(size.x, size.y);
      const previousTarget = renderer.getRenderTarget();
      const { autoClear, toneMapping, outputColorSpace } = renderer;
      const clearAlpha = renderer.getClearAlpha();
      renderer.getClearColor(clearColor);
      try {
        renderer.autoClear = false;
        renderer.setRenderTarget(target);
        renderer.setClearColor(0x000000, 0);
        renderer.clear();
        renderer.render(scene, camera);
        renderer.setRenderTarget(null);
        renderer.toneMapping = NoToneMapping;
        renderer.outputColorSpace = ColorManagement.workingColorSpace;
        composite.render(renderer);
      } finally {
        renderer.autoClear = autoClear;
        renderer.toneMapping = toneMapping;
        renderer.outputColorSpace = outputColorSpace;
        renderer.setClearColor(clearColor, clearAlpha);
        renderer.setRenderTarget(previousTarget);
      }
    },
    dispose() {
      clear();
      material.dispose();
      target.dispose();
    },
  };
}
