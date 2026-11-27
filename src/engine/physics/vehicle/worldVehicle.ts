import { createServiceKey, type ActorId } from "../../../core/index.ts";
import type { VehicleDefinition, VehicleInput, VehicleState } from "./vehicleTypes.ts";

export interface VehicleService {
  input(actor: ActorId, input: VehicleInput): boolean;
  state(actor: ActorId): VehicleState | null;
  definition(actor: ActorId): VehicleDefinition | null;
}

export const VehicleServiceKey = createServiceKey<VehicleService>("forge.vehicle");
