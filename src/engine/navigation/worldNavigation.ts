import { createServiceKey, type Vec3 } from "../../core/index.ts";
import type { NavAgent } from "./navigationTypes.ts";
import type { RecastPlanResult } from "./recastPlanner.ts";

export interface NavigationService {
  path(start: Vec3, goal: Vec3, agent: NavAgent): RecastPlanResult;
  ready(): Promise<boolean>;
}

export const NavigationServiceKey = createServiceKey<NavigationService>("forge.navigation");
