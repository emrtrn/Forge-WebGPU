import { array, color, defineJsonAssetType, enumOf, num, object, text, vec2, type FieldValues } from "../../core/index.ts";

const WidgetFields = {
  name: text({ default: "Widget" }),
  preview: vec2({ default: [1280, 720], min: 1, max: 8192, hint: "HUD önizlemesinin çözünürlüğü." }),
  nodes: array(object({
    id: text({ hint: "Widget içindeki benzersiz düğüm adı." }),
    parent: text({ hint: "Üst Panel veya Stack kimliği. Boşsa doğrudan HUD'a yerleşir." }),
    kind: enumOf(["Panel", "Stack", "Text", "Button", "ProgressBar"], { default: "Text" }),
    text: text(),
    bind: text({ hint: "Metin veya ilerleme değeri için ViewModel yolu." }),
    localeKey: text({ hint: "Metin için yerelleştirme anahtarı." }),
    message: text({ hint: "Düğme tıklandığında yayınlanan mesaj." }),
    anchor: enumOf(["topLeft", "topRight", "bottomLeft", "bottomRight", "center"], { default: "topLeft" }),
    offset: vec2({ default: [0, 0], hint: "HUD çapasından piksel ofseti." }),
    size: vec2({ default: [0, 0], min: 0, hint: "Piksel boyutu. Sıfır, içeriğe göre ölçülür." }),
    background: color({ default: null }),
    foreground: color({ default: null }),
    backgroundToken: text({ hint: "Arka plan için tema anahtarı, örneğin color.surface." }),
    foregroundToken: text({ hint: "Metin rengi için tema anahtarı, örneğin color.text." }),
    fontSize: num({ default: 16, min: 8, max: 160 }),
    gap: num({ default: 8, min: 0, max: 160 }),
    direction: enumOf(["column", "row"], { default: "column" }),
    padding: num({ default: 0, min: 0, max: 160 }),
    max: num({ default: 100, min: 1 }),
  })),
} as const;

export const UiWidget = defineJsonAssetType("forge.uiWidget", 1, { suffix: ".ui.json", fields: WidgetFields }, {
  label: "UI Widget", hint: "HUD ve menüler için düğümler, bağlamalar ve çapa yerleşimi.",
});

export type WidgetData = FieldValues<typeof WidgetFields>;
