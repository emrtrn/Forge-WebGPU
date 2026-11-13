import { describe, expect, test } from "vitest";
import { CAMERA_POSE_KEY, consumeCameraPose, parseCameraPose } from "./cameraPose.ts";

function memoryStorage(initial: Record<string, string> = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItem: (key: string) => values.get(key) ?? null,
    removeItem: (key: string) => void values.delete(key),
    values,
  };
}

describe("camera pose handoff", () => {
  const pose = { position: [1, 2, 3], quaternion: [0, 0, 0, 1] };

  test("read once, then cleared", () => {
    const storage = memoryStorage({ [CAMERA_POSE_KEY]: JSON.stringify(pose) });
    expect(consumeCameraPose(storage)).toEqual(pose);
    expect(storage.values.has(CAMERA_POSE_KEY)).toBe(false);
    expect(consumeCameraPose(storage)).toBeNull();
  });

  test("malformed values fall back to the default framing", () => {
    expect(parseCameraPose("{")).toBeNull();
    expect(parseCameraPose(JSON.stringify({ position: [1, 2], quaternion: [0, 0, 0, 1] }))).toBeNull();
    expect(parseCameraPose(JSON.stringify({ position: [1, 2, "3"], quaternion: [0, 0, 0, 1] }))).toBeNull();
    expect(parseCameraPose(JSON.stringify(null))).toBeNull();
    expect(consumeCameraPose(null)).toBeNull();
  });

  test("storage that throws is no pose", () => {
    const storage = {
      getItem: () => {
        throw new Error("denied");
      },
      removeItem: () => undefined,
    };
    expect(consumeCameraPose(storage)).toBeNull();
  });
});
