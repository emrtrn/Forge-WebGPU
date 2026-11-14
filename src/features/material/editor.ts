// The material feature in the editor: Forge's material presets as the
// Content Browser's New Material templates (plan phase 4 step 6d; Forge
// WebGL's pickMaterialPreset, MATERIAL_PRESET_LABELS / DESCRIPTIONS). The
// preset is a starting point, never stored (phase 3 decision).
import { defineFeatureEditor } from "../../editor-sdk/index.ts";
import { MATERIAL_PRESET_VALUES, MaterialAssetType } from "./schema.ts";

const PRESETS = [
  ["standard", "Standard Surface", "General lit PBR material with neutral roughness."],
  ["textured", "Textured Surface", "Standard material prepared for texture slots."],
  ["metal", "Metal", "Reflective metal starter values."],
  ["glass", "Glass", "Simple transparent glass-like starter values."],
  ["emissive", "Emissive", "Self-lit surface for signs, screens, and glow accents."],
  ["basic", "Unlit Basic", "Unlit material for simple debug or UI-like surfaces."],
] as const;

export default defineFeatureEditor({
  feature: "forge.material",
  newAssets: PRESETS.map(([preset, label, description]) => ({ type: MaterialAssetType.name, label, description, values: MATERIAL_PRESET_VALUES[preset] })),
});
