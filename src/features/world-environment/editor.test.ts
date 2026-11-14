import { expect, test } from "vitest";
import { formatHour } from "./editor.ts";

test("the preview's hour reads as Forge's HH:MM", () => {
  expect(formatHour(7.5)).toBe("07:30");
  expect(formatHour(23.999)).toBe("00:00");
  expect(formatHour(-1)).toBe("23:00");
  expect(formatHour(12)).toBe("12:00");
});
