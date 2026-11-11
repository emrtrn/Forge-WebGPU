// Control: a test may drive subsystems through the test scaffold. Must not be reported.
import { tick } from "./testing/loop";

export const ran = (): number => tick();
