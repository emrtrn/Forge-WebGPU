// The lit material of `forge.shape`: Forge WebGL's primitive material
// (roughness 0.7, metalness 0, a plane seen from both sides) as a node
// material; the colour is the component's. `forge.material` assets and the
// contribution order come with the material step (plan phase 3, step 4).

import { Color, DoubleSide, FrontSide, MeshStandardNodeMaterial } from "three/webgpu";

export function createShapeMaterial(color: string, doubleSided: boolean): MeshStandardNodeMaterial {
  const material = new MeshStandardNodeMaterial({ roughness: 0.7, metalness: 0 });
  material.color = new Color(color);
  material.side = doubleSided ? DoubleSide : FrontSide;
  material.name = `shape ${color}`;
  return material;
}
