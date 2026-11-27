import { createServiceKey } from "../../core/index.ts";
import type { PerceivedStimulus, PerceptionEvaluationInput } from "./perception.ts";

export const PerceptionServiceKey = createServiceKey<{
  evaluate(input: PerceptionEvaluationInput): readonly PerceivedStimulus[];
}>("forge.perception");
