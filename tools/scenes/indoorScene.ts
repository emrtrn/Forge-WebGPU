/** Pure, deterministic actor data for the R9a / R9b indoor measurements (rooms, doors, props). No I/O. */
export const SHAPE_SIZE = 0.5;
type Vec3 = readonly [number, number, number];
type Primitive = 'cube' | 'sphere' | 'cylinder' | 'cone';

export interface IndoorSceneOptions {
  readonly roomsX?: number;
  readonly roomsZ?: number;
  readonly roomSize?: number;
  readonly wallHeight?: number;
  readonly wallThickness?: number;
  readonly doorWidth?: number;
  readonly doorHeight?: number;
  readonly propsPerRoom?: number;
  readonly origin?: Vec3;
  readonly seed?: number;
}
export interface IndoorPose {
  readonly id: string;
  readonly position: Vec3;
  readonly target: Vec3;
}
export interface IndoorActor {
  readonly id: string;
  readonly name: string;
  readonly class: null;
  readonly parent: null;
  readonly spatiallyLoaded: false;
  readonly transform: {
    readonly p: Vec3;
    readonly r: readonly [number, number, number, number];
    readonly s: Vec3;
  };
  readonly components: {
    readonly shape: {
      readonly type: 'forge.shape@2';
      readonly primitive: Primitive;
      readonly color: string;
      readonly castShadow: true;
      readonly collision: false;
      readonly landmark: false;
    };
  };
}
export interface IndoorScene {
  readonly actors: readonly IndoorActor[];
  readonly poses: readonly IndoorPose[];
  readonly bounds: { readonly min: Vec3; readonly max: Vec3 };
  readonly counts: { readonly walls: number; readonly floors: number; readonly props: number };
}

export function indoorScene(options: IndoorSceneOptions = {}): IndoorScene {
  const {
    roomsX = 8, roomsZ = 8, roomSize = 8, wallHeight = 3,
    wallThickness = 0.3, doorWidth = 1.6, doorHeight = 2.2,
    propsPerRoom = 12, origin = [0, 0, 0], seed = 1,
  } = options;
  const fail = (message: string): never => { throw new Error(`indoor scene: ${message}`); };
  for (const [name, value] of Object.entries({ roomsX, roomsZ, roomSize, wallHeight,
    wallThickness, doorWidth, doorHeight })) {
    if (!Number.isFinite(value) || value <= 0) fail(`${name} must be positive and finite`);
  }
  if (!Number.isSafeInteger(roomsX) || !Number.isSafeInteger(roomsZ)) fail('room counts must be integers');
  if (!Number.isSafeInteger(propsPerRoom) || propsPerRoom < 0) fail('propsPerRoom must be a nonnegative integer');
  if (!Number.isFinite(seed)) fail('seed must be finite');
  if (origin.length !== 3 || !origin.every(Number.isFinite)) fail('origin must contain three finite numbers');
  if (!(doorWidth < roomSize - 2 * wallThickness)) fail('doorWidth must be less than roomSize - 2*wallThickness');
  if (!(doorHeight < wallHeight)) fail('doorHeight must be less than wallHeight');

  // Reserve full intersecting door lanes, including the complete opening width.
  // A horizontal circumscribed circle makes clearance independent of prop yaw.
  const laneHalf = Math.max(1.2, doorWidth) / 2;
  const edgeInset = wallThickness / 2 + 0.5;
  const radiusLimit = (roomSize / 2 - edgeInset - laneHalf) / 2;
  const maxPropSize = Math.min(1.2, radiusLimit * Math.SQRT2, wallHeight);
  if (propsPerRoom > 0 && maxPropSize < 0.3) fail('room has insufficient space for props and door clearance');
  const [ox, oy, oz] = origin;
  const width = roomsX * roomSize;
  const depth = roomsZ * roomSize;
  if (![width, depth, ox - wallThickness / 2, oz - wallThickness / 2,
    ox + width + wallThickness / 2, oz + depth + wallThickness / 2,
    oy - 0.2, oy + wallHeight + 25].every(Number.isFinite)) fail('building dimensions overflow');

  let state = seed >>> 0;
  const random = (): number => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const actors: IndoorActor[] = [];
  let index = 0;
  const add = (name: string, p: Vec3, size: Vec3, primitive: Primitive = 'cube',
    color = '#a5a9b0', yaw = 0): void => {
    actors.push({
      id: `act_${(seed >>> 0).toString(16).padStart(8, '0')}${(++index).toString(16).padStart(24, '0')}`,
      name, class: null, parent: null, spatiallyLoaded: false,
      transform: { p, r: [0, Math.sin(yaw / 2), 0, Math.cos(yaw / 2)],
        s: [size[0] / SHAPE_SIZE, size[1] / SHAPE_SIZE, size[2] / SHAPE_SIZE] },
      components: { shape: { type: 'forge.shape@2', primitive, color,
        castShadow: true, collision: false, landmark: false } },
    });
  };

  for (let x = 0; x < roomsX; x++) {
    for (let z = 0; z < roomsZ; z++) {
      add(`Floor r${x}_${z}`, [ox + (x + 0.5) * roomSize, oy - 0.1,
        oz + (z + 0.5) * roomSize], [roomSize, 0.2, roomSize], 'cube', '#555b63');
    }
  }
  const floors = actors.length;
  // Each axis enumerates grid lines once, so adjacent rooms share a wall.
  for (const axis of ['x', 'z'] as const) {
    const lines = axis === 'x' ? roomsX : roomsZ;
    const segments = axis === 'x' ? roomsZ : roomsX;
    for (let line = 0; line <= lines; line++) {
      for (let segment = 0; segment < segments; segment++) {
        const piece = (label: string, along: number, bottom: number, length: number, height: number): void => {
          const cross = line * roomSize;
          add(`${label} ${axis}${line}_${segment}`,
            [ox + (axis === 'x' ? cross : along), oy + bottom + height / 2,
              oz + (axis === 'x' ? along : cross)],
            axis === 'x' ? [wallThickness, height, length] : [length, height, wallThickness]);
        };
        const start = segment * roomSize;
        if (line === 0 || line === lines) {
          piece('Wall outer', start + roomSize / 2, 0, roomSize, wallHeight);
        } else {
          const side = (roomSize - doorWidth) / 2;
          piece('Wall left', start + side / 2, 0, side, wallHeight);
          piece('Wall right', start + roomSize - side / 2, 0, side, wallHeight);
          piece('Lintel', start + roomSize / 2, doorHeight, doorWidth, wallHeight - doorHeight);
        }
      }
    }
  }
  const walls = actors.length - floors;
  const primitives: readonly Primitive[] = ['cube', 'sphere', 'cylinder', 'cone'];
  for (let x = 0; x < roomsX; x++) {
    for (let z = 0; z < roomsZ; z++) {
      for (let k = 0; k < propsPerRoom; k++) {
        const primitive = primitives[Math.floor(random() * primitives.length)]!;
        const dimension = (): number => 0.3 + random() * (maxPropSize - 0.3);
        const sx = dimension();
        const sy = primitive === 'cube' ? dimension() : sx;
        const sz = primitive === 'cube' ? dimension() : sx;
        const radius = Math.hypot(sx, sz) / 2;
        const offset = (): number => {
          const low = laneHalf + radius;
          const high = roomSize / 2 - edgeInset - radius;
          return (random() < 0.5 ? -1 : 1) * (low + random() * (high - low));
        };
        const px = ox + (x + 0.5) * roomSize + offset();
        const pz = oz + (z + 0.5) * roomSize + offset();
        const yaw = random() * 2 * Math.PI;
        const color = `#${Math.floor(random() * 0x1000000).toString(16).padStart(6, '0')}`;
        add(`Prop r${x}_${z} #${k}`, [px, oy + sy / 2, pz], [sx, sy, sz], primitive, color, yaw);
      }
    }
  }
  const eye = oy + 1.7;
  // Single-room grids use the last available room rather than an absent (1,1).
  const rx = Math.min(1, roomsX - 1) * roomSize;
  const rz = Math.min(1, roomsZ - 1) * roomSize;
  const room: Vec3 = [ox + rx + roomSize / 2, eye, oz + rz + roomSize / 2];
  const corridor: Vec3 = [ox + roomSize / 2, eye, oz + (Math.floor(roomsZ / 2) + 0.5) * roomSize];
  const corner = Math.min(1, roomSize / 2);
  const diagonal: Vec3 = [ox + rx + corner, eye, oz + rz + corner];
  const centre: Vec3 = [ox + width / 2, oy, oz + depth / 2];
  return {
    actors,
    poses: [
      { id: 'room', position: room, target: [room[0] + 50, eye, room[2]] },
      { id: 'corridor', position: corridor, target: [corridor[0] + 50, eye, corridor[2]] },
      { id: 'diagonal', position: diagonal, target: [diagonal[0] + 50, eye, diagonal[2] + 50] },
      { id: 'above', position: [centre[0], oy + wallHeight + 25, centre[2]], target: centre },
    ],
    // Grid dimensions describe wall centres. Bounds include outer wall thickness
    // and the slabs below the floor top; the above-building camera is excluded.
    bounds: { min: [ox - wallThickness / 2, oy - 0.2, oz - wallThickness / 2],
      max: [ox + width + wallThickness / 2, oy + wallHeight, oz + depth + wallThickness / 2] },
    counts: { walls, floors, props: roomsX * roomsZ * propsPerRoom },
  };
}
