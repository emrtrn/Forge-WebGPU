/** Development authoring protocol; no renderer, Node or SDK dependency. */
export type HlodBuildState = "missing" | "checking" | "stale" | "building" | "current" | "failed";

export interface HlodBuildReport {
  readonly cells: number;
  readonly triangles: number;
  readonly skippedPlacements: number;
  readonly warnings: readonly string[];
  readonly buildMs: number;
  readonly totalMs: number;
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
