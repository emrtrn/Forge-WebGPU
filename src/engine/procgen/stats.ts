import type { ProcMesh, MeshBounds } from "./mesh.ts";
import { meshBounds } from "./mesh.ts";
import { cross, pointAt, sub } from "./vector.ts";

export interface MeshStats {
  vertices: number;
  triangles: number;
  bounds: MeshBounds;
  surfaceArea: number;
  isClosed: boolean;
}

export function meshStats(mesh: ProcMesh): MeshStats {
  const edges = new Map<string, number>();
  let surfaceArea = 0;
  for (let i = 0; i + 2 < mesh.indices.length; i += 3) {
    const a = mesh.indices[i]!, b = mesh.indices[i + 1]!, c = mesh.indices[i + 2]!;
    const pa = pointAt(mesh.positions, a);
    surfaceArea += Math.hypot(...cross(sub(pointAt(mesh.positions, b), pa), sub(pointAt(mesh.positions, c), pa))) / 2;
    for (const [u, v] of [[a, b], [b, c], [c, a]]) {
      const key = `${Math.min(u!, v!)},${Math.max(u!, v!)}`;
      edges.set(key, (edges.get(key) ?? 0) + 1);
    }
  }
  return {
    vertices: mesh.positions.length / 3, triangles: mesh.indices.length / 3,
    bounds: meshBounds(mesh), surfaceArea,
    isClosed: mesh.indices.length > 0 && mesh.indices.length % 3 === 0 && [...edges.values()].every(count => count === 2),
  };
}
