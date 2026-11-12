// Sound: binary asset type.
//
// An audio file. Schema only for now (plan 2b importer, user decision
// 2026-11-12): version 1 has no import settings, the meta file's `import` is
// `{}`. Import settings (streaming, loudness) come in Faz 3 as version 2 with
// a migration from 1; the audio library (`src/engine/audio`) plays clips by
// path until the sound feature binds them (Faz 6).

import { defineAssetType } from "../../core/index.ts";

export const SoundAssetType = defineAssetType(
  "forge.sound",
  1,
  { extensions: ["wav", "ogg", "mp3"] },
  {
    label: "Sound",
    hint: "Ses dosyası. İçe aktarma ayarları Faz 3'te gelir.",
  },
);
