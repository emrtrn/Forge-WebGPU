// Renderer-free editor preview contract; implemented by render/editor and
// consumed by DOM tools. No world, three or browser types cross this boundary.
export interface AssetPreviewInfo {
  readonly slots: readonly string[];
  readonly meshes: readonly { readonly meshName: string; readonly primitiveIndex: number; readonly vertexCount: number }[];
}
export interface AssetPreviewController {
  update(document: Readonly<Record<string, unknown>>): Promise<void>;
  info(): AssetPreviewInfo;
  focus(): void;
  setTool(tool: "select" | "move" | "rotate" | "scale"): void;
  dispose(): void;
}
