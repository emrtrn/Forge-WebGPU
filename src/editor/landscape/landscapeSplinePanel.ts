// Landscape Splines mode in Details, in Forge's layout (plan 5d step 5,
// INV-B06; Forge WebGL specialActorDetails.ts's spline part and
// landscapeSplineSelection.ts @ forge-webgl-final): the terrain's splines, New
// Spline / Delete Spline / Close Loop, Curved; Control Points (the points, the
// world location, width and falloff, Delete Point, Snap to Terrain); Segments
// (the segments, Split Segment, the deform / paint / mesh effects, Apply Deform
// and Apply Paint). Draw / Edit Points are the panel's tool grid.
//
// Points and segments are picked with a click, Ctrl adds or takes out, Shift
// takes a range; a field then writes to all of them (different values show as
// "Multiple Values"). A field writes when its change lands: every write is one
// undo step, and Details draws itself again after it.

import { assetRef, bool, enumOf, formFields, num, vec3, type ActorId, type FieldMap } from "../../core/index.ts";
import { pathKey } from "../../engine/edit/formPath.ts";
import { DEFAULT_SEGMENT_DEFORM, DEFAULT_SEGMENT_MESH_SPACING, type LandscapeSplineSegmentPatch } from "../../engine/terrain/landscapeSplineEdit.ts";
import type { ForgeLandscapeSplinePoint, ForgeLandscapeSplineSegment } from "../../engine/terrain/landscape.ts";
import type { EditableTerrain, TerrainEditing } from "../../engine/terrain/terrainEditing.ts";
import { createFormView, createSection, type FormChange } from "../ui/formView.ts";
import type { LandscapeSplines } from "./landscapeSplines.ts";

type Status = (message: string, tone?: "info" | "warning" | "error") => void;

/** The segment form's flat keys and where each belongs. */
const SEGMENT_KEYS: Readonly<Record<string, readonly ["deform" | "paint" | "mesh", string]>> = {
  deformEnabled: ["deform", "enabled"], deformFlatten: ["deform", "flatten"], deformRaise: ["deform", "raiseTerrain"], deformLower: ["deform", "lowerTerrain"],
  deformOffset: ["deform", "targetOffset"],
  paintEnabled: ["paint", "enabled"], paintLayer: ["paint", "layerId"], paintStrength: ["paint", "strength"],
  meshEnabled: ["mesh", "enabled"], meshAsset: ["mesh", "assetId"], meshDeform: ["mesh", "deform"], meshAlign: ["mesh", "alignToTerrain"],
  meshFit: ["mesh", "fitToLength"], meshSpacing: ["mesh", "spacing"], meshYaw: ["mesh", "yawOffset"], meshBank: ["mesh", "bank"], meshCollision: ["mesh", "collision"],
};

/** One segment as the form shows it. */
export function segmentFormValue(segment: ForgeLandscapeSplineSegment, paintLayer: string): Record<string, unknown> {
  const deform = { ...DEFAULT_SEGMENT_DEFORM, ...segment.deform };
  const { paint, mesh } = segment;
  return {
    deformEnabled: deform.enabled, deformFlatten: deform.flatten, deformRaise: deform.raiseTerrain, deformLower: deform.lowerTerrain, deformOffset: deform.targetOffset ?? 0,
    paintEnabled: paint?.enabled ?? false, paintLayer: paint?.layerId ?? paintLayer, paintStrength: paint?.strength ?? 1,
    meshEnabled: mesh?.enabled ?? false, meshAsset: mesh?.assetId || null, meshDeform: mesh?.deform ?? false, meshAlign: mesh?.alignToTerrain ?? false,
    meshFit: mesh?.fitToLength !== false, meshSpacing: mesh?.spacing ?? DEFAULT_SEGMENT_MESH_SPACING, meshYaw: mesh?.yawOffset ?? 0, meshBank: mesh?.bank ?? 0,
    meshCollision: mesh?.collision !== false,
  };
}

/** A segment form change as the edit it makes. */
export function segmentPatch(key: string, value: unknown): LandscapeSplineSegmentPatch | null {
  const found = SEGMENT_KEYS[key];
  if (!found) return null;
  const [group, field] = found;
  return { [group]: { [field]: key === "meshAsset" ? (value ?? "") : value } } as LandscapeSplineSegmentPatch;
}

/** The picked ids after a click: plain replaces, Ctrl toggles (the last one stays), Shift takes the range from the active one. */
export function clickIds(all: readonly string[], picked: readonly string[], active: string | null, id: string, keys: { readonly ctrl: boolean; readonly shift: boolean }): { ids: string[]; active: string } {
  if (keys.shift && active !== null && all.includes(active)) {
    const from = all.indexOf(active), to = all.indexOf(id);
    const range = all.slice(Math.min(from, to), Math.max(from, to) + 1);
    return { ids: keys.ctrl ? [...new Set([...picked, ...range])] : range, active: id };
  }
  if (!keys.ctrl) return { ids: [id], active: id };
  if (!picked.includes(id)) return { ids: [...picked, id], active: id };
  const rest = picked.filter((entry) => entry !== id);
  return rest.length > 0 ? { ids: rest, active: rest.at(-1)! } : { ids: [id], active: id };
}

/** Keys whose values differ between the picked items. */
function mixedKeys(values: readonly Record<string, unknown>[]): Set<string> {
  const mixed = new Set<string>();
  for (const key of Object.keys(values[0] ?? {})) if (values.some((value) => value[key] !== values[0]![key])) mixed.add(key);
  return mixed;
}

export function createSplineBlock(doc: Document, editing: TerrainEditing, splines: LandscapeSplines | undefined, status: Status) {
  const element = doc.createElement("div");
  element.dataset.testid = "landscape-splines";
  let shown = "";
  /** Sections the user collapsed stay so across rebuilds. */
  const collapsed = new Set<string>();

  const button = (label: string, testId: string, title: string, onClick: (event: MouseEvent) => void): HTMLButtonElement => {
    const node = doc.createElement("button");
    node.type = "button";
    node.className = "detail-action-button";
    node.textContent = label;
    node.title = title;
    node.dataset.testid = testId;
    node.addEventListener("click", onClick);
    return node;
  };
  const grid = (columns: string, children: readonly HTMLElement[]): HTMLElement => {
    const node = doc.createElement("div");
    Object.assign(node.style, { display: "grid", gridTemplateColumns: columns, gap: "6px", margin: "6px 0" });
    node.append(...children);
    return node;
  };
  const lit = (node: HTMLElement, on: boolean): void => {
    node.classList.toggle("on", on);
    node.setAttribute("aria-pressed", String(on));
  };
  const hint = (text: string): HTMLElement => {
    const node = doc.createElement("div");
    node.className = "detail-hint";
    node.textContent = text;
    return node;
  };
  const section = (title: string, testId: string): { section: HTMLElement; body: HTMLElement } => {
    const made = createSection(doc, title, { testId, collapsed: collapsed.has(testId) });
    made.toggle.addEventListener("click", () => {
      if (made.section.classList.contains("collapsed")) collapsed.add(testId);
      else collapsed.delete(testId);
    });
    return made;
  };
  const form = (options: {
    readonly fields: FieldMap; readonly value: Record<string, unknown>; readonly mixed?: ReadonlySet<string>; readonly disabled?: boolean;
    readonly commit: (change: FormChange) => void;
  }): HTMLElement => createFormView({
    document: doc, fields: formFields(options.fields), value: options.value, testIdPrefix: "landscape-spline",
    ...(options.mixed ? { mixed: options.mixed } : {}), ...(options.disabled ? { disabled: true } : {}),
    warn: (message) => status(message, "warning"),
    assetLabel: (guid) => splines?.assetLabel(guid) ?? null,
    pickAsset: (type) => splines?.pickAsset(type) ?? Promise.resolve(null),
    onChange: (change) => {
      if (change.phase === "commit") options.commit(change);
    },
  }).element;

  const draw = (actor: ActorId | null, terrain: EditableTerrain | undefined): void => {
    if (!terrain || actor === null || !splines) {
      if (shown !== "none") element.replaceChildren();
      shown = "none";
      return;
    }
    const list = splines.list(actor);
    const active = splines.active(actor);
    const spline = list.find((entry) => entry.id === active.splineId);
    const { busy } = splines;
    const { layers } = terrain.session.world.def;
    const pointIds = splines.points(actor);
    const segmentIds = splines.segments(actor);
    const roads = terrain.roads();
    const key = JSON.stringify([
      actor, busy, active, pointIds, segmentIds, spline ?? null, list.map((entry) => [entry.id, entry.name, entry.points.length]), layers.map((layer) => [layer.id, layer.name]), roads,
      [...collapsed],
    ]);
    if (key === shown) return;
    shown = key;

    const rows = list.map((entry) => {
      const row = button("", `landscape-spline-${entry.id}`, "Bu spline'ı düzenle.", () => splines.select({ splineId: entry.id, pointId: null, segmentId: null }));
      Object.assign(row.style, { display: "flex", justifyContent: "space-between" });
      const name = doc.createElement("span"), count = doc.createElement("span");
      name.textContent = entry.name ?? entry.id;
      count.textContent = `${entry.points.length} pts`;
      row.append(name, count);
      lit(row, entry.id === active.splineId);
      return row;
    });
    const create = button("New Spline", "landscape-spline-new", "Yeni spline; Draw ile noktaları ekle.", () => void splines.create(actor));
    const remove = button("Delete Spline", "landscape-spline-delete", "Seçili spline'ı sil (arazi değişmez).", () => void splines.remove(actor));
    const close = button("Close Loop", "landscape-spline-close", "Son noktayı ilkine bağlar.", () => void splines.close(actor));
    create.disabled = busy;
    remove.disabled = close.disabled = busy || !spline;
    const parts: HTMLElement[] = [
      rows.length > 0 ? grid("1fr", rows) : hint("Henüz spline yok. Draw ile arazide tıklamak yeni bir spline başlatır."),
      grid("repeat(3, minmax(0, 1fr))", [create, remove, close]),
    ];
    if (spline) {
      parts.push(form({
        fields: {
          smooth: bool({ default: false, label: "Curved (smooth)", hint: "Segmentler noktalardan yumuşak bir eğri olarak geçer." }),
          ...(spline.smooth ? { smoothness: num({ default: 0.5, min: 0, max: 1, step: 0.05, label: "Smoothness", hint: "Köşe dönüşünün yumuşaklığı; 0 düz parçalar." }) } : {}),
        },
        value: { smooth: spline.smooth === true, smoothness: spline.smoothness ?? 0.5 },
        disabled: busy,
        commit: (change) => void splines.set(actor, { [String(change.path[0])]: change.value }),
      }));
      const pointSection = drawPoints(actor, spline.points, pointIds, active.pointId, busy);
      if (pointSection) parts.push(pointSection);
      const segmentSection = drawSegments(actor, spline.points, spline.segments, segmentIds, active.segmentId, terrain, busy);
      if (segmentSection) parts.push(segmentSection);
    }
    const meshes = doc.createElement("div");
    meshes.className = "detail-row";
    const label = doc.createElement("span"), value = doc.createElement("span");
    label.textContent = "Spline Meshes";
    value.textContent = roads.building ? "Building…" : `${roads.chunks} chunks, ${roads.pieces} pieces, ${Math.round(roads.triangles)} tris`;
    value.dataset.testid = "landscape-spline-meshes";
    meshes.append(label, value);
    parts.push(meshes, ...roads.problems.map((problem) => hint(problem)));
    element.replaceChildren(...parts);
  };

  const drawPoints = (actor: ActorId, points: readonly ForgeLandscapeSplinePoint[], picked: readonly string[], active: string | null, busy: boolean): HTMLElement | null => {
    if (points.length === 0) return null;
    const { section: node, body } = section("Control Points", "landscape-spline-points");
    const ids = points.map((point) => point.id);
    const buttons = points.map((point, index) => {
      const one = button(String(index + 1), `landscape-spline-point-${point.id}`, "Ctrl: seçime ekle veya çıkar. Shift: aralık seç.", (event) => {
        const next = clickIds(ids, picked, active, point.id, { ctrl: event.ctrlKey || event.metaKey, shift: event.shiftKey });
        editing.update({ activeSplinePointId: next.active, splinePointIds: next.ids });
      });
      lit(one, picked.includes(point.id));
      return one;
    });
    body.append(grid("repeat(8, minmax(0, 1fr))", buttons));
    const chosen = points.filter((point) => picked.includes(point.id));
    const shownPoint = chosen.find((point) => point.id === active) ?? chosen[0];
    if (!shownPoint) return node;
    const values = chosen.map((point) => ({ width: point.width, falloff: point.falloff, "position[0]": point.position[0], "position[1]": point.position[1], "position[2]": point.position[2] }));
    body.append(form({
      fields: {
        position: vec3({ default: [0, 0, 0], step: 0.1, label: "World Location", hint: "Kontrol noktasının dünya konumu." }),
        width: num({ default: 6, min: 0.1, max: 10000, step: 0.1, slider: [0.5, 50], label: "Width (m)", hint: "Yolun tam genişliği; Deform ve Paint bu koridoru işler." }),
        falloff: num({ default: 3, min: 0, max: 10000, step: 0.1, slider: [0, 50], label: "Falloff (m)", hint: "Koridorun kenarında araziye karışan genişlik." }),
      },
      value: { position: [...shownPoint.position], width: shownPoint.width, falloff: shownPoint.falloff },
      mixed: mixedKeys(values),
      disabled: busy,
      commit: (change) => {
        const [field, axis] = [String(change.path[0]), change.path[1]];
        if (field !== "position") void splines?.setPoints(actor, { [field]: Number(change.value) });
        else if (typeof axis === "number") void splines?.setPoints(actor, { [["x", "y", "z"][axis]!]: Number(change.value) });
      },
    }));
    const remove = button("Delete Point", "landscape-spline-point-delete", "Noktayı ve ona bağlı segmentleri siler.", () => void splines?.deletePoint(actor));
    const snap = button("Snap to Terrain", "landscape-spline-point-snap", "Noktayı arazinin yüzeyine indirir.", () => void splines?.snapPoint(actor));
    remove.disabled = snap.disabled = busy || chosen.length !== 1;
    body.append(grid("1fr 1fr", [remove, snap]));
    return node;
  };

  const drawSegments = (
    actor: ActorId, points: readonly ForgeLandscapeSplinePoint[], segments: readonly ForgeLandscapeSplineSegment[], picked: readonly string[], active: string | null,
    terrain: EditableTerrain, busy: boolean,
  ): HTMLElement | null => {
    if (segments.length === 0) return null;
    const { section: node, body } = section("Segments", "landscape-spline-segments");
    const ids = segments.map((segment) => segment.id);
    const number = (id: string): string => String(points.findIndex((point) => point.id === id) + 1);
    const buttons = segments.map((segment) => {
      const one = button(`${number(segment.startPointId)} > ${number(segment.endPointId)}`, `landscape-spline-segment-${segment.id}`, "Ctrl: seçime ekle veya çıkar. Shift: aralık seç.", (event) => {
        const next = clickIds(ids, picked, active, segment.id, { ctrl: event.ctrlKey || event.metaKey, shift: event.shiftKey });
        editing.update({ activeSplineSegmentId: next.active, splineSegmentIds: next.ids });
      });
      lit(one, picked.includes(segment.id));
      return one;
    });
    const all = button("Select All", "landscape-spline-segments-all", "Bütün segmentleri seçer; alanlar hepsine yazılır.", () => editing.update({ activeSplineSegmentId: active ?? ids[0]!, splineSegmentIds: ids }));
    const split = button("Split Segment", "landscape-spline-segment-split", "Segmentin ortasına nokta ekler.", () => void splines?.split(actor));
    split.disabled = busy || picked.length !== 1;
    body.append(grid("repeat(4, minmax(0, 1fr))", buttons), grid("1fr 1fr", [all, split]));
    const chosen = segments.filter((segment) => picked.includes(segment.id));
    const shownSegment = chosen.find((segment) => segment.id === active) ?? chosen[0];
    if (shownSegment) {
      const { layers } = terrain.session.world.def;
      const paintLayer = layers[1]?.id ?? layers[0]?.id ?? "";
      const values = chosen.map((segment) => segmentFormValue(segment, paintLayer));
      const value = segmentFormValue(shownSegment, paintLayer);
      const layerIds = [...new Set([...layers.map((layer) => layer.id), String(value.paintLayer)])];
      const hasMesh = value.meshAsset !== null;
      body.append(form({
        fields: {
          deformEnabled: bool({ default: false, label: "Deform Terrain", hint: "Apply Deform bu segmentin koridorunu araziye işler." }),
          deformFlatten: bool({ default: true, label: "Flatten", hint: "Araziyi iki yönde de yolun yüksekliğine getirir." }),
          deformRaise: bool({ default: true, label: "Raise", hint: "Yolun altında kalan araziyi yükseltir." }),
          deformLower: bool({ default: true, label: "Lower", hint: "Yolun üstünde kalan araziyi alçaltır." }),
          deformOffset: num({ default: 0, min: -10000, max: 10000, step: 0.1, slider: [-10, 10], label: "Target Offset (m)", hint: "Hedef yüksekliğe eklenir." }),
          paintEnabled: bool({ default: false, label: "Paint Layer", hint: "Apply Paint koridoru bu katmanla boyar." }),
          paintLayer: enumOf(layerIds, { default: layerIds[0] ?? "", labels: Object.fromEntries(layers.map((layer) => [layer.id, layer.name])), label: "Layer", hint: "Boyanan katman." }),
          paintStrength: num({ default: 1, min: 0, max: 1, step: 0.05, label: "Paint Strength", hint: "Boyanın ağırlığı." }),
          meshAsset: assetRef({ assetType: "forge.model", label: "Mesh", hint: "Yol modeli; uzunluğu yerel +Z boyunca olmalı. Boşsa mesh yok." }),
          ...(hasMesh ? {
            meshEnabled: bool({ default: false, label: "Spline Mesh", hint: "Modeli segment boyunca çizer." }),
            meshDeform: bool({ default: false, label: "Deform Along Curve", hint: "Modeli eğri boyunca büker; kapalıyken parçalar düz dizilir." }),
            meshAlign: bool({ default: false, label: "Align To Terrain", hint: "Modelin yukarı yönü arazinin normali." }),
            meshFit: bool({ default: true, label: "Fit To Segment", hint: "Düz dizilen parça segmentin boyuna uzatılır; kapalıyken Spacing kullanılır." }),
            meshSpacing: num({ default: DEFAULT_SEGMENT_MESH_SPACING, min: 0.01, max: 10000, step: 0.1, slider: [0.5, 50], label: "Spacing (m)", hint: "Fit kapalıyken parçalar arası uzaklık." }),
            meshYaw: num({ default: 0, min: -360, max: 360, step: 1, label: "Yaw (deg)", hint: "Uzunluğu +Z olmayan model için ek dönüş." }),
            meshBank: num({ default: 0, min: -360, max: 360, step: 1, label: "Bank (deg)", hint: "Yol ekseni çevresinde yana yatma." }),
            meshCollision: bool({ default: true, label: "Mesh Collision", hint: "Oyunda çarpışır (collider Faz 6'da)." }),
          } : {}),
        },
        value,
        mixed: mixedKeys(values),
        disabled: busy,
        commit: (change) => {
          const patch = segmentPatch(pathKey(change.path), change.value);
          if (patch) void splines?.setSegments(actor, patch);
        },
      }));
    }
    const deform = button("Apply Deform", "landscape-spline-apply-deform", "Spline'ın açık Deform etkilerini yüksekliklere işler (tek Undo).", () => void splines?.apply(actor, "deform"));
    const paint = button("Apply Paint", "landscape-spline-apply-paint", "Spline'ın açık Paint etkilerini boya katmanlarına işler (tek Undo).", () => void splines?.apply(actor, "paint"));
    deform.disabled = paint.disabled = busy;
    body.append(
      grid("1fr 1fr", [deform, paint]),
      hint("Apply, spline'ın bütün segmentlerinin açık etkilerini araziye işler; nokta taşımak araziyi kendiliğinden yeniden işlemez. Mesh kendiliğinden yenilenir."),
    );
    return node;
  };

  return { element, draw };
}
