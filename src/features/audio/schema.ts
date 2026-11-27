import { defineAssetType } from "../../core/index.ts";

export const Audio = defineAssetType("forge.audio", 1, {
  extensions: ["wav", "ogg"],
  importFields: {},
}, { label: "Audio Clip", hint: "Ses kitaplığının kullandığı WAV veya Ogg dosyası." });
