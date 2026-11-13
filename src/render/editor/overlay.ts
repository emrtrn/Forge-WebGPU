// The editor's drawing layer (plan phase 4 step 3; architecture §4.9,
// phase 4 decision 1): the grid, the selection outline, helper drawings and
// (step 4) the gizmo draw after the frame, never into it. Drawn inside the
// scene pass they would enter TRAA's history and shimmer and smear; drawn
// after it they use the unjittered camera (TRAA clears its view offset once
// the pipeline ran).
//
// A frame of the layer, after the host drew the world:
//
// 1. Scene depth. When the frame went through the pipeline, its scene pass's
//    depth (single sample) is read as it is. A frame drawn straight to the
//    canvas (a level without a Post Process, with the renderer's MSAA) has no
//    depth that can be sampled: three draws it into its multisampled frame
//    buffer and WebGPU cannot resolve depth. The layer then draws the scene's
//    depth once more into its own target (depth prepass: every visible
//    object that writes depth, with one unlit material; no lights, so no
//    shadow pass). Only the editor pays for it.
// 2. The layer's scene into its own target (cleared transparent, its own
//    depth, MSAA): an overlay material hides the fragments the scene's depth
//    covers (`sceneVisibility`), so the test is against the scene and
//    overlay objects still sort among themselves.
// 3. That target over the canvas with one full-screen quad, without the
//    frame's tone mapping (an overlay colour is drawn as authored, whatever
//    the level's exposure), encoded to sRGB as the frame's output is.
//
// The renderer's state it changes (render target, clear colour, auto clear,
// tone mapping, output colour space, the scene's override material) is put
// back before it returns.

import {
  Color,
  ColorManagement,
  DepthTexture,
  FloatType,
  HalfFloatType,
  MeshBasicNodeMaterial,
  NodeMaterial,
  NormalBlending,
  NoToneMapping,
  QuadMesh,
  RenderTarget,
  Scene,
  UnsignedIntType,
  Vector2,
  type Camera,
  type Material,
  type Mesh,
  type Node,
  type Object3D,
  type Texture,
  type WebGPURenderer,
} from "three/webgpu";
import { cameraFar, cameraNear, float, Fn, max, orthographicDepthToViewZ, perspectiveDepthToViewZ, positionView, screenUV, select, sRGBTransferOETF, texture, vec4 } from "three/tsl";
import type { OverlayFrame, RenderOverlay } from "../host/renderHost.ts";

/** Metres a fragment may lie behind the scene's surface and still show (depth precision, the prepass's own sampling). */
const OCCLUSION_BIAS = 0.02;
/** Overlay target MSAA samples: lines and edges are drawn antialiased. */
const OVERLAY_SAMPLES = 4;

/** Something the layer draws after its scene (the selection outline, step 3b). */
export interface OverlayPass {
  /** Draws into the overlay target, already bound; `size` is the drawing buffer's. */
  render(renderer: WebGPURenderer, camera: Camera, size: Vector2): void;
}

export interface EditorOverlay extends RenderOverlay {
  /** What the layer draws; overlay objects go here. */
  readonly scene: Scene;
  /**
   * 1 where an overlay fragment is in front of the scene's surface, 0 where
   * the scene covers it: overlay materials multiply their opacity by it (and
   * set a small `alphaTest`, so a hidden fragment writes no overlay depth).
   */
  readonly sceneVisibility: Node<"float">;
  /** Passes drawn after the scene, in order. */
  addPass(pass: OverlayPass): void;
  /** Frames since the layer started that needed the depth prepass (a test witness). */
  readonly prepasses: number;
  dispose(): void;
}

function depthTarget(type: typeof FloatType | typeof UnsignedIntType): RenderTarget {
  const target = new RenderTarget(1, 1, { depthBuffer: true, samples: 0 });
  const depth = new DepthTexture(1, 1);
  depth.type = type;
  target.depthTexture = depth;
  return target;
}

function writesDepth(material: Material | Material[]): boolean {
  const all = Array.isArray(material) ? material : [material];
  return all.some((one) => one.depthWrite && one.visible && !one.transparent);
}

export function createEditorOverlay(renderer: WebGPURenderer): EditorOverlay {
  const scene = new Scene();
  scene.name = "editor overlay";
  const passes: OverlayPass[] = [];
  const size = new Vector2();
  const clearColor = new Color();
  // A reversed depth buffer stores float depth (three's PassNode does the same).
  const depthType = renderer.reversedDepthBuffer ? FloatType : UnsignedIntType;
  const prepass = depthTarget(depthType);
  const prepassMaterial = new MeshBasicNodeMaterial({ colorWrite: false });
  prepassMaterial.name = "editor depth prepass";
  const target = new RenderTarget(1, 1, { type: HalfFloatType, depthBuffer: true, samples: OVERLAY_SAMPLES });
  let prepasses = 0;

  // The scene's depth this frame (the pipeline's or the prepass's): one node,
  // its texture swapped per frame.
  const sceneDepth = texture(prepass.depthTexture!);
  const sceneVisibility = Fn((_args: unknown[], builder: { camera: Camera | null }) => {
    const depth = sceneDepth.sample(screenUV).x;
    const orthographic = (builder.camera as { isOrthographicCamera?: boolean } | null)?.isOrthographicCamera === true;
    const sceneViewZ = orthographic ? orthographicDepthToViewZ(depth, cameraNear, cameraFar) : perspectiveDepthToViewZ(depth, cameraNear, cameraFar);
    // View-space z is negative ahead of the camera: a smaller z is farther away.
    return select(positionView.z.lessThan(sceneViewZ.sub(OCCLUSION_BIAS)), float(0), float(1));
  })() as Node<"float">;

  // The layer over the canvas: the target holds premultiplied linear colour.
  const composite = new NodeMaterial();
  composite.name = "editor overlay composite";
  const layer = texture(target.texture);
  composite.fragmentNode = Fn(() => {
    const sampled = layer.sample(screenUV) as unknown as Node<"vec4">;
    const alpha = sampled.a as Node<"float">;
    const rgb = sampled.rgb.div(max(alpha, 1e-4)) as Node<"vec3">;
    return vec4(sRGBTransferOETF(rgb) as Node<"vec3">, alpha);
  })();
  composite.blending = NormalBlending;
  composite.transparent = true;
  composite.depthTest = false;
  composite.depthWrite = false;
  const quad = new QuadMesh(composite);

  const hidden: Object3D[] = [];
  const drawPrepass = (worldScene: Scene, camera: Camera): void => {
    prepass.setSize(size.x, size.y);
    worldScene.traverseVisible((object) => {
      const material = (object as Mesh).material as Material | Material[] | undefined;
      if (material === undefined || object === worldScene) return;
      if (!writesDepth(material)) hidden.push(object);
    });
    for (const object of hidden) object.visible = false;
    const override = worldScene.overrideMaterial;
    const background = worldScene.background;
    worldScene.overrideMaterial = prepassMaterial;
    worldScene.background = null;
    try {
      renderer.setRenderTarget(prepass);
      renderer.clear();
      renderer.render(worldScene, camera);
    } finally {
      worldScene.overrideMaterial = override;
      worldScene.background = background;
      for (const object of hidden) object.visible = true;
      hidden.length = 0;
    }
    prepasses += 1;
  };

  return {
    scene,
    sceneVisibility,
    addPass(pass) {
      passes.push(pass);
    },
    get prepasses() {
      return prepasses;
    },
    render(frame: OverlayFrame) {
      if (scene.children.length === 0 && passes.length === 0) return;
      renderer.getDrawingBufferSize(size);
      if (size.x === 0 || size.y === 0) return;
      const previousTarget = renderer.getRenderTarget();
      const autoClear = renderer.autoClear;
      const toneMapping = renderer.toneMapping;
      const outputColorSpace = renderer.outputColorSpace;
      renderer.getClearColor(clearColor);
      const clearAlpha = renderer.getClearAlpha();
      try {
        renderer.autoClear = false;
        if (frame.sceneDepth) sceneDepth.value = frame.sceneDepth as Texture;
        else {
          drawPrepass(frame.scene, frame.camera);
          sceneDepth.value = prepass.depthTexture!;
        }
        target.setSize(size.x, size.y);
        renderer.setRenderTarget(target);
        renderer.setClearColor(0x000000, 0);
        renderer.clear();
        renderer.render(scene, frame.camera);
        for (const pass of passes) pass.render(renderer, frame.camera, size);
        renderer.setRenderTarget(null);
        renderer.toneMapping = NoToneMapping;
        renderer.outputColorSpace = ColorManagement.workingColorSpace;
        quad.render(renderer);
      } finally {
        renderer.toneMapping = toneMapping;
        renderer.outputColorSpace = outputColorSpace;
        renderer.autoClear = autoClear;
        renderer.setClearColor(clearColor, clearAlpha);
        renderer.setRenderTarget(previousTarget);
      }
    },
    dispose() {
      scene.clear();
      passes.length = 0;
      prepass.dispose();
      prepassMaterial.dispose();
      target.dispose();
      composite.dispose();
    },
  };
}
