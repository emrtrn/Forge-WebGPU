import { expect, test } from "vitest";
import { BoxGeometry, Group, Mesh, MeshStandardMaterial } from "three/webgpu";
import { applyModelVertexColors, applyUvwMapping } from "../resources/modelSetup.ts";

test("vertex defaults apply by topology; a mismatch keeps geometry and source data", () => {
  const root = new Group(), mesh = new Mesh(new BoxGeometry(), new MeshStandardMaterial()); mesh.name = "Cube"; root.add(mesh);
  const count = mesh.geometry.getAttribute("position").count, colors = Array.from({ length: count * 4 }, (_, i) => i % 4 === 3 ? 0.5 : 1);
  const entry = { meshName: "Cube", primitiveIndex: 0, vertexCount: count, colors };
  applyModelVertexColors(root, [entry]); expect(mesh.geometry.getAttribute("color").itemSize).toBe(4); expect(mesh.material.vertexColors).toBe(true);
  const attribute = mesh.geometry.getAttribute("color"), warnings: string[] = [];
  applyModelVertexColors(root, [{ ...entry, vertexCount: count + 1 }], (message) => warnings.push(message));
  expect(warnings).toHaveLength(1); expect(mesh.geometry.getAttribute("color")).toBe(attribute); expect(entry.colors).toBe(colors);
  mesh.geometry.dispose(); mesh.material.dispose();
});

test("draft UVW uses a geometry clone and can leave shared texture state alone", () => {
  const source = new BoxGeometry(), mesh = new Mesh(source.clone(), new MeshStandardMaterial()), root = new Group(); root.add(mesh);
  const original = Array.from(source.getAttribute("uv").array);
  applyUvwMapping(root, { mapType: "box", position: [1, 0, 0], rotation: [0, 0, 0], scale: [2, 2, 2] }, false);
  expect(Array.from(source.getAttribute("uv").array)).toEqual(original);
  expect(Array.from(mesh.geometry.getAttribute("uv").array)).not.toEqual(original);
  source.dispose(); mesh.geometry.dispose(); mesh.material.dispose();
});
