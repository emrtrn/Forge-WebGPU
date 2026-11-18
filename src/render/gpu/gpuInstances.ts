// The instances of one GPU-driven batch (phase 5c step 5.1): world matrices
// and per-instance extras in storage buffers the culling compute pass and the
// vertex stage read, with stable handles over a packed array.
//
// - `add` returns a handle that stays valid until `remove`; slots stay packed
//   (a removal moves the last slot into the hole), so the compute pass reads
//   `0 … count - 1` without gaps.
// - Writes go to the CPU arrays; `flush()` uploads only the slot range that
//   changed since the last flush.
// - The buffers grow by doubling; a growth replaces them and bumps
//   `generation`, so whatever bound the old buffers (compute and material
//   nodes) rebuilds. Nothing else replaces them: a bundle recorded on them
//   stays valid while the capacity holds (5.3).
// - Extras are a vec4 per instance: x the instance's own fade (1 drawn fully;
//   streaming and the editor fade through it later), y the seed's u32 bits
//   (wind phase, tint variation), z the instance's zone slot as a float value
//   (plan 5c R9b: 0 in no zone, always drawn; `gpuDriven.ts` zone masks; a
//   value, not bits: small integers' bits are denormal floats), w free.

import { StorageBufferAttribute } from "three/webgpu";

export const MATRIX_FLOATS = 16;
export const EXTRA_FLOATS = 4;
const MIN_CAPACITY = 64;

export interface GpuInstances {
  readonly count: number;
  readonly capacity: number;
  /** Bumps when the buffers are replaced. */
  readonly generation: number;
  readonly matrixBuffer: StorageBufferAttribute;
  readonly extraBuffer: StorageBufferAttribute;
  /** Adds an instance from 16 column-major floats at `offset`; returns its handle. */
  add(matrix: ArrayLike<number>, offset?: number, seed?: number): number;
  /** Adds `count` instances from `matrices` (16 floats each); returns their handles in order. */
  addMany(matrices: ArrayLike<number>, count: number, seeds?: ArrayLike<number>): number[];
  move(handle: number, matrix: ArrayLike<number>, offset?: number): void;
  setFade(handle: number, fade: number): void;
  /** The instance's zone slot (plan 5c R9b; 0: none). */
  setZone(handle: number, zone: number): void;
  remove(handle: number): void;
  has(handle: number): boolean;
  clear(): void;
  /** The packed matrices `0 … count - 1` (a view, valid until the next change). */
  matrices(): Float32Array;
  /** Uploads what changed since the last flush. */
  flush(): void;
  dispose(): void;
}

function capacityFor(count: number): number {
  let capacity = MIN_CAPACITY;
  while (capacity < count) capacity *= 2;
  return capacity;
}

export function createGpuInstances(initialCapacity = MIN_CAPACITY): GpuInstances {
  let capacity = capacityFor(initialCapacity);
  let matrixArray = new Float32Array(capacity * MATRIX_FLOATS);
  let extraArray = new Float32Array(capacity * EXTRA_FLOATS);
  let seedView = new Uint32Array(extraArray.buffer);
  let matrixBuffer = new StorageBufferAttribute(matrixArray, MATRIX_FLOATS);
  let extraBuffer = new StorageBufferAttribute(extraArray, EXTRA_FLOATS);
  let generation = 0;
  let count = 0;
  /** handle -> slot (-1 free); slot -> handle. */
  let slotOf = new Int32Array(capacity).fill(-1);
  let handleOf = new Int32Array(capacity).fill(-1);
  const freeHandles: number[] = [];
  let nextHandle = 0;
  let dirtyLow = Infinity, dirtyHigh = -1;
  let replaced = false;

  const touch = (slot: number): void => {
    if (slot < dirtyLow) dirtyLow = slot;
    if (slot > dirtyHigh) dirtyHigh = slot;
  };
  const grow = (needed: number): void => {
    if (needed <= capacity) return;
    const next = capacityFor(needed);
    const matrices = new Float32Array(next * MATRIX_FLOATS); matrices.set(matrixArray.subarray(0, count * MATRIX_FLOATS));
    const extras = new Float32Array(next * EXTRA_FLOATS); extras.set(extraArray.subarray(0, count * EXTRA_FLOATS));
    const slots = new Int32Array(next).fill(-1); slots.set(slotOf);
    const handles = new Int32Array(next).fill(-1); handles.set(handleOf);
    matrixBuffer.dispose(); extraBuffer.dispose();
    matrixArray = matrices; extraArray = extras; seedView = new Uint32Array(extras.buffer);
    slotOf = slots; handleOf = handles;
    matrixBuffer = new StorageBufferAttribute(matrixArray, MATRIX_FLOATS);
    extraBuffer = new StorageBufferAttribute(extraArray, EXTRA_FLOATS);
    capacity = next; generation += 1; replaced = true;
  };
  const slotFor = (handle: number): number => {
    const slot = handle >= 0 && handle < slotOf.length ? slotOf[handle]! : -1;
    if (slot < 0) throw new Error(`gpu instances: no instance ${handle}`);
    return slot;
  };
  const writeMatrix = (slot: number, matrix: ArrayLike<number>, offset: number): void => {
    for (let i = 0; i < MATRIX_FLOATS; i += 1) matrixArray[slot * MATRIX_FLOATS + i] = matrix[offset + i]!;
    touch(slot);
  };

  const instances: GpuInstances = {
    get count() { return count; },
    get capacity() { return capacity; },
    get generation() { return generation; },
    get matrixBuffer() { return matrixBuffer; },
    get extraBuffer() { return extraBuffer; },
    add(matrix, offset = 0, seed = 0) {
      // Handles index slotOf, which grows with the capacity: a handle never outnumbers it.
      grow(count + 1);
      const handle = freeHandles.pop() ?? nextHandle++;
      const slot = count++;
      slotOf[handle] = slot; handleOf[slot] = handle;
      writeMatrix(slot, matrix, offset);
      extraArray[slot * EXTRA_FLOATS] = 1;
      seedView[slot * EXTRA_FLOATS + 1] = seed >>> 0;
      extraArray[slot * EXTRA_FLOATS + 2] = 0; extraArray[slot * EXTRA_FLOATS + 3] = 0;
      return handle;
    },
    addMany(matrices, total, seeds) {
      grow(count + total);
      const handles: number[] = [];
      for (let index = 0; index < total; index += 1) handles.push(instances.add(matrices, index * MATRIX_FLOATS, seeds?.[index] ?? 0));
      return handles;
    },
    move(handle, matrix, offset = 0) {
      writeMatrix(slotFor(handle), matrix, offset);
    },
    setFade(handle, fade) {
      const slot = slotFor(handle);
      extraArray[slot * EXTRA_FLOATS] = fade;
      touch(slot);
    },
    setZone(handle, zone) {
      const slot = slotFor(handle);
      if (extraArray[slot * EXTRA_FLOATS + 2] === zone) return;
      extraArray[slot * EXTRA_FLOATS + 2] = zone;
      touch(slot);
    },
    remove(handle) {
      const slot = slotFor(handle);
      const last = count - 1;
      if (slot !== last) {
        matrixArray.copyWithin(slot * MATRIX_FLOATS, last * MATRIX_FLOATS, (last + 1) * MATRIX_FLOATS);
        extraArray.copyWithin(slot * EXTRA_FLOATS, last * EXTRA_FLOATS, (last + 1) * EXTRA_FLOATS);
        const moved = handleOf[last]!;
        slotOf[moved] = slot; handleOf[slot] = moved;
        touch(slot);
      }
      handleOf[last] = -1; slotOf[handle] = -1;
      freeHandles.push(handle);
      count = last;
    },
    has(handle) {
      return handle >= 0 && handle < slotOf.length && slotOf[handle]! >= 0;
    },
    clear() {
      slotOf.fill(-1); handleOf.fill(-1); freeHandles.length = 0; nextHandle = 0; count = 0;
    },
    matrices() {
      return matrixArray.subarray(0, count * MATRIX_FLOATS);
    },
    flush() {
      if (replaced) {
        // A new buffer uploads whole.
        replaced = false;
        matrixBuffer.needsUpdate = true; extraBuffer.needsUpdate = true;
      } else if (dirtyHigh >= dirtyLow) {
        matrixBuffer.clearUpdateRanges(); extraBuffer.clearUpdateRanges();
        matrixBuffer.addUpdateRange(dirtyLow * MATRIX_FLOATS, (dirtyHigh - dirtyLow + 1) * MATRIX_FLOATS);
        extraBuffer.addUpdateRange(dirtyLow * EXTRA_FLOATS, (dirtyHigh - dirtyLow + 1) * EXTRA_FLOATS);
        matrixBuffer.needsUpdate = true; extraBuffer.needsUpdate = true;
      }
      dirtyLow = Infinity; dirtyHigh = -1;
    },
    dispose() {
      matrixBuffer.dispose(); extraBuffer.dispose();
      instances.clear();
    },
  };
  return instances;
}
