import { expect, test } from "vitest";
import * as sdk from "../sdk/index.ts";
import * as editorSdk from "./index.ts";

test("the editor SDK follows the SDK version and is a skeleton for now", () => {
  expect(editorSdk.SDK_VERSION).toBe(sdk.SDK_VERSION);
  expect(Object.keys(editorSdk)).toEqual(["SDK_VERSION"]);
});
