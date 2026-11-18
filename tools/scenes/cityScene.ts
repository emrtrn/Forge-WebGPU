// Pure R9c benchmark scene. The writer owns project paths and file I/O.
import { createHash } from "node:crypto";
import { componentTypeTag, type ActorId, type ComponentMap, type PlainActor, type Vec3 } from "../../src/core/index.ts";
import { mulberry32 } from "../../src/engine/worldbuilder/parcels.ts";
import { DirectionalLight } from "../../src/features/light/schema.ts";
import { Shape, SHAPE_BASE_SIZE } from "../../src/features/shape/schema.ts";
import { StaticMesh } from "../../src/features/static-mesh/schema.ts";
import { cityModels, type CityModelSpec } from "./cityModels.ts";
import { indoorScene, type IndoorPose } from "./indoorScene.ts";

const BLOCK = 80;
const ROAD = 10;
const SIDEWALK = 3;
const PITCH = BLOCK + ROAD + 2 * SIDEWALK;
const ROOMS = 3;
const ROOM = 6;
const WALL = .3;
const FLOOR_HEIGHT = 3.2;
const WALL_HEIGHT = 3;
const DOOR_WIDTH = 1.6;
const DOOR_HEIGHT = 2.2;
const EYE = 1.7;

export interface CitySceneOptions {
  readonly seed?: number;
  /** Blocks per side; the default eight give 768 × 768 m. */
  readonly blocks?: number;
  readonly smallObjects?: number;
  readonly heavy?: boolean;
}

export interface CityScene {
  readonly actors: PlainActor[];
  readonly models: CityModelSpec[];
  readonly poses: readonly IndoorPose[];
  /** Waypoints in travel order. The runner controls the walking speed. */
  readonly walk: readonly Vec3[];
  readonly bounds: { readonly min: Vec3; readonly max: Vec3 };
  readonly settings: { readonly cellSize: number; readonly loadRange: number; readonly viewDistance: number };
  readonly counts: {
    readonly buildings: number;
    readonly indoorBuildings: number;
    readonly courtyards: number;
    readonly twoStorey: number;
    readonly landmarks: number;
    readonly furniture: number;
    readonly heavyFurniture: number;
    readonly lamps: number;
    readonly benches: number;
    readonly bins: number;
    readonly hydrants: number;
    readonly signals: number;
    readonly shelters: number;
    readonly smallObjects: number;
    readonly trees: number;
    readonly vehicles: number;
    readonly meshPlacements: number;
    readonly modelSlots: number;
  };
}

type StreetSide = "north" | "south" | "west" | "east";
const SIDES: readonly StreetSide[] = ["north", "south", "west", "east"];
interface Block {
  readonly x: number;
  readonly z: number;
}
interface Frontage extends Block {
  readonly side: StreetSide;
}

function streetPosition({ x, z, side }: Frontage, along: number, inset: number, y: number): Vec3 {
  switch (side) {
    case "north": return [x + along, y, z + inset];
    case "south": return [x + along, y, z + PITCH - inset];
    case "west": return [x + inset, y, z + along];
    case "east": return [x + PITCH - inset, y, z + along];
  }
}

function pick<T>(list: readonly T[], index: number): T {
  return list[index % list.length]!;
}

export function cityScene(options: CitySceneOptions = {}): CityScene {
  const { seed = 1, blocks = 8, heavy = false } = options;
  const scaleCount = (n: number) => Math.round(n * blocks * blocks / 64);
  const smallObjects = options.smallObjects ?? scaleCount(20_000);
  if (!Number.isInteger(seed) || seed < 0 || seed > 0xffffffff) throw new Error("City seed must be a uint32.");
  if (!Number.isInteger(blocks) || blocks < 3 || blocks > 16) throw new Error("City block count must be an integer from 3 to 16.");
  if (!Number.isSafeInteger(smallObjects) || smallObjects < 0) throw new Error("City small object count must be a nonnegative integer.");

  const random = mulberry32(seed);
  const range = (min: number, max: number) => min + random() * (max - min);
  const catalog = cityModels(heavy);
  const actors: PlainActor[] = [];
  const models = new Map<string, CityModelSpec>();
  let meshPlacements = 0;
  const idPrefix = createHash("sha256").update(`forge-city:${seed}`).digest("hex").slice(0, 20);
  const add = (name: string, p: Vec3, s: Vec3, components: ComponentMap, spatiallyLoaded = true, yaw = 0) => {
    const id: ActorId = `act_${idPrefix}${(actors.length + 1).toString(16).padStart(12, "0")}`;
    actors.push({ id, name, class: null, parent: null, spatiallyLoaded,
      transform: { p, r: [0, Math.sin(yaw / 2), 0, Math.cos(yaw / 2)], s }, components });
  };
  const mesh = (model: CityModelSpec, label: string, p: Vec3, size: Vec3, yaw = 0, landmark = false) => {
    models.set(model.id, model);
    meshPlacements += 1;
    add(label, p, size, { mesh: { type: componentTypeTag(StaticMesh), parent: null, mesh: model.id,
      collision: false, castShadow: true, landmark } }, true, yaw);
  };
  const shape = (name: string, p: Vec3, size: Vec3, color: string, solid: "cube" | "cylinder" = "cube", spatial = true) => {
    const s: Vec3 = [size[0] / SHAPE_BASE_SIZE, size[1] / SHAPE_BASE_SIZE, size[2] / SHAPE_BASE_SIZE];
    add(name, p, s, { shape: { type: componentTypeTag(Shape), parent: null, primitive: solid, color,
      castShadow: spatial, collision: false, landmark: false } }, spatial);
  };

  const extent = blocks * PITCH;
  add("City sun", [0, 0, 0], [1, 1, 1], { light: {
    type: componentTypeTag(DirectionalLight), parent: null, atmosphereSun: true, cascadedShadows: true,
    local: { p: [0, 0, 0], r: [-.5, 0, 0, Math.sqrt(3) / 2], s: [1, 1, 1] },
  } }, false);
  // The ground is below every walking surface. Roads stay flat and persistent.
  shape("City ground", [extent / 2, -.18, extent / 2], [extent, .2, extent], "#727476", "cube", false);
  for (let i = 0; i <= blocks; i += 1) {
    const min = Math.max(0, i * PITCH - ROAD / 2);
    const max = Math.min(extent, i * PITCH + ROAD / 2);
    shape("Road east-west", [extent / 2, -.07, (min + max) / 2], [extent, .1, max - min], "#383c41", "cube", false);
    // Break the cross streets at intersections to avoid coplanar surfaces.
    for (let j = 0; j < blocks; j += 1) {
      shape("Road north-south", [(min + max) / 2, -.07, (j + .5) * PITCH], [max - min, .1, PITCH - ROAD], "#383c41", "cube", false);
    }
  }

  const urbanBlocks: Block[] = [];
  const frontages: Frontage[] = [];
  const middle = Math.floor(blocks / 2);
  const plaza = { x: middle * PITCH, z: middle * PITCH };
  for (let row = 0; row < blocks; row += 1) {
    for (let col = 0; col < blocks; col += 1) {
      const x = col * PITCH, z = row * PITCH;
      const isPlaza = x === plaza.x && z === plaza.z;
      if (!isPlaza) urbanBlocks.push({ x, z });
      for (const side of SIDES) frontages.push({ x, z, side });
      shape(isPlaza ? "Plaza paving" : "Block paving", [x + PITCH / 2, -.055, z + PITCH / 2],
        [PITCH - ROAD, .1, PITCH - ROAD], isPlaza ? "#aa9c8a" : "#8d8983", "cube", false);
    }
  }

  const indoorCount = Math.min(urbanBlocks.length, Math.max(5, scaleCount(26)));
  // Reserve an ordinary interior by the plaza and one landmark on the plaza's far side.
  const primary = urbanBlocks.find(({ x, z }) => x === plaza.x && z === plaza.z - PITCH)!;
  const remainingBlocks = urbanBlocks.filter(block => block !== primary);
  const indoors = [primary, ...Array.from({ length: indoorCount - 1 }, (_, i) =>
    remainingBlocks[Math.floor(i * remainingBlocks.length / (indoorCount - 1))]!)];
  const indoorIndex = new Map(indoors.map((block, i) => [block, i]));
  const landmarkBlock = urbanBlocks.find(({ x, z }) => z === plaza.z && x === plaza.x - PITCH)!;

  const furnitureOffsets = [-2.25, -1.25, 1.25, 2.25].flatMap(x =>
    [-2.25, -1.25, 1.25, 2.25].filter(z => Math.abs(x) > 2 || Math.abs(z) > 2).map(z => [x, z] as const));
  const rooms: Vec3[] = [];
  let furniture = 0, heavyFurniture = 0, buildings = 0;
  const storey = (label: string, ox: number, y: number, oz: number,
    roof: "closed" | "courtyard" | "upper-floor", hasEntrance: boolean) => {
    const shell = indoorScene({ roomsX: ROOMS, roomsZ: ROOMS, roomSize: ROOM, wallHeight: WALL_HEIGHT,
      wallThickness: WALL, doorWidth: DOOR_WIDTH, doorHeight: DOOR_HEIGHT, propsPerRoom: 0, origin: [ox, y, oz] });
    for (const actor of shell.actors) {
      if (/^Wall outer [xz](0|3)_/.test(actor.name)) continue;
      add(`${label} ${actor.name}`, [...actor.transform.p], [...actor.transform.s],
        { shape: { ...actor.components.shape, parent: null } });
    }

    for (const side of SIDES) {
      const acrossX = side === "west" || side === "east";
      const edge = (side === "east" || side === "south") ? ROOMS * ROOM : 0;
      for (let i = 0; i < ROOMS; i += 1) {
        const along = (i + .5) * ROOM;
        const piece = (name: string, offset: number, bottom: number, length: number, height: number, color = "#a5a9b0") => {
          const p: Vec3 = [ox + (acrossX ? edge : along + offset), y + bottom + height / 2,
            oz + (acrossX ? along + offset : edge)];
          shape(`${label} ${name}`, p, acrossX ? [WALL, height, length] : [length, height, WALL], color);
        };
        const entrance = hasEntrance && side === "north" && i === 1;
        const opening = entrance ? DOOR_WIDTH : 1.7;
        const cheek = (ROOM - opening) / 2;
        piece("Facade wall", -(ROOM + opening) / 4, 0, cheek, WALL_HEIGHT);
        piece("Facade wall", (ROOM + opening) / 4, 0, cheek, WALL_HEIGHT);
        piece("Facade lintel", 0, DOOR_HEIGHT, opening, WALL_HEIGHT - DOOR_HEIGHT);
        if (entrance) {
          // The current zone generator floods through exterior openings before
          // finding rooms. Keep a distinct closed entrance leaf for the baseline.
          piece("Entrance door", 0, 0, opening, DOOR_HEIGHT, "#5b4235");
        } else {
          piece("Window sill", 0, 0, opening, 1);
        }
      }
    }

    for (let row = 0; row < ROOMS; row += 1) {
      for (let col = 0; col < ROOMS; col += 1) {
        const x = ox + (col + .5) * ROOM, z = oz + (row + .5) * ROOM;
        rooms.push([x, y, z]);
        // In a two-storey building the upper floor is also the lower ceiling.
        if (roof === "closed" || (roof === "courtyard" && (row !== 1 || col !== 1))) {
          shape(`${label} Ceiling ${col}_${row}`, [x, y + WALL_HEIGHT + .1, z], [ROOM, .2, ROOM], "#b7b4a8");
        }
        for (const [dx, dz] of furnitureOffsets) {
          const index = heavy ? (furniture % 2 === 0 ? Math.floor(furniture / 2) % 8 : 8 + Math.floor(furniture / 2) % 7)
            : furniture % catalog.furniture.length;
          const item = catalog.furniture[index]!;
          const size: Vec3 = [range(.45, .7), range(.35, .75), range(.45, .7)];
          mesh(item, `${label} Furniture`, [x + dx, y + size[1] / 2, z + dz], size, range(0, Math.PI * 2));
          furniture += 1;
          if (heavy && index >= 8) heavyFurniture += 1;
        }
      }
    }
  };

  const lotCenter = (offset: number) => (PITCH - BLOCK) / 2 + offset * BLOCK / 4;
  for (const block of urbanBlocks) {
    for (const [lot, [dx, dz]] of ([[1, 1], [3, 1], [1, 3], [3, 3]] as const).entries()) {
      const x = block.x + lotCenter(dx), z = block.z + lotCenter(dz);
      const interior = lot === 0 ? indoorIndex.get(block) : undefined;
      const landmark = block === landmarkBlock && lot === 1;
      const name = `Building ${buildings + 1}`;
      const model = pick(catalog.buildings, buildings++);
      if (interior === undefined) {
        const dimensions: Vec3 = [range(18, 36), landmark ? 120 : range(8, 40), range(18, 36)];
        mesh(model, name, [x, dimensions[1] / 2, z], dimensions, 0, landmark);
        continue;
      }

      const courtyard = interior === 1 || interior === 2;
      const twoStorey = interior === 3 || interior === 4;
      const half = ROOMS * ROOM / 2;
      storey(name, x - half, 0, z - half, twoStorey ? "upper-floor" : courtyard ? "courtyard" : "closed", true);
      if (twoStorey) storey(`${name} upper`, x - half, FLOOR_HEIGHT, z - half, "closed", false);
      const capBase = twoStorey ? 2 * FLOOR_HEIGHT : FLOOR_HEIGHT;
      const capHeight = range(8, 40) - capBase;
      // Above the rooms, retain the same representative five-slot mesh. On
      // courtyard buildings put it on the rear wing to leave the sky opening.
      const capDepth = courtyard ? ROOM : 2 * half + WALL;
      mesh(model, name, [x, capBase + capHeight / 2, z + (courtyard ? ROOM : 0)],
        [2 * half + WALL, capHeight, capDepth]);
    }
  }

  shape("Plaza fountain", [plaza.x + PITCH / 2, .42, plaza.z + PITCH / 2], [6, .84, 6], "#777d82", "cylinder");
  shape("Plaza fountain water", [plaza.x + PITCH / 2, .845, plaza.z + PITCH / 2], [5.6, .01, 5.6], "#587f9c", "cylinder");
  // For each population distribute the target across all four block faces.
  // Stagger categories and reserve the intersection area for signals.
  const line = (model: CityModelSpec, count: number, size: Vec3, phase: number, inset: number) => {
    for (let i = 0; i < count; i += 1) {
      const front = pick(frontages, i);
      const row = Math.floor(i / frontages.length);
      const rows = Math.floor((count - 1 - (i % frontages.length)) / frontages.length) + 1;
      const along = 12 + (row + phase) * (PITCH - 24) / rows;
      const yaw = front.side === "west" || front.side === "east" ? Math.PI / 2 : 0;
      mesh(model, model.name, streetPosition(front, along, inset, size[1] / 2), size, yaw);
    }
  };
  const lamps = scaleCount(1152), benches = scaleCount(576), bins = scaleCount(576);
  const hydrants = scaleCount(300), shelters = scaleCount(60);
  line(catalog.lamps, lamps, [.65, 4.6, .65], .15, 5.5);
  line(catalog.benches, benches - 4, [1.8, .72, .58], .36, 7.4);
  line(catalog.bins, bins, [.5, .75, .5], .55, 7.5);
  line(catalog.hydrants, hydrants, [.45, .67, .45], .78, 6.1);
  line(catalog.shelters, shelters, [3, 2.35, 1.1], .88, 7.5);

  let signals = 0;
  for (let row = 0; row <= blocks; row += 1) {
    for (let col = 0; col <= blocks; col += 1) {
      const offset = (index: number, sign: number) => index === 0 ? (sign > 0 ? 6.3 : 1.4)
        : index === blocks ? (sign < 0 ? -6.3 : -1.4) : sign * 6.3;
      for (const dx of [-1, 1]) for (const dz of [-1, 1]) {
        mesh(catalog.signals, "Traffic signal", [col * PITCH + offset(col, dx), 1.65, row * PITCH + offset(row, dz)],
          [.65, 3.3, .65], dx > 0 ? 0 : Math.PI);
        signals += 1;
      }
    }
  }

  const trees = scaleCount(2300);
  for (let i = 0; i < trees - 4; i += 1) {
    const front = pick(frontages, i);
    const rows = Math.floor((trees - 5 - (i % frontages.length)) / frontages.length) + 1;
    const along = 12 + (Math.floor(i / frontages.length) + .66) * (PITCH - 24) / rows;
    const height = range(4, 7);
    mesh(pick(catalog.trees, Math.floor(i / frontages.length) + i), "Street tree",
      streetPosition(front, along, 7.6, height / 2), [2.6, height, 2.6]);
  }
  for (const dx of [32, 64]) for (const dz of [32, 64]) {
    mesh(pick(catalog.trees, (dx + dz) / 32), "Plaza tree", [plaza.x + dx, 3, plaza.z + dz], [3.5, 6, 3.5]);
    mesh(catalog.benches, "Plaza bench", [plaza.x + dx + 3, .36, plaza.z + dz], [1.8, .72, .58]);
  }

  const vehicles = scaleCount(400);
  for (let i = 0; i < vehicles; i += 1) {
    const front = pick(frontages, i);
    const along = Math.floor(i / frontages.length) * 34 + range(16, 38);
    const yaw = front.side === "north" || front.side === "south" ? Math.PI / 2 : 0;
    mesh(pick(catalog.vehicles, i + Math.floor(i / frontages.length)), "Parked vehicle",
      streetPosition(front, along, 3.55, .76), [1.9, 1.52, 4.4], yaw);
  }
  for (let i = 0; i < smallObjects; i += 1) {
    const model = pick(catalog.small, i);
    const height = range(.16, .72);
    const width = range(.13, .46);
    const size: Vec3 = [width, height, width];
    let p: Vec3;
    if (i % 10 === 0) {
      const [x, y, z] = pick(rooms, Math.floor(i / 10));
      p = [x + range(-2.35, 2.35), y + height / 2, z + range(-2.35, 2.35)];
    } else {
      p = streetPosition(pick(frontages, i), range(10, PITCH - 10), range(5.6, 7.6), height / 2);
    }
    mesh(model, model.name, p, size, range(0, Math.PI * 2));
  }

  const x = primary.x + lotCenter(1), z = primary.z + lotCenter(1);
  const doorZ = z - ROOMS * ROOM / 2;
  const px = plaza.x + PITCH / 2, pz = plaza.z + PITCH / 2;
  const walk: Vec3[] = [[x - 12, EYE, primary.z + 7], [x, EYE, primary.z + 7],
    [x, EYE, doorZ], [x, EYE, z], [x, EYE, doorZ], [x, EYE, primary.z + 7], [x + 8, EYE, primary.z + 7]];
  return {
    actors, models: [...models.values()],
    bounds: { min: [0, -.28, 0], max: [extent, 120, extent] },
    settings: { cellSize: 128, loadRange: 384, viewDistance: 1_500 },
    poses: [
      { id: "street", position: [plaza.x + 5.5, EYE, PITCH / 2], target: [plaza.x + 5.5, EYE, extent] },
      { id: "square", position: [px, EYE, pz - 4], target: [landmarkBlock.x + lotCenter(3), 24, landmarkBlock.z + lotCenter(1)] },
      { id: "inside", position: [x, EYE, z], target: [x, EYE, z - ROOM] },
      { id: "threshold", position: [x, EYE, doorZ - .25], target: [x, EYE, z] },
      { id: "facade", position: [x + ROOM, EYE, doorZ - 15], target: [x + ROOM, EYE, doorZ] },
      { id: "high", position: [px, 120, Math.max(0, pz - 150)], target: [px, 60, Math.max(0, pz - 150) + 60 * Math.sqrt(3)] },
    ],
    walk,
    counts: { buildings, indoorBuildings: indoorCount, courtyards: 2, twoStorey: 2, landmarks: 1, furniture, heavyFurniture,
      lamps, benches, bins, hydrants, signals, shelters, smallObjects, trees, vehicles, meshPlacements,
      modelSlots: [...models.values()].reduce((sum, model) => sum + model.slots.length, 0) },
  };
}
