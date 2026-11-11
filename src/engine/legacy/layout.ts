// Ported from Forge WebGL engine/scene/layout.ts (Vec3, LayoutPhysicsAxisLocks) @ forge-webgl-final (04b5fb23); docs/PORT_LOG.md §2.
// TRANSITION (plan 2b, user decision 2026-11-11): Forge WebGL's old entity and
// component model, only the part ported subsystems read. Faz 6 replaces it with
// schema components (each subsystem binds to the world with its feature) and
// deletes src/engine/legacy. Kept inside src/engine (engine-legacy-stays-in-engine).

export type Vec3 = [number, number, number];

export type LayoutPhysicsAxisLocks = [boolean, boolean, boolean];
