import { defineComponent, text } from "../../core/index.ts";

export const Behavior = defineComponent("forge.behavior", 1, {
  script: text({ hint: "Oyunun kodda kayıtlı davranış kimliği. Parametreler aktörün şemalı bileşenlerindedir." }),
}, { label: "Behavior", hint: "Aktöre koddan kayıtlı bir davranış bağlar." });
