import { describe, expect, test } from "vitest";
import { createGpuInstances } from "./gpuInstances.ts";

const matrix = (x: number): number[] => [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, x, 0, 0, 1];
const xs = (set: ReturnType<typeof createGpuInstances>): number[] =>
  Array.from({ length: set.count }, (_, slot) => set.matrices()[slot * 16 + 12]!);

describe("gpu instances", () => {
  test("handles stay valid while removals keep the slots packed", () => {
    const set = createGpuInstances(4);
    const [a, b, c, d] = set.addMany([...matrix(1), ...matrix(2), ...matrix(3), ...matrix(4)], 4, [7, 8, 9, 10]);
    set.remove(b!);
    expect(xs(set)).toEqual([1, 4, 3]);
    expect(set.has(b!)).toBe(false);
    set.move(d!, matrix(40));
    set.move(c!, matrix(30));
    expect(xs(set)).toEqual([1, 40, 30]);
    // The freed handle comes back for the next instance; the others keep theirs.
    expect(set.add(matrix(5))).toBe(b);
    expect(xs(set)).toEqual([1, 40, 30, 5]);
    set.remove(a!);
    set.remove(d!);
    expect(xs(set)).toEqual([5, 30]);
    expect(() => set.move(a!, matrix(0))).toThrow(/no instance/);
    // The seed travels with its instance as u32 bits.
    expect(new Uint32Array(set.extraBuffer.array.buffer)[1 * 4 + 1]).toBe(9);
  });

  test("a flush uploads the changed range; a growth replaces the buffers", () => {
    const set = createGpuInstances(64);
    set.addMany(new Float32Array(64 * 16), 64);
    set.flush();
    const buffer = set.matrixBuffer;
    set.move(10, matrix(1));
    set.move(12, matrix(2));
    set.flush();
    expect(buffer.updateRanges).toEqual([{ start: 160, count: 48 }]);
    expect(set.generation).toBe(0);
    set.add(matrix(9));
    expect(set.capacity).toBe(128);
    expect(set.generation).toBe(1);
    expect(set.matrixBuffer).not.toBe(buffer);
    expect(xs(set).slice(10, 13)).toEqual([1, 0, 2]);
  });
});
