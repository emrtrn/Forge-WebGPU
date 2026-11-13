// The editor viewport's grid (plan phase 4 step 3): a reference plane in the
// drawing layer. Forge WebGL's level viewport had none (its asset viewports
// drew a GridHelper); the plan's viewport box asks for one, as Unreal shows.
//
// One quad, the lines worked out per pixel from world coordinates: 1 m lines
// and 10 m lines, each a pixel wide and antialiased (`fwidth`), fading out
// where they would crowd closer than a few pixels; in a perspective view the
// plane fades with distance. The plane is the ground (y = 0) in the
// perspective and Top views, z = 0 in Front, x = 0 in Left. Occluded by the
// scene through the layer's `sceneVisibility`; writes no depth.
//
// Colours and strengths are the editor's starting values (visual tuning is
// the user's).

import { DoubleSide, Mesh, MeshBasicNodeMaterial, PlaneGeometry, Vector3, type Camera, type Node } from "three/webgpu";
import { abs, cameraPosition, dot, float, fract, fwidth, max, min, positionWorld, smoothstep, uniform, vec2 } from "three/tsl";

/** The plane the grid lies in. */
export type GridPlane = "ground" | "front" | "side";

export const GRID_MINOR_SPACING = 1;
export const GRID_MAJOR_SPACING = 10;
const GRID_COLOR = 0x8a9096;
const MINOR_OPACITY = 0.22;
const MAJOR_OPACITY = 0.45;
/** Half the plane's side in a perspective view; it fades out before its edge. */
const PERSPECTIVE_EXTENT = 1000;

export interface EditorGrid {
  readonly mesh: Mesh;
  /** Places the plane for this frame's camera and view. */
  update(camera: Camera, plane: GridPlane): void;
  dispose(): void;
}

/** 0..1: how much of a line of the given spacing covers this pixel; 0 where the lines crowd. */
function lineCoverage(coord: Node<"vec2">, spacing: number): Node<"float"> {
  const cells = coord.div(spacing);
  const perPixel = fwidth(cells) as unknown as Node<"vec2">;
  const pixels = abs(fract(cells.sub(0.5)).sub(0.5)).div(perPixel);
  const on = float(1).sub(min(min(pixels.x, pixels.y), float(1)));
  const crowding = smoothstep(0.12, 0.3, max(perPixel.x, perPixel.y));
  return on.mul(float(1).sub(crowding)) as Node<"float">;
}

export function createEditorGrid(sceneVisibility: Node<"float">): EditorGrid {
  const axisU = uniform(new Vector3(1, 0, 0));
  const axisV = uniform(new Vector3(0, 0, 1));
  const fadeFar = uniform(PERSPECTIVE_EXTENT * 0.9);
  const coord = vec2(dot(positionWorld, axisU), dot(positionWorld, axisV));
  const fromCamera = vec2(dot(positionWorld.sub(cameraPosition), axisU), dot(positionWorld.sub(cameraPosition), axisV)).length();
  const fade = float(1).sub(smoothstep(fadeFar.mul(0.35), fadeFar, fromCamera));
  const coverage = max(lineCoverage(coord, GRID_MINOR_SPACING).mul(MINOR_OPACITY), lineCoverage(coord, GRID_MAJOR_SPACING).mul(MAJOR_OPACITY));

  const material = new MeshBasicNodeMaterial({ color: GRID_COLOR, transparent: true, depthWrite: false, side: DoubleSide });
  material.name = "editor grid";
  material.opacityNode = coverage.mul(fade).mul(sceneVisibility);
  material.alphaTest = 0.002;
  const mesh = new Mesh(new PlaneGeometry(1, 1), material);
  mesh.name = "editor grid";
  mesh.frustumCulled = false;
  mesh.renderOrder = -1;
  const position = new Vector3();

  return {
    mesh,
    update(camera, plane) {
      const orthographic = (camera as { isOrthographicCamera?: boolean }).isOrthographicCamera === true;
      const far = (camera as { far?: number }).far ?? PERSPECTIVE_EXTENT * 2;
      const extent = Math.min(PERSPECTIVE_EXTENT, far * 0.5);
      fadeFar.value = orthographic ? 1e9 : extent * 0.9;
      camera.getWorldPosition(position);
      mesh.rotation.set(0, 0, 0);
      if (plane === "ground") {
        mesh.rotation.x = -Math.PI / 2;
        mesh.position.set(position.x, 0, position.z);
        axisU.value.set(1, 0, 0);
        axisV.value.set(0, 0, 1);
      } else if (plane === "front") {
        mesh.position.set(position.x, position.y, 0);
        axisU.value.set(1, 0, 0);
        axisV.value.set(0, 1, 0);
      } else {
        mesh.rotation.y = Math.PI / 2;
        mesh.position.set(0, position.y, position.z);
        axisU.value.set(0, 0, 1);
        axisV.value.set(0, 1, 0);
      }
      mesh.scale.setScalar(extent * 2);
      mesh.updateMatrixWorld();
    },
    dispose() {
      mesh.geometry.dispose();
      material.dispose();
    },
  };
}
