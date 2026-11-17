import { describe, expect, test } from 'vitest';
import { indoorScene, SHAPE_SIZE } from './indoorScene.ts';
import type { IndoorActor, IndoorSceneOptions } from './indoorScene.ts';

type Vec3 = readonly [number, number, number];
interface Box { min: Vec3; max: Vec3 }
const EPS = 1e-9;

function boxAt(p: Vec3, size: Vec3): Box {
  return {
    min: [p[0] - size[0] / 2, p[1] - size[1] / 2, p[2] - size[2] / 2],
    max: [p[0] + size[0] / 2, p[1] + size[1] / 2, p[2] + size[2] / 2],
  };
}
function actorBox(actor: IndoorActor): Box {
  const [sx, sy, sz] = actor.transform.s.map(s => s * SHAPE_SIZE) as [number, number, number];
  // Yaw cannot change height. The horizontal bounding circle encloses all yaw angles.
  const diameter = actor.name.startsWith('Prop ') ? Math.hypot(sx, sz) : 0;
  return boxAt(actor.transform.p, [diameter || sx, sy, diameter || sz]);
}
function intersects(a: Box, b: Box): boolean {
  return [0, 1, 2].every(i => a.min[i]! < b.max[i]! - EPS && a.max[i]! > b.min[i]! + EPS);
}

describe('indoorScene', () => {
  test('default counts include shared inner walls, lintels, floors and props', () => {
    const scene = indoorScene();
    const roomsX = 8;
    const roomsZ = 8;
    const outerSegments = 2 * roomsX + 2 * roomsZ;
    const innerSegments = (roomsX - 1) * roomsZ + (roomsZ - 1) * roomsX;
    expect(scene.counts).toEqual({ walls: outerSegments + 3 * innerSegments, floors: 64, props: 768 });
    expect(scene.actors).toHaveLength(scene.counts.walls + 64 + 768);
    expect(scene.actors.filter(a => a.name.startsWith('Lintel '))).toHaveLength(innerSegments);
    expect(scene.actors.filter(a => a.name.startsWith('Wall '))).toHaveLength(outerSegments + 2 * innerSegments);
    for (const actor of scene.actors) {
      expect(actor).toMatchObject({ class: null, parent: null, spatiallyLoaded: false,
        components: { shape: { type: 'forge.shape@2', castShadow: true, collision: false, landmark: false } } });
      expect(actor.components.shape.color).toMatch(/^#[0-9a-f]{6}$/);
      const q = actor.transform.r;
      expect(q[0]).toBe(0);
      expect(q[2]).toBe(0);
      expect(q[1] ** 2 + q[3] ** 2).toBeCloseTo(1, 12);
    }
  });

  test('ids are unique 32-hex values and the seeded output is reproducible', () => {
    const a = indoorScene();
    expect(indoorScene()).toEqual(a);
    expect(indoorScene({ seed: 1 })).toEqual(a);
    expect(new Set(a.actors.map(actor => actor.id)).size).toBe(a.actors.length);
    for (const actor of a.actors) expect(actor.id).toMatch(/^act_[0-9a-f]{32}$/);
    const props = (seed: number) => indoorScene({ seed }).actors
      .filter(actor => actor.name.startsWith('Prop ')).map(actor => actor.transform);
    expect(props(2)).not.toEqual(props(1));
    expect(indoorScene({ seed: 0 })).toEqual(indoorScene({ seed: 0 }));
  });

  test.each([
    {},
    { roomsX: 3, roomsZ: 2, roomSize: 6, wallHeight: 4, wallThickness: 0.4,
      doorWidth: 2, doorHeight: 2.5, propsPerRoom: 24, origin: [-17, 5, 29], seed: 42 },
    { roomsX: 1, roomsZ: 1, seed: -7 },
    { roomsX: 2, roomsZ: 1, propsPerRoom: 0 },
  ] satisfies IndoorSceneOptions[])('geometry respects bounds, walls and door lanes: %j', options => {
    const scene = indoorScene(options);
    const nx = options.roomsX ?? 8;
    const nz = options.roomsZ ?? 8;
    const roomSize = options.roomSize ?? 8;
    const height = options.wallHeight ?? 3;
    const thickness = options.wallThickness ?? 0.3;
    const doorWidth = options.doorWidth ?? 1.6;
    const doorHeight = options.doorHeight ?? 2.2;
    const [ox, oy, oz] = options.origin ?? [0, 0, 0];
    const walls = scene.actors.filter(a => /^(Wall|Lintel) /.test(a.name)).map(actorBox);
    const props = scene.actors.filter(a => a.name.startsWith('Prop '));
    const outside = scene.actors.filter(actor => {
      const box = actorBox(actor);
      return [0, 1, 2].some(i => box.min[i]! < scene.bounds.min[i]! - EPS
        || box.max[i]! > scene.bounds.max[i]! + EPS);
    });
    expect(outside.map(a => a.name)).toEqual([]);
    expect(props.filter(p => walls.some(w => intersects(actorBox(p), w))).map(p => p.name)).toEqual([]);

    const apertures: Box[] = [];
    for (let x = 1; x < nx; x++) {
      for (let z = 0; z < nz; z++) {
        apertures.push(boxAt([ox + x * roomSize, oy + doorHeight / 2, oz + (z + 0.5) * roomSize],
          [thickness, doorHeight, doorWidth]));
      }
    }
    for (let z = 1; z < nz; z++) {
      for (let x = 0; x < nx; x++) {
        apertures.push(boxAt([ox + (x + 0.5) * roomSize, oy + doorHeight / 2, oz + z * roomSize],
          [doorWidth, doorHeight, thickness]));
      }
    }
    expect(apertures.filter(aperture => walls.some(w => intersects(aperture, w)))).toEqual([]);
    for (const prop of props) {
      const box = actorBox(prop);
      expect(box.min[1]).toBeCloseTo(oy, 10);
      const [x, , z] = prop.transform.p;
      const roomX = Math.floor((x - ox) / roomSize);
      const roomZ = Math.floor((z - oz) / roomSize);
      // At least 0.5m from the inward wall faces, even after arbitrary yaw.
      expect(box.min[0] - (ox + roomX * roomSize + thickness / 2)).toBeGreaterThanOrEqual(0.5 - EPS);
      expect(ox + (roomX + 1) * roomSize - thickness / 2 - box.max[0]).toBeGreaterThanOrEqual(0.5 - EPS);
      expect(box.min[2] - (oz + roomZ * roomSize + thickness / 2)).toBeGreaterThanOrEqual(0.5 - EPS);
      expect(oz + (roomZ + 1) * roomSize - thickness / 2 - box.max[2]).toBeGreaterThanOrEqual(0.5 - EPS);
      for (const axis of [0, 2] as const) {
        const centre = (axis === 0 ? ox : oz) + ((axis === 0 ? roomX : roomZ) + 0.5) * roomSize;
        expect(box.max[axis] <= centre - 0.6 + EPS || box.min[axis] >= centre + 0.6 - EPS).toBe(true);
      }
      const size = prop.transform.s.map(s => s * SHAPE_SIZE);
      for (const dimension of size) {
        expect(dimension).toBeGreaterThanOrEqual(0.3 - EPS);
        expect(dimension).toBeLessThanOrEqual(1.2 + EPS);
      }
      if (prop.components.shape.primitive !== 'cube') {
        expect(size[0]).toBe(size[1]);
        expect(size[0]).toBe(size[2]);
      }
    }
    for (const floor of scene.actors.filter(a => a.name.startsWith('Floor '))) {
      expect(actorBox(floor).max[1]).toBeCloseTo(oy, 12);
      expect(floor.transform.s).toEqual([roomSize / SHAPE_SIZE, 0.2 / SHAPE_SIZE, roomSize / SHAPE_SIZE]);
    }
    expect(scene.bounds.max[1]).toBe(oy + height);
  });

  test('all four primitives are represented by the default prop population', () => {
    expect(new Set(indoorScene().actors.filter(a => a.name.startsWith('Prop '))
      .map(a => a.components.shape.primitive))).toEqual(new Set(['cube', 'sphere', 'cylinder', 'cone']));
  });

  test.each([{ roomsX: 8, roomsZ: 8 }, { roomsX: 1, roomsZ: 1 }, { roomsX: 2, roomsZ: 3 }])(
    'poses have eye height, expected directions and an overhead view: %j', grid => {
      const origin = [10, -4, 20] as const;
      const scene = indoorScene({ ...grid, origin });
      expect(scene.poses.map(p => p.id)).toEqual(['room', 'corridor', 'diagonal', 'above']);
      for (const pose of scene.poses.filter(p => p.id !== 'above')) {
        expect(pose.position[1]).toBeCloseTo(origin[1] + 1.7);
        expect(pose.target[1]).toBeCloseTo(origin[1] + 1.7);
        for (const axis of [0, 2] as const) {
          expect(pose.position[axis]).toBeGreaterThan(origin[axis]);
          expect(pose.position[axis]).toBeLessThan(origin[axis] + (axis === 0 ? grid.roomsX : grid.roomsZ) * 8);
        }
        expect(pose.target[0] - pose.position[0]).toBe(50);
        expect(pose.target[2] - pose.position[2]).toBe(pose.id === 'diagonal' ? 50 : 0);
      }
      expect(scene.poses[0]!.position).toEqual([10 + (Math.min(1, grid.roomsX - 1) + 0.5) * 8,
        -4 + 1.7, 20 + (Math.min(1, grid.roomsZ - 1) + 0.5) * 8]);
      expect(scene.poses[1]!.position[2]).toBe(20 + (Math.floor(grid.roomsZ / 2) + 0.5) * 8);
      expect(scene.poses[3]).toEqual({ id: 'above',
        position: [10 + grid.roomsX * 4, -4 + 3 + 25, 20 + grid.roomsZ * 4],
        target: [10 + grid.roomsX * 4, -4, 20 + grid.roomsZ * 4] });
    });

  test.each([
    { roomsX: 0 }, { roomsZ: -1 }, { roomsX: 1.5 }, { roomsZ: Infinity },
    { roomSize: NaN }, { roomSize: 0 }, { wallHeight: -1 }, { wallThickness: 0 },
    { doorWidth: 0 }, { doorHeight: 0 }, { doorWidth: 7.4 }, { doorWidth: 9 },
    { doorHeight: 3 }, { doorHeight: 4 }, { propsPerRoom: -1 }, { propsPerRoom: 1.5 },
    { propsPerRoom: Infinity }, { seed: NaN }, { seed: Infinity },
    { origin: [0, Infinity, 0] }, { origin: [NaN, 0, 0] },
    { roomSize: 2, doorWidth: 1 }, { roomSize: Number.MAX_VALUE, propsPerRoom: 0 },
  ] satisfies IndoorSceneOptions[])('invalid options fail with a diagnostic prefix: %j', options => {
    expect(() => indoorScene(options)).toThrow(/^indoor scene: /);
  });
});
