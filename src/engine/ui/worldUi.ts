import { createServiceKey, type ActorId, type AssetId, type Vec2, type Vec3 } from "../../core/index.ts";
import type { UiLocaleTable } from "./uiLocale.ts";
import type { UiThemeDef } from "./uiTheme.ts";
import type { UiFieldValue } from "./uiViewModel.ts";

export interface WidgetHandle {
  dispose(): void;
}

export interface WidgetOptions {
  readonly interactive?: boolean;
  readonly onMessage?: (message: string, node: string) => void;
  readonly theme?: UiThemeDef;
  readonly anchor?: WidgetAnchor;
}

export interface WidgetAnchor {
  readonly actor?: ActorId;
  /** An absolute point, or a local offset when an actor is supplied. */
  readonly position?: Readonly<Vec3>;
  readonly offset?: Readonly<Vec2>;
  readonly maxDistance?: number;
}

export interface UiService {
  show(asset: AssetId, options?: WidgetOptions): Promise<WidgetHandle | null>;
  set(fields: Readonly<Record<string, UiFieldValue>>): void;
  registerLocale(table: UiLocaleTable): void;
  setLocale(locale: string): void;
}

export const UiServiceKey = createServiceKey<UiService>("forge.ui");
