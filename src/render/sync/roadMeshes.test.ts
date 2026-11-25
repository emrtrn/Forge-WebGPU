import { describe, expect, test } from "vitest";
import { BoxGeometry, Group, InstancedMesh, Matrix4, Mesh, MeshStandardMaterial, PerspectiveCamera, Vector3 } from "three/webgpu";
import type { ActorId } from "../../core/index.ts";
import { resolveQualitySettings } from "../../engine/perf/qualityProfiles.ts";
import type { WorldTerrainSpline } from "../../engine/terrain/terrainTypes.ts";
import { createFlatWorldTerrain } from "../../engine/terrain/worldTerrainCreate.ts";
import { modelMaterialSlots } from "../resources/modelSetup.ts";
import type { ModelTemplate, WorldResources } from "../resources/worldResources.ts";
import { instanceActorsOf } from "./pickTags.ts";
import type { RenderBindingContext } from "./renderBinding.ts";
import { createRoadMeshes, roadMeshPart } from "./roadMeshes.ts";

const ROAD = "ast_00000000000000000000000000000001";

/** A 4 m wide, 10 m long road model, its length along +Z. */
function roadModel(): ModelTemplate {
  const scene = new Group();
  scene.add(new Mesh(new BoxGeometry(4, 0.2, 10, 1, 1, 4), new MeshStandardMaterial({ name: "Asphalt" })));
  return { scene, slots: modelMaterialSlots(scene), slotMaterials: [] };
}

function road(deform: boolean): WorldTerrainSpline {
  return {
    id: "road", coordinateSpace: "world",
    points: [[8, 1, 20], [40, 1, 20], [100, 1, 20]].map((position, i) => ({ id: `p${i}`, position: position as [number, number, number], width: 4, falloff: 1 })),
    segments: [0, 1].map((i) => ({ id: `s${i}`, startPointId: `p${i}`, endPointId: `p${i + 1}`, mesh: { enabled: true, assetId: ROAD, deform, alignToTerrain: true } })),
  };
}

function harness(model: () => Promise<ModelTemplate> = async () => roadModel()) {
  const { def, tiles } = createFlatWorldTerrain({ name: "Valley", tilesX: 2, tilesZ: 1, tileQuads: 64, spacing: 1, baseHeight: 0 });
  def.origin = [0, 0, 0];
  const uses = new Map<string, number>();
  let busy = 0;
  const resources = {
    model: (guid: string) => {
      uses.set(`model:${guid}`, (uses.get(`model:${guid}`) ?? 0) + 1);
      return model();
    },
    release: (key: string) => uses.set(key, (uses.get(key) ?? 0) - 1),
    track: <T,>(work: Promise<T>) => work,
    busy: () => {
      busy += 1;
      return () => void (busy -= 1);
    },
  } as unknown as WorldResources;
  const root = new Group();
  const ctx = { root, resources, quality: () => resolveQualitySettings("high") } as unknown as RenderBindingContext;
  const make = () => createRoadMeshes({ ctx, actor: "act_00000000000000000000000000000001" as ActorId, name: "Valley", input: () => ({ def, tiles, load: async (key) => tiles.get(key)! }) });
  const meshes = (): InstancedMesh[] => {
    const out: InstancedMesh[] = [];
    root.traverse((object) => { if (object instanceof InstancedMesh) out.push(object); });
    return out;
  };
  return { def, root, uses, make, meshes, busy: () => busy };
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));
const camera = new PerspectiveCamera();

describe("spline meshes", () => {
  test("a bent road draws as chunks around the terrain's centre, its model's material, unpicked; a rebuild swaps and frees", async () => {
    const { def, root, uses, make, meshes, busy } = harness();
    def.splines = [road(true)];
    const roads = make();
    expect(busy()).toBe(1);
    await settle();
    roads.sync(camera);
    expect(busy()).toBe(0);
    // 92 m along x around the centre (64): two cells of 128 m, one mesh each.
    expect(roads.stats()).toMatchObject({ chunks: 2, pieces: 0, problems: [], building: false });
    expect(meshes()).toHaveLength(2);
    expect(meshes().every((mesh) => instanceActorsOf(mesh) === null && (mesh.material as MeshStandardMaterial).name === "Asphalt")).toBe(true);
    const matrix = new Matrix4();
    meshes()[0]!.getMatrixAt(0, matrix);
    expect(new Vector3().setFromMatrixPosition(matrix).toArray()).toEqual([64, 0, 32]);
    expect(uses.get(`model:${ROAD}`)).toBe(1);

    const before = meshes();
    def.splines = [{ ...road(true), segments: road(true).segments.slice(0, 1) }];
    roads.rebuild();
    expect(roads.stats().building).toBe(true);
    // The drawn set stays until the new one is ready.
    expect(meshes()).toEqual(before);
    await settle();
    roads.sync(camera);
    expect(meshes()).toHaveLength(1);
    expect(uses.get(`model:${ROAD}`)).toBe(1);

    def.splines = [];
    roads.rebuild();
    await settle();
    roads.sync(camera);
    expect([meshes().length, root.children.length, uses.get(`model:${ROAD}`)]).toEqual([0, 0, 0]);
    roads.dispose();
  });

  test("rigid pieces are one batch per model; a dispose while building frees the uses", async () => {
    const { def, uses, make, meshes, root } = harness();
    def.splines = [road(false)];
    const roads = make();
    await settle();
    roads.sync(camera);
    expect(roads.stats()).toMatchObject({ chunks: 0, pieces: 2 });
    expect(meshes().map((mesh) => mesh.count)).toEqual([2]);
    roads.rebuild();
    roads.dispose();
    await settle();
    expect([meshes().length, root.children.length, uses.get(`model:${ROAD}`)]).toEqual([0, 0, 0]);
  });

  test("a model that fails to load is a problem, not an error", async () => {
    const { def, make, meshes } = harness(async () => { throw new Error("gone"); });
    def.splines = [road(true)];
    const roads = make();
    await settle();
    roads.sync(camera);
    expect(meshes()).toEqual([]);
    expect(roads.stats().problems).toEqual([`Model ${ROAD}: gone`]);
    roads.dispose();
  });

  test("a terrain without spline meshes builds nothing", async () => {
    const { uses, make, root, busy } = harness();
    const roads = make();
    expect(busy()).toBe(0);
    await settle();
    roads.sync(camera);
    expect([root.children.length, uses.size]).toEqual([0, 0]);
  });

  test("a mirrored part keeps its winding outward", () => {
    const geometry = new BoxGeometry(1, 1, 1);
    const plain = roadMeshPart({ geometry, local: new Matrix4() });
    const mirrored = roadMeshPart({ geometry, local: new Matrix4().makeScale(-1, 1, 1) });
    expect([...mirrored.indices!.slice(0, 3)]).toEqual([plain.indices![0], plain.indices![2], plain.indices![1]]);
    expect(mirrored.attributes.position!.values[0]).toBe(-plain.attributes.position!.values[0]!);
  });
});
