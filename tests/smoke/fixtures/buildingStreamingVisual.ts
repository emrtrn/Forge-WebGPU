import { AmbientLight, type Scene } from "three/webgpu";

/** Inspection lighting for the unlit rooms of the city fixture. */
export function addBuildingInspectionLight(scene: Scene): void {
  scene.add(new AmbientLight("#ffffff", 1.6));
}
