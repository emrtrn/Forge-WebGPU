// The Content Browser's thumbnails (plan phase 4 step 6b; INV-A26; decision
// 9): drawn in the editor with the viewport's renderer, so on the same GPU
// device and through the same GUID-keyed resource cache (Forge WebGL's
// ThumbnailRenderer @ forge-webgl-final, in WebGPU): a model alone, framed by
// its bounds with its slot materials; a material on a sphere; a texture on a
// square. Forge's light rig (an ambient and a directional light) and
// background colour.
//
// One image at a time into a 192 px half-float target. A render target is
// drawn in the working (linear) colour space, without the output conversion,
// so the pixels are read back and encoded to sRGB here (no tone mapping, like
// Forge's thumbnail renderer), then to PNG. WebGL reads rows bottom-up.
// What a thumbnail loaded is given back to the cache once it is drawn.

import {
  AmbientLight,
  Box3,
  Color,
  DataUtils,
  DirectionalLight,
  DoubleSide,
  HalfFloatType,
  Mesh,
  MeshBasicMaterial,
  PerspectiveCamera,
  PlaneGeometry,
  RenderTarget,
  Scene,
  SphereGeometry,
  Vector3,
  type Material,
  type Object3D,
  type WebGPURenderer,
} from "three/webgpu";
import { assignSlotMaterials, slotMaterialIds } from "../resources/modelSlots.ts";
import { resourceKey } from "../resources/resourceCache.ts";
import type { WorldResources } from "../resources/worldResources.ts";

export const THUMBNAIL_SIZE = 192;
/** Forge's thumbnail background (#191b1f). */
const BACKGROUND = 0x191b1f;

export type ThumbnailKind = "model" | "material" | "texture";

export interface ThumbnailRenderer {
  /** Draws one asset; resolves to a PNG, or null when the page cannot encode one. Rejects when the asset cannot be loaded. */
  render(kind: ThumbnailKind, guid: string): Promise<Blob | null>;
  dispose(): void;
}

/** Linear [0, 1] -> 8-bit sRGB. */
export function encodeSrgb(linear: number): number {
  const c = Math.min(1, Math.max(0, Number.isFinite(linear) ? linear : 0));
  return Math.round(255 * (c <= 0.0031308 ? c * 12.92 : 1.055 * c ** (1 / 2.4) - 0.055));
}

/** Half-float RGBA rows -> 8-bit sRGB RGBA, opaque; `flipY` for rows read bottom-up. */
export function encodeHalfFloatPixels(pixels: Uint16Array, size: number, flipY: boolean): Uint8ClampedArray {
  const out = new Uint8ClampedArray(size * size * 4);
  for (let y = 0; y < size; y += 1) {
    const row = flipY ? size - 1 - y : y;
    for (let x = 0; x < size; x += 1) {
      const from = (row * size + x) * 4;
      const to = (y * size + x) * 4;
      out[to] = encodeSrgb(DataUtils.fromHalfFloat(pixels[from]!));
      out[to + 1] = encodeSrgb(DataUtils.fromHalfFloat(pixels[from + 1]!));
      out[to + 2] = encodeSrgb(DataUtils.fromHalfFloat(pixels[from + 2]!));
      out[to + 3] = 255;
    }
  }
  return out;
}

export function createThumbnailRenderer(options: {
  readonly renderer: WebGPURenderer;
  readonly resources: WorldResources;
  readonly document: Document;
}): ThumbnailRenderer {
  const { renderer, resources } = options;
  const flipY = (renderer.backend as { isWebGLBackend?: boolean }).isWebGLBackend === true;
  const target = new RenderTarget(THUMBNAIL_SIZE, THUMBNAIL_SIZE, { type: HalfFloatType, depthBuffer: true, samples: 4 });
  const camera = new PerspectiveCamera(35, 1, 0.01, 1000);
  const scene = new Scene();
  scene.background = new Color(BACKGROUND);
  const sun = new DirectionalLight(0xffffff, 2.4);
  sun.position.set(3, 5, 4);
  scene.add(new AmbientLight(0xffffff, 1.4), sun);
  const sphere = new SphereGeometry(1, 48, 32);
  const square = new PlaneGeometry(2, 2);

  /** Forge's three-quarter view of the subject's bounds. */
  const frame = (object: Object3D): void => {
    object.updateMatrixWorld(true);
    const box = new Box3().setFromObject(object);
    const center = box.isEmpty() ? new Vector3() : box.getCenter(new Vector3());
    const radius = box.isEmpty() ? 1 : Math.max(box.getSize(new Vector3()).length() / 2, 0.001);
    const distance = radius / Math.sin((camera.fov * Math.PI) / 360);
    camera.position.copy(center).addScaledVector(new Vector3(1, 0.75, 1).normalize(), distance * 1.05);
    camera.near = distance / 100;
    camera.far = distance * 10;
    camera.lookAt(center);
    camera.updateProjectionMatrix();
  };

  const draw = async (subject: Object3D): Promise<Blob | null> => {
    scene.add(subject);
    const previous = renderer.getRenderTarget();
    try {
      renderer.setRenderTarget(target);
      renderer.render(scene, camera);
    } finally {
      renderer.setRenderTarget(previous);
      scene.remove(subject);
    }
    const pixels = (await renderer.readRenderTargetPixelsAsync(target, 0, 0, THUMBNAIL_SIZE, THUMBNAIL_SIZE)) as Uint16Array;
    const canvas = options.document.createElement("canvas");
    canvas.width = THUMBNAIL_SIZE;
    canvas.height = THUMBNAIL_SIZE;
    const context = canvas.getContext("2d");
    if (!context) return null;
    const image = context.createImageData(THUMBNAIL_SIZE, THUMBNAIL_SIZE);
    image.data.set(encodeHalfFloatPixels(pixels, THUMBNAIL_SIZE, flipY));
    context.putImageData(image, 0, 0);
    return new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
  };

  return {
    async render(kind, guid) {
      if (kind === "model") {
        const model = await resources.model(guid);
        const ids = slotMaterialIds(model, []);
        const keys = [resourceKey.model(guid)];
        try {
          const chosen: Material[] = await Promise.all(
            ids.map((id, index) => {
              if (id === null) return model.slots[index]!;
              keys.push(resources.materialKey(id));
              return resources.material(id).catch(() => model.slots[index]!);
            }),
          );
          const clone = model.scene.clone(true);
          assignSlotMaterials(clone, model.slots, chosen);
          frame(clone);
          return await draw(clone);
        } finally {
          for (const key of keys) resources.release(key);
        }
      }
      if (kind === "material") {
        const material = await resources.material(guid);
        try {
          const mesh = new Mesh(sphere, material);
          frame(mesh);
          return await draw(mesh);
        } finally {
          resources.release(resources.materialKey(guid));
        }
      }
      const texture = await resources.texture(guid, "srgb");
      const plain = new MeshBasicMaterial({ map: texture, side: DoubleSide });
      try {
        // Textures load with flipY off (glTF's convention): the square shows the image upright when mirrored.
        const mesh = new Mesh(square, plain);
        mesh.scale.y = -1;
        camera.position.set(0, 0, 2 / Math.tan((camera.fov * Math.PI) / 360) / 2 + 0.05);
        camera.near = 0.01;
        camera.far = 100;
        camera.lookAt(0, 0, 0);
        camera.updateProjectionMatrix();
        return await draw(mesh);
      } finally {
        plain.dispose();
        resources.release(resourceKey.texture(guid, "srgb"));
      }
    },
    dispose() {
      target.dispose();
      sphere.dispose();
      square.dispose();
    },
  };
}
