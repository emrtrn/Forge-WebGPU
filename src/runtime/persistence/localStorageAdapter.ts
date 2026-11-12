// Ported from Forge WebGL engine/persistence/saveGameStore.ts @ forge-webgl-final (04b5fb23): the browser
// storage adapter, in the runtime layer because src/engine has no DOM; docs/PORT_LOG.md §2.
import type { StorageAdapter } from "../../engine/persistence/saveGameStore.ts";

export function createLocalStorageAdapter(storage: Storage = localStorage): StorageAdapter {
  return {
    getItem: (key) => storage.getItem(key),
    setItem: (key, value) => storage.setItem(key, value),
    removeItem: (key) => storage.removeItem(key),
    keys: () => {
      const keys: string[] = [];
      for (let index = 0; index < storage.length; index += 1) {
        const key = storage.key(index);
        if (key !== null) keys.push(key);
      }
      return keys;
    },
  };
}
