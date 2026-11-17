/** Development authoring protocol; no renderer, Node or SDK dependency. */
export type HlodBuildState = "missing" | "checking" | "stale" | "building" | "current" | "failed";

export interface HlodBuildReport {
  readonly cells: number;
  readonly triangles: number;
  readonly skippedPlacements: number;
  readonly warnings: readonly string[];
  readonly buildMs: number;
  readonly totalMs: number;
  /** Layer 1 clusters and their triangles (plan 5c R8.5); absent in reports cached before. */
  readonly clusters?: number;
  readonly clusterTriangles?: number;
  /** The landmark proxy's triangles; 0 without landmarks. */
  readonly landmarkTriangles?: number;
}

export interface HlodBuildStatus {
  readonly level: string;
  readonly state: HlodBuildState;
  readonly queued: boolean;
  /** Changes only after a complete successful publication, persisted by the builder. */
  readonly publication: string | null;
  readonly completedAt?: string;
  readonly report?: HlodBuildReport;
  readonly message?: string;
}

export interface HlodBuildRequest {
  readonly level: string;
  /** False checks freshness without writing HLOD outputs. */
  readonly build: boolean;
  readonly force?: boolean;
}
