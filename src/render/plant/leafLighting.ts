// How a crown's leaves take light (vegetation plan PG5b, §9.8): three's
// physical model plus the light a thin leaf lets through. A leaf lit from
// behind glows with its own colour, warmer, most toward the light. The light
// colour the term multiplies is already shadowed, so a crown's far side stays
// dark. Mesh cards and the impostor's leaf layer share it.

import { float, normalView, positionViewDirection } from "three/tsl";
import { PhysicalLightingModel, type Node, type NodeBuilder, type NodeMaterial } from "three/webgpu";

type DirectInput = Parameters<PhysicalLightingModel["direct"]>[0];

class LeafLightingModel extends PhysicalLightingModel {
  private readonly through: Node<"vec3">;

  constructor(through: Node<"vec3">) {
    super();
    this.through = through;
  }

  override direct(input: DirectInput, builder: NodeBuilder): void {
    const light = input.lightDirection as Node<"vec3">, color = input.lightColor as Node<"vec3">;
    const behind = float(0.5).sub(normalView.dot(light).mul(0.5)).saturate();
    const toward = positionViewDirection.dot(light.negate()).saturate().pow(3);
    const glow = this.through.mul(color).mul(behind.mul(0.2).add(toward.mul(0.5))).mul(1 / Math.PI);
    (input.reflectedLight.directDiffuse as Node<"vec3">).addAssign(glow);
    super.direct(input, builder);
  }
}

/** `through`: the colour of the light let through, black where the surface is not a leaf. */
export function lightLeaves(material: NodeMaterial, through: Node<"vec3">): void {
  (material as unknown as { setupLightingModel(): PhysicalLightingModel }).setupLightingModel = () => new LeafLightingModel(through);
}
