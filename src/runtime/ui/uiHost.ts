import { createServiceKey, type AssetId, type Vec3 } from "../../core/index.ts";

export type WorldWidgetProjector = (position: Readonly<Vec3>) => { x: number; y: number; distance: number } | null;

export interface BrowserUiHost {
  readonly overlay: HTMLElement;
  load(asset: AssetId): Promise<unknown>;
}

export const BrowserUiHostKey = createServiceKey<BrowserUiHost>("forge.ui.browser");
export const BrowserUiFrameKey = createServiceKey<{ draw(project: WorldWidgetProjector): void }>("forge.ui.frame");
