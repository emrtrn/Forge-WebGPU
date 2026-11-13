// Control: a feature's editor helper drawing owns three and may use the
// editor's 3D code. Not a violation by itself.
import { Mesh } from "three/webgpu";
import { overlay } from "../../render/editor/overlay";

export const sleetHelper = { mesh: new Mesh(), overlay };
