// Ported from Forge WebGL engine/scene/assetVertexColors.ts @ forge-webgl-final (04b5fb23); docs/PORT_LOG.md §2.
// The Forge WebGL importer's reader of `*.vertexcolors.json`; the new home of the data is `forge.model`'s
// `vertexColors` import setting (features/model).
/**
 * Asset-scoped default vertex colours for Mesh Paint's `To Mesh` transfer.
 *
 * This sidecar never mutates the source GLB. It is deliberately independent
 * from layout mesh-paint data so a future `To Instances` action can explicitly
 * choose when these defaults are applied to placements.
 */

const MAX_ASSET_VERTEX_COLOR_VERTICES = 2_000_000;

export interface AssetVertexColorMesh {
  meshName: string;
  primitiveIndex: number;
  vertexCount: number;
  /** RGBA floats, one item per vertex, in the range 0..1. */
  colors: number[];
  /** Original local-space vertex positions, retained for reimport repair. */
  positions?: number[];
}

export interface AssetVertexColorsDef {
  schema: 1;
  type: "vertexColors";
  target: "asset";
  meshes: AssetVertexColorMesh[];
}

export function assetVertexColorsSidecarPath(modelPath: string): string {
  const normalized = modelPath.replace(/\\/g, "/").replace(/^\/+/, "");
  return `${normalized.replace(/\.[^./]+$/, "")}.vertexcolors.json`;
}

export function createEmptyAssetVertexColors(): AssetVertexColorsDef {
  return { schema: 1, type: "vertexColors", target: "asset", meshes: [] };
}

/** Replaces one primitive's default colour data without disturbing the others. */
export function upsertAssetVertexColorMesh(
  data: AssetVertexColorsDef,
  mesh: AssetVertexColorMesh,
): AssetVertexColorsDef {
  const normalized = normalizeAssetVertexColorMesh(mesh);
  if (!normalized) return data;
  const meshes = data.meshes.filter(
    (entry) => entry.meshName !== normalized.meshName || entry.primitiveIndex !== normalized.primitiveIndex,
  );
  meshes.push(normalized);
  return { schema: 1, type: "vertexColors", target: "asset", meshes };
}

/** Normalizes untrusted sidecar data and rejects partial per-vertex arrays. */
export function normalizeAssetVertexColors(raw: unknown): AssetVertexColorsDef {
  const source = raw && typeof raw === "object" && !Array.isArray(raw)
    ? raw as Partial<AssetVertexColorsDef>
    : {};
  if (source.schema !== 1 || source.type !== "vertexColors" || source.target !== "asset") {
    return createEmptyAssetVertexColors();
  }
  const meshes = Array.isArray(source.meshes) ? source.meshes : [];
  let normalized = createEmptyAssetVertexColors();
  for (const mesh of meshes) {
    const entry = normalizeAssetVertexColorMesh(mesh);
    if (entry) normalized = upsertAssetVertexColorMesh(normalized, entry);
  }
  return normalized;
}

function normalizeAssetVertexColorMesh(raw: unknown): AssetVertexColorMesh | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const input = raw as Partial<AssetVertexColorMesh>;
  const meshName = typeof input.meshName === "string" && input.meshName.trim().length > 0
    ? input.meshName.trim()
    : null;
  const primitiveIndex = validIndex(input.primitiveIndex);
  const vertexCount = validVertexCount(input.vertexCount);
  if (!meshName || primitiveIndex === null || vertexCount === null) return null;
  if (!Array.isArray(input.colors) || input.colors.length !== vertexCount * 4) return null;
  const colors: number[] = [];
  for (const value of input.colors) {
    if (!Number.isFinite(value)) return null;
    colors.push(clampUnit(value));
  }
  const positions = normalizePositions(input.positions, vertexCount);
  return { meshName, primitiveIndex, vertexCount, colors, ...(positions ? { positions } : {}) };
}

function normalizePositions(value: unknown, vertexCount: number): number[] | null {
  if (!Array.isArray(value) || value.length !== vertexCount * 3) return null;
  const positions: number[] = [];
  for (const entry of value) {
    if (!Number.isFinite(entry)) return null;
    positions.push(entry);
  }
  return positions;
}

function validIndex(value: unknown): number | null {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= 1_000_000
    ? value
    : null;
}

function validVertexCount(value: unknown): number | null {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= MAX_ASSET_VERTEX_COLOR_VERTICES
    ? value
    : null;
}

function clampUnit(value: number): number {
  return Math.min(1, Math.max(0, value));
}
