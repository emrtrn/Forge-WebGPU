// Public editor extension contracts deliberately contain no three types.
import type { FormField, SchemaRegistry } from "../../core/index.ts";
import type { AssetCatalog } from "../assets/assetCatalog.ts";
import type { AssetPreviewController } from "../../core/index.ts";
export type { AssetPreviewController, AssetPreviewInfo } from "../../core/index.ts";
export interface AssetEditorExtensionContext {
  readonly document: Document;
  readonly registry: SchemaRegistry;
  readonly catalog: AssetCatalog;
  readonly fields: readonly FormField[];
  readonly readOnly: boolean;
  value(): Readonly<Record<string, unknown>>;
  edit(label: string, path: readonly (string | number)[], value: unknown, phase?: "input" | "commit"): void;
  preview(): AssetPreviewController | null;
  pickAsset(type: string | null): Promise<string | null>;
  status(message: string): void;
}
export interface AssetEditorExtension {
  readonly element: HTMLElement;
  update?(): void;
  dispose?(): void;
}
export interface AssetEditorPresentation {
  readonly assetType: string;
  /** A key registered by an editorRender module, never a renderer in the DOM SDK. */
  readonly preview?: string;
  /** Field paths handled by tools instead of the generated form (large vertex arrays). */
  readonly handledFields?: readonly string[];
  readonly tools?: (context: AssetEditorExtensionContext) => AssetEditorExtension;
}
