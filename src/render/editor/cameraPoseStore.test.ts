import { PerspectiveCamera } from "three/webgpu";
import { describe, expect, test } from "vitest";
import { createEditorCameraPoseStore, parseEditorCameraPose } from "./cameraPoseStore.ts";

function memoryStorage() {
  const items = new Map<string, string>();
  let writes = 0;
  return {
    items,
    get writes() {
      return writes;
    },
    getItem: (key: string) => items.get(key) ?? null,
    setItem: (key: string, value: string) => {
      writes += 1;
      items.set(key, value);
    },
  };
}

describe("the editor viewport's remembered pose (Forge's EditorCameraPoseStore, plan phase 4 step 3)", () => {
  test("nothing kept: the default framing stays; a saved pose comes back for the same level only", () => {
    const storage = memoryStorage();
    const camera = new PerspectiveCamera();
    expect(createEditorCameraPoseStore(storage, "Demo/content/levels/main").restore(camera)).toBe(false);
    camera.position.set(1, 2, 3);
    camera.lookAt(4, 0, -2);
    createEditorCameraPoseStore(storage, "Demo/content/levels/main").save(camera);

    const restored = new PerspectiveCamera();
    expect(createEditorCameraPoseStore(storage, "Demo/content/levels/main").restore(restored)).toBe(true);
    expect(restored.position.toArray()).toEqual([1, 2, 3]);
    expect(restored.quaternion.angleTo(camera.quaternion)).toBeCloseTo(0);
    expect(createEditorCameraPoseStore(storage, "Demo/content/levels/other").restore(new PerspectiveCamera())).toBe(false);
  });

  test("frame-loop writes are throttled and unchanged poses are not written again", () => {
    const storage = memoryStorage();
    const store = createEditorCameraPoseStore(storage, "level");
    const camera = new PerspectiveCamera();
    store.maybeSave(camera, 0);
    camera.position.x = 1;
    store.maybeSave(camera, 300);
    expect(storage.writes).toBe(1);
    store.maybeSave(camera, 800);
    expect(storage.writes).toBe(2);
    store.save(camera);
    expect(storage.writes).toBe(2);
  });

  test("a corrupt or partial pose is ignored; no storage keeps nothing", () => {
    expect(parseEditorCameraPose("{")).toBeNull();
    expect(parseEditorCameraPose('{"position":[0,0,0],"quaternion":[0,0,0,1]}')).toBeNull();
    expect(parseEditorCameraPose('{"position":[0,0,"x"],"quaternion":[0,0,0,1],"up":[0,1,0]}')).toBeNull();
    const store = createEditorCameraPoseStore(null, "level");
    store.save(new PerspectiveCamera());
    expect(store.restore(new PerspectiveCamera())).toBe(false);
  });
});
