import assert from "node:assert/strict";
import { test } from "vitest";
import { familyMemory, memoryText, meshBytes } from "./recipeMemory.ts";

test("the PG3 tree's textures are the plan's numbers (§8)", () => {
  const memory = familyMemory({ atlasSize: 1024, impostor: { views: 8, frameSize: 128 }, prototypes: 3, meshBytes: 0 });
  assert.equal(memoryText(memory.atlas), "1.3 MiB");
  assert.equal(memoryText(memory.impostors / 3), "5.3 MiB");
  assert.equal(memoryText(memory.total), "17.3 MiB");
});

test("a grass tuft has meshes only", () => {
  const mesh = { positions: new Float32Array(9), normals: new Float32Array(9), indices: new Uint32Array(3), colors: new Float32Array(12), attributes: { wind: new Float32Array(12) } };
  const bytes = meshBytes([mesh, { positions: new Float32Array(3), normals: new Float32Array(3), indices: new Uint32Array(0) }]);
  assert.equal(bytes, 36 + 36 + 12 + 48 + 48 + 24);
  assert.deepEqual(familyMemory({ atlasSize: null, impostor: null, prototypes: 2, meshBytes: bytes }), { atlas: 0, impostors: 0, meshes: 408, total: 408 });
  assert.equal(memoryText(408), "408 B");
  assert.equal(memoryText(2048), "2 KiB");
});
