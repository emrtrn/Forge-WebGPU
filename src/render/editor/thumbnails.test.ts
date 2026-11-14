import { DataUtils } from "three/webgpu";
import { expect, test } from "vitest";
import { encodeHalfFloatPixels, encodeSrgb } from "./thumbnails.ts";

test("linear to 8-bit sRGB, clamped", () => {
  expect([encodeSrgb(0), encodeSrgb(1), encodeSrgb(2), encodeSrgb(-1), encodeSrgb(Number.NaN)]).toEqual([0, 255, 255, 0, 0]);
  expect(encodeSrgb(0.2158605)).toBe(128); // sRGB 0.5
});

test("half-float rows become opaque sRGB rows; WebGL's bottom-up rows are flipped", () => {
  const h = (value: number): number => DataUtils.toHalfFloat(value);
  const red = [h(1), h(0), h(0), h(0.5)];
  const green = [h(0), h(1), h(0), h(0.5)];
  // A 2 x 2 image read top row first: red, then green.
  const pixels = new Uint16Array([...red, ...red, ...green, ...green]);
  const firstPixel = (flip: boolean): number[] => [...encodeHalfFloatPixels(pixels, 2, flip).slice(0, 4)];
  expect(firstPixel(false)).toEqual([255, 0, 0, 255]);
  expect(firstPixel(true)).toEqual([0, 255, 0, 255]);
});
