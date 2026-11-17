// Three-free equivalent of BufferGeometry.computeVertexNormals; ensureNormals also probes decoding.
import type { Document, Primitive } from "@gltf-transform/core";
import type { Vec3 } from "../../src/core/index.ts";
import { cross, normalize, sub, type Mat4 } from "../../src/engine/math/affine.ts";

export function ensureNormals(doc: Document, primitive: Primitive): void {
  if (primitive.getAttribute("NORMAL")) return;
  const position = primitive.getAttribute("POSITION")!;
  const values = new Float32Array(position.getCount() * 3);
  const indices = primitive.getIndices();
  const count = indices?.getCount() ?? position.getCount();
  for (let offset = 0; offset + 2 < count; offset += 3) {
    const corners = [0, 1, 2].map((corner) => indices ? indices.getScalar(offset + corner) : offset + corner);
    if (corners.some((index) => index < 0 || index >= position.getCount())) continue;
    const [a, b, c] = corners.map((index) => position.getElement(index, [0, 0, 0] as Vec3));
    const normal = cross(sub(c!, b!), sub(a!, b!));
    for (const index of corners) for (let channel = 0; channel < 3; channel += 1) values[index * 3 + channel]! += normal[channel]!;
  }
  for (let index = 0; index < position.getCount(); index += 1) {
    values.set(normalize(Array.from(values.subarray(index * 3, index * 3 + 3)) as Vec3), index * 3);
  }
  primitive.setAttribute("NORMAL", doc.createAccessor().setType("VEC3").setArray(values)
    .setBuffer(position.getBuffer() ?? doc.createBuffer()));
}

export function mirrored(matrix: Mat4): boolean {
  const [a, b, c, , d, e, f, , g, h, i] = matrix;
  return a! * (e! * i! - f! * h!) - d! * (b! * i! - c! * h!) + g! * (b! * f! - c! * e!) < 0;
}
