import { createServiceKey } from "../../core/index.ts";

export type WorldJsonLoader = (asset: string) => Promise<unknown>;
export const WorldJsonAssetsKey = createServiceKey<WorldJsonLoader>("forge.world.assets");
