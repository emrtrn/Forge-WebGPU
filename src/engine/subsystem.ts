// Ported from Forge WebGL engine/core/Subsystem.ts @ forge-webgl-final (04b5fb23); docs/PORT_LOG.md §2.
// The shape Forge's engine subsystems implement (physics, behavior, movement,
// input…). They keep it through Faz 2b; Faz 6 binds each to the world through
// core's defineSubsystem (src/core/world/subsystem.ts) with its feature.
export interface EngineUpdateContext {
  deltaSeconds: number;
  elapsedSeconds: number;
  frame: number;
}

export interface Subsystem {
  readonly id: string;
  init?(): void | Promise<void>;
  start?(): void | Promise<void>;
  update?(context: EngineUpdateContext): void;
  dispose?(): void | Promise<void>;
}
