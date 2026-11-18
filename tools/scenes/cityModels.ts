// Procedural model catalogue for the city benchmark. Geometry is local to
// a unit box. Actor scales supply the world dimensions independently of LOD.
import { createHash } from "node:crypto";
import { BufferUtils, type GLTF } from "@gltf-transform/core";
import type { AssetId, Vec3 } from "../../src/core/index.ts";

type Solid = "box" | "cylinder";
type Color = [number, number, number, number];
type Triangle = [Vec3, Vec3, Vec3];

interface ModelPart {
  readonly solid: Solid;
  readonly center: Vec3;
  readonly size: Vec3;
}

interface CityModelSlot {
  readonly name: string;
  readonly color: Color;
  readonly triangles: number;
  readonly parts: readonly ModelPart[];
}

export interface CityModelSpec {
  readonly id: AssetId;
  readonly name: string;
  readonly slots: readonly CityModelSlot[];
}

const box = (center: Vec3, size: Vec3): ModelPart => ({ solid: "box", center, size });
const cylinder = (center: Vec3, size: Vec3): ModelPart => ({ solid: "cylinder", center, size });
const unitBox = box([0, 0, 0], [1, 1, 1]);
const unitCylinder = cylinder([0, 0, 0], [1, 1, 1]);

interface Finish {
  readonly name: string;
  readonly color: Color;
  readonly parts: readonly ModelPart[];
}

const finish = (name: string, color: Vec3, ...parts: ModelPart[]): Finish =>
  ({ name, color: [...color, 1], parts });

const facade = [
  finish("Facade", [.57, .42, .31], box([0, -.08, 0], [.98, .84, .98])),
  finish("Glass", [.18, .36, .46], box([0, .07, 0], [1, .18, 1])),
  finish("Roof", [.31, .32, .34], box([0, .42, 0], [1, .16, 1])),
  finish("Trim", [.77, .76, .69], box([0, .29, 0], [1, .045, 1])),
  finish("Entrance", [.24, .18, .13], box([0, -.36, -.49], [.16, .25, .02])),
];
const wood = finish("Wood", [.47, .28, .14], box([0, .09, 0], [1, .18, 1]));
const metal = finish("Frame", [.29, .30, .31], box([0, -.14, 0], [.78, .72, .78]));
const foliage = [
  finish("Trunk", [.32, .19, .10], cylinder([0, -.20, 0], [.18, .60, .18])),
  finish("Crown", [.19, .42, .12], cylinder([0, .13, 0], [1, .74, 1])),
];
const vehicle = [
  finish("Body", [.28, .37, .68], box([0, -.10, 0], [1, .53, 1])),
  finish("Windshield", [.13, .20, .24], box([0, .23, -.06], [.81, .50, .56])),
  finish("Tires", [.08, .08, .08], ...[-.34, .34].flatMap(z => [-.43, .43]
    .map(x => cylinder([x, -.31, z], [.14, .38, .24])))),
  finish("Lights", [.86, .78, .49], box([0, -.085, -.49], [.82, .11, .02])),
];

function model(name: string, triangles: number, finishes: readonly Finish[]): CityModelSpec {
  // Names, unlike array offsets, stay stable when new archetypes are added.
  const id: AssetId = `ast_${createHash("sha256").update(`forge-city:${name}`).digest("hex").slice(0, 32)}`;
  const perSlot = Math.floor(triangles / finishes.length);
  return {
    id, name,
    slots: finishes.map((slot, i) => ({ ...slot, triangles: perSlot + (i < triangles % finishes.length ? 1 : 0) })),
  };
}

export function cityModels(heavy: boolean) {
  const numbered = (prefix: string, count: number, make: (name: string, i: number) => CityModelSpec) =>
    Array.from({ length: count }, (_, i) => make(`${prefix}-${String(i + 1).padStart(2, "0")}`, i));
  return {
    buildings: numbered("building", 12, (name, i) => model(name, 2_000 + i * 540, facade.map((slot, index) =>
      index === 0 ? { ...slot, color: [.42 + .025 * i, .48 - .018 * i, .27 + .019 * i, 1] } : slot))),
    furniture: numbered("furniture", 15, (name, i) => {
      const finishes = i < 10 ? [wood, metal] : [finish("Upholstery", [.54, .31, .20], unitBox)];
      return model(name, heavy && i >= 8 ? 36_500 : 200 + i * 120, finishes);
    }),
    lamps: model("lamp", 360, [
      finish("Pole", [.27, .28, .31], cylinder([0, -.05, 0], [.20, .90, .20])),
      finish("Lamp", [.92, .76, .40], box([0, .45, 0], [1, .10, 1])),
    ]),
    benches: model("bench", 300, [wood, metal]),
    bins: model("bin", 320, [
      finish("Bin", [.24, .32, .28], cylinder([0, -.08, 0], [.91, .84, .91])),
      finish("Lid", [.21, .23, .23], cylinder([0, .42, 0], [1, .16, 1])),
    ]),
    hydrants: model("hydrant", 200, [finish("Enamel", [.62, .13, .09], unitCylinder)]),
    signals: model("signal", 480, [
      finish("Pole", [.31, .31, .29], cylinder([0, -.11, 0], [.22, .78, .22])),
      finish("Housing", [.12, .12, .13], box([0, .31, 0], [1, .38, 1])),
      finish("Lens", [.23, .63, .20], cylinder([0, .32, -.45], [.60, .29, .10])),
    ]),
    shelters: model("shelter", 900, [
      finish("Frame", [.31, .33, .38], ...[-.42, .42].map(x => box([x, 0, .36], [.12, 1, .14]))),
      finish("Roof", [.38, .42, .53], box([0, .46, 0], [1, .08, 1])),
      finish("Glass", [.23, .37, .44], box([0, .03, .40], [.88, .73, .07])),
    ]),
    small: [
      model("bottle", 120, [finish("Bottle", [.20, .45, .35], unitCylinder)]),
      model("box", 50, [finish("Cardboard", [.49, .32, .14], unitBox)]),
      model("stone", 150, [finish("Stone", [.54, .51, .44], unitCylinder)]),
      model("sign", 80, [finish("Sign", [.71, .58, .16], box([0, 0, 0], [1, 1, .18]))]),
      model("bollard", 300, [finish("Bollard", [.26, .28, .29], unitCylinder)]),
    ],
    trees: numbered("tree", 3, (name, i) => model(name, 1_500, [
      foliage[0]!, { ...foliage[1]!, color: [.16 + .08 * i, .34 + .07 * i, .12, 1] },
    ])),
    vehicles: numbered("vehicle", 4, (name, i) => model(name, 3_000, [
      { ...vehicle[0]!, color: [.22 + .16 * i, .45 - .07 * i, .62 - .12 * i, 1] }, ...vehicle.slice(1),
    ])),
  };
}

const BOX_QUADS = [[0, 2, 3, 1], [4, 5, 7, 6], [0, 1, 5, 4], [2, 6, 7, 3], [0, 4, 6, 2], [1, 3, 7, 5]];

function faces({ solid, center, size }: ModelPart): Triangle[] {
  const point = (x: number, y: number, z: number): Vec3 =>
    [center[0] + x * size[0], center[1] + y * size[1], center[2] + z * size[2]];
  const triangles: Triangle[] = [];
  const quad = (a: Vec3, b: Vec3, c: Vec3, d: Vec3) => triangles.push([a, b, c], [c, d, a]);
  if (solid === "box") {
    const corners = [-.5, .5].flatMap(z => [-.5, .5].flatMap(y => [-.5, .5].map(x => point(x, y, z))));
    for (const [a, b, c, d] of BOX_QUADS) quad(corners[a!]!, corners[b!]!, corners[c!]!, corners[d!]!);
  } else {
    const sides = 8;
    const ring = (i: number, y: number) => point(.5 * Math.cos(i * Math.PI / 4), y, .5 * Math.sin(i * Math.PI / 4));
    for (let i = 0; i < sides; i += 1) {
      const j = (i + 1) % sides;
      const a = ring(i, -.5), b = ring(j, -.5), c = ring(j, .5), d = ring(i, .5);
      quad(a, d, c, b);
      triangles.push([point(0, -.5, 0), a, b], [point(0, .5, 0), c, d]);
    }
  }
  return triangles;
}

function tessellate(base: Triangle[], target: number) {
  if (!base.length || !Number.isSafeInteger(target) || target < base.length) {
    throw new Error("City model triangle count must fit its base geometry.");
  }
  const positions: number[] = [];
  const normals: number[] = [];
  const indices: number[] = [];
  const perFace = Math.floor(target / base.length);
  const extra = target % base.length;
  for (const [index, [[ax, ay, az], [bx, by, bz], [cx, cy, cz]]] of base.entries()) {
    const u: Vec3 = [bx - ax, by - ay, bz - az], v: Vec3 = [cx - ax, cy - ay, cz - az];
    const x = u[1] * v[2] - u[2] * v[1], y = u[2] * v[0] - u[0] * v[2], z = u[0] * v[1] - u[1] * v[0];
    const length = Math.hypot(x, y, z);
    const vertex = (i: number, j: number): number => {
      const index = positions.length / 3;
      positions.push(ax + i * u[0] + j * v[0], ay + i * u[1] + j * v[1], az + i * u[2] + j * v[2]);
      normals.push(x / length, y / length, z / length);
      return index;
    };
    const budget = perFace + (index < extra ? 1 : 0);
    const n = Math.floor(Math.sqrt(budget));
    let remaining = budget - n * n;
    const rows = Array.from({ length: n + 1 }, (_, i) => Array.from({ length: n + 1 - i }, (_, j) => vertex(i / n, j / n)));
    const emit = (a: number, b: number, c: number, i: number, j: number, inverted: boolean) => {
      if (remaining === 0) {
        indices.push(a, b, c);
        return;
      }
      // A centroid splits a triangle in three without changing its boundary.
      // An odd remainder adds one triangle on a shared edge of the same plane.
      if (remaining >= 2) {
        const offset = inverted ? 2 / 3 : 1 / 3;
        const middle = vertex((i + offset) / n, (j + offset) / n);
        indices.push(a, b, middle, b, c, middle, c, a, middle);
        remaining -= 2;
      } else {
        const middle = vertex((i + .5) / n, (j + .5) / n);
        if (inverted) indices.push(a, b, middle, middle, b, c);
        else indices.push(a, b, middle, a, middle, c);
        remaining = 0;
      }
    };
    for (let i = 0; i < n; i += 1) {
      for (let j = 0; j < n - i; j += 1) {
        const a = rows[i]![j]!, b = rows[i + 1]![j]!, c = rows[i]![j + 1]!;
        emit(a, b, c, i, j, false);
        if (j + 1 < n - i) emit(b, rows[i + 1]![j + 1]!, c, i, j, true);
      }
    }
  }
  return { positions: Float32Array.from(positions), normals: Float32Array.from(normals), indices: Uint32Array.from(indices) };
}

// glTF-Transform's writer is asynchronous. Use its glTF schema and buffer
// helpers to assemble this single-buffer GLB without an asynchronous API.
export function cityModelGlb(spec: CityModelSpec): Uint8Array {
  if (!spec.slots.length) throw new Error("City models need at least one material slot.");
  const accessors: GLTF.IAccessor[] = [];
  const bufferViews: GLTF.IBufferView[] = [];
  const parts: Uint8Array[] = [];
  let byteLength = 0;
  const accessor = (data: Float32Array<ArrayBuffer> | Uint32Array<ArrayBuffer>, type: "VEC3" | "SCALAR",
    bounds?: { min: Vec3; max: Vec3 }) => {
    const bufferView = parts.length;
    const bytes = BufferUtils.toView(data);
    parts.push(bytes);
    bufferViews.push({ buffer: 0, byteOffset: byteLength, byteLength: bytes.length, target: type === "VEC3" ? 34962 : 34963 });
    byteLength += bytes.length;
    return accessors.push({ bufferView, componentType: type === "VEC3" ? 5126 : 5125,
      count: data.length / (type === "VEC3" ? 3 : 1), type, ...bounds }) - 1;
  };
  const primitives = spec.slots.map((slot, material): GLTF.IMeshPrimitive => {
    const { positions, normals, indices } = tessellate(slot.parts.flatMap(faces), slot.triangles);
    const min: Vec3 = [Infinity, Infinity, Infinity], max: Vec3 = [-Infinity, -Infinity, -Infinity];
    for (let i = 0; i < positions.length; i += 3) {
      for (const axis of [0, 1, 2] as const) {
        min[axis] = Math.min(min[axis], positions[i + axis]!);
        max[axis] = Math.max(max[axis], positions[i + axis]!);
      }
    }
    return { attributes: { POSITION: accessor(positions, "VEC3", { min, max }), NORMAL: accessor(normals, "VEC3") },
      indices: accessor(indices, "SCALAR"), material };
  });
  const json: GLTF.IGLTF = {
    asset: { version: "2.0", generator: "Forge city benchmark" },
    scene: 0, scenes: [{ nodes: [0] }], nodes: [{ mesh: 0 }], meshes: [{ name: spec.name, primitives }],
    materials: spec.slots.map(({ name, color }) => ({ name, pbrMetallicRoughness: { baseColorFactor: color, metallicFactor: 0 } })),
    buffers: [{ byteLength }], bufferViews, accessors,
  };
  const jsonBytes = BufferUtils.pad(BufferUtils.encodeText(JSON.stringify(json)), 0x20);
  const chunkHeader = (length: number, type: number) => BufferUtils.toView(new Uint32Array([length, type]));
  const header = BufferUtils.toView(new Uint32Array([0x46546c67, 2, 28 + jsonBytes.length + byteLength]));
  return BufferUtils.concat([header, chunkHeader(jsonBytes.length, 0x4e4f534a), jsonBytes,
    chunkHeader(byteLength, 0x004e4942), ...parts]);
}
