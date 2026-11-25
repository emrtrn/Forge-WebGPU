// The late layer (plan phase W1): what is drawn over the scene after its
// anti-aliasing and before depth of field, bloom and the output transform.
// Rain and snow live here.
//
// Why not in the scene pass: fast thin transparent streaks have no place in a
// temporal history (TRAA keeps a few percent of a one-frame streak and its
// neighbourhood clamp lets the rest of the history through), and a transparent
// draw in an MRT pass overwrites the normals and velocities the screen-space
// passes read at its pixels.
//
// - A frame with a pipeline draws `root` in its own small scene into its own
//   target (renderPipeline.ts): no lights, no depth of its own, the scene's
//   depth read in the fragment, so it fades softly into what stands in front.
//   The scene's fog is applied (its node is shared).
// - A frame drawn straight to the canvas has no history and no MRT: `root` hangs
//   under the world's scene, tested against its depth by the hardware.
//
// Materials here are unlit and transparent, write no depth, and multiply their
// opacity by `visibility()`. The switch between the two is one uniform: no
// material is rebuilt.

import { DepthTexture, FloatType, Group, Scene, UnsignedIntType, type Node, type Texture } from "three/webgpu";
import * as TSLTyped from "three/tsl";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyNode = any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const TSL = TSLTyped as unknown as Record<string, any>;
const { cameraFar, cameraNear, float, Fn, mix, orthographicDepthToViewZ, perspectiveDepthToViewZ, positionView, screenUV, smoothstep, texture, uniform } = TSL;

export interface LateLayer {
  /** What the layer draws; a binding adds here. */
  readonly root: Group;
  /** The layer's own scene, its parent while the frame has a pipeline. */
  readonly scene: Scene;
  /** Something would be drawn. */
  readonly active: boolean;
  /** 1 in front of the scene's surface, 0 behind it, over `softness` metres. */
  visibility(softness: number): Node<"float">;
  /** The frame's scene depth (single sample); null when the hardware tests it. */
  setSceneDepth(depth: Texture | null): void;
  dispose(): void;
}

export function createLateLayer(reversedDepth = false): LateLayer {
  const scene = new Scene();
  scene.name = "late layer";
  const root = new Group();
  root.name = "late";
  scene.add(root);
  const placeholder = new DepthTexture(1, 1);
  // A reversed depth buffer stores float depth (three's PassNode does the same).
  placeholder.type = reversedDepth ? FloatType : UnsignedIntType;
  const sceneDepth = texture(placeholder);
  const sampled = uniform(0);
  return {
    root,
    scene,
    get active() {
      return root.visible && root.children.some((child) => child.visible);
    },
    visibility(softness) {
      return Fn((_args: unknown[], builder: { camera: { isOrthographicCamera?: boolean } | null }) => {
        const depth: AnyNode = sceneDepth.sample(screenUV).x;
        const surface = builder.camera?.isOrthographicCamera === true
          ? orthographicDepthToViewZ(depth, cameraNear, cameraFar)
          : perspectiveDepthToViewZ(depth, cameraNear, cameraFar);
        // View z is negative ahead of the camera: in front of the surface is larger.
        const ahead = smoothstep(0, Math.max(softness, 1e-3), positionView.z.sub(surface));
        return mix(float(1), ahead, sampled);
      })() as Node<"float">;
    },
    setSceneDepth(depth) {
      sceneDepth.value = depth ?? placeholder;
      sampled.value = depth ? 1 : 0;
    },
    dispose() {
      root.removeFromParent();
      root.clear();
      scene.clear();
      placeholder.dispose();
    },
  };
}
