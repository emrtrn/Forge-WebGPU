// Merge cached primitive LOD chains in baked vertex order without re-simplifying.
import { TRIANGLE_VERSION, type TriangleData } from "./triangleData.ts";

export interface TriangleLodPiece {
  /** LOD chain of the piece's source primitive; indices address that primitive's vertices. */
  readonly data: TriangleData;
  /** First vertex of this piece in the merged vertex buffer. */
  readonly vertexOffset: number;
  /** The piece's vertex count (every index must be < this). */
  readonly vertexCount: number;
  /** Mirrored bake: swap the 2nd and 3rd index of every triangle. */
  readonly flip: boolean;
  /** Largest axis scale of the baked matrix; the piece's errors are multiplied by it. Finite, > 0. */
  readonly scale: number;
}

/** LOD chain of the merged geometry; `key` is the caller's identity for the result. */
export function mergeTriangleLods(pieces: readonly TriangleLodPiece[], key: string): TriangleData {
  if (!pieces.length) throw new Error("triangles: no pieces to merge");
  let levelCount = 0;
  for (const piece of pieces) {
    if (piece.data.version !== TRIANGLE_VERSION) throw new Error("triangles: incompatible version");
    if (!piece.data.lods.length) throw new Error("triangles: piece has no LODs");
    if (!Number.isInteger(piece.vertexOffset) || piece.vertexOffset < 0 ||
        !Number.isInteger(piece.vertexCount) || piece.vertexCount < 0) {
      throw new Error("triangles: invalid vertex offset or count");
    }
    if (!Number.isFinite(piece.scale) || piece.scale <= 0) throw new Error("triangles: invalid scale");
    for (const lod of piece.data.lods) {
      if (lod.indices.length % 3 || lod.indices.some((index) =>
        !Number.isInteger(index) || index < 0 || index >= piece.vertexCount)) {
        throw new Error("triangles: invalid triangle indices");
      }
    }
    levelCount = Math.max(levelCount, piece.data.lods.length);
  }

  const lods: { indices: number[]; error: number }[] = [];
  for (let level = 0; level < levelCount; level += 1) {
    const indices: number[] = [];
    let error = 0;
    for (const piece of pieces) {
      const lod = piece.data.lods[Math.min(level, piece.data.lods.length - 1)]!;
      for (let i = 0; i < lod.indices.length; i += 3) {
        indices.push(
          lod.indices[i]! + piece.vertexOffset,
          lod.indices[i + (piece.flip ? 2 : 1)]! + piece.vertexOffset,
          lod.indices[i + (piece.flip ? 1 : 2)]! + piece.vertexOffset,
        );
      }
      error = Math.max(error, lod.error * piece.scale);
    }
    if (level === 0 || indices.length <= lods.at(-1)!.indices.length * 0.85) lods.push({ indices, error });
  }
  return { version: TRIANGLE_VERSION, key, lods };
}
