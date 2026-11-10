// Every import here breaks the contract except the first.
import { defineGameModule } from "@forge/sdk";
import { SDK_VERSION } from "@forge/editor-sdk";
import { readFileSync } from "node:fs";
import * as THREE from "three";
import { createWorld } from "../../../../src/runtime/world.ts";
export { Vector3 } from "three";

export type Engine = import("three").WebGPURenderer;
export const lazy = () => import("left-pad");

export default defineGameModule({ id: "badimports.main" });
void [SDK_VERSION, readFileSync, THREE, createWorld];
