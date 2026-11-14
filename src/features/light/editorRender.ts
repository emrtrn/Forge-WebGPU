// Lights: editor helpers (plan phase 4 step 3, INV-G27). Forge WebGL's light
// gizmo (engine/render-three/lights.ts @ forge-webgl-final, buildLightGizmo):
//
// - an Unreal-style billboard icon, a sun for a directional light and a bulb
//   for point and spot lights, drawn over the scene and clicked to select the
//   light's actor;
// - a wireframe of its reach in the light's colour, shown only while the
//   actor is selected: a point light's sphere of `distance` (1 m when
//   unbounded), a spot light's cone (`angle`, `distance`, 10 m when
//   unbounded), a directional light's 1.2 m aim line down -Z.
//
// Placed at the component's world position and rotation (an actor's scale
// does not stretch the helper). The wire is hidden behind the scene's surface;
// it never takes a click (Forge: the whole cone would select).

import { BufferGeometry, Float32BufferAttribute, Group, LineBasicNodeMaterial, LineSegments, MathUtils, Matrix4, Quaternion, Vector3, type Sprite } from "three/webgpu";
import { parseComponentTypeTag, type ComponentRecord, type WorldActor } from "../../core/index.ts";
import { defineEditorRenderBinding, type EditorHelperContext } from "../../render/editor/editorBinding.ts";
import { tagActorObject } from "../../render/sync/pickTags.ts";
import { componentWorldMatrix } from "../../render/sync/transforms.ts";
import { DirectionalLight, PointLight, SpotLight, type PointLightData, type SpotLightData } from "./schema.ts";

type Kind = "directional" | "point" | "spot";

const KINDS: Readonly<Record<string, Kind>> = {
  [DirectionalLight.name]: "directional",
  [PointLight.name]: "point",
  [SpotLight.name]: "spot",
};

const WIRE_OPACITY = 0.85;
const ICON_SCALE = 0.55;

/** Forge's light glyphs: a sun with eight rays, or a bulb with its base. */
function drawLightGlyph(directional: boolean) {
  return (ctx: CanvasRenderingContext2D): void => {
    ctx.clearRect(0, 0, 64, 64);
    ctx.lineWidth = 4;
    ctx.lineJoin = "round";
    ctx.strokeStyle = "rgba(25,20,8,0.92)";
    ctx.fillStyle = "#ffd76a";
    if (directional) {
      const r = 11;
      for (let i = 0; i < 8; i += 1) {
        const a = (i / 8) * Math.PI * 2;
        ctx.beginPath();
        ctx.moveTo(32 + Math.cos(a) * (r + 4), 32 + Math.sin(a) * (r + 4));
        ctx.lineTo(32 + Math.cos(a) * (r + 13), 32 + Math.sin(a) * (r + 13));
        ctx.stroke();
      }
      ctx.beginPath();
      ctx.arc(32, 32, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      return;
    }
    const cy = 25;
    const r = 14;
    ctx.beginPath();
    ctx.arc(32, cy, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = "#9a8a5a";
    ctx.beginPath();
    ctx.rect(25, cy + r - 3, 14, 13);
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(25, cy + r + 2);
    ctx.lineTo(39, cy + r + 2);
    ctx.moveTo(25, cy + r + 6);
    ctx.lineTo(39, cy + r + 6);
    ctx.stroke();
  };
}

/** Forge's reach wireframes, as line-segment points in the light's frame. */
export function lightWirePoints(kind: Kind, data: Partial<PointLightData & SpotLightData>): number[] {
  const points: number[] = [];
  if (kind === "spot") {
    const height = data.distance && data.distance > 0 ? data.distance : 10;
    const radius = Math.tan(MathUtils.degToRad(data.angle ?? 30)) * height;
    const segments = 24;
    const rim = Array.from({ length: segments }, (_, i) => {
      const a = (i / segments) * Math.PI * 2;
      return [Math.cos(a) * radius, Math.sin(a) * radius, -height] as const;
    });
    for (let i = 0; i < segments; i += 1) points.push(...rim[i]!, ...rim[(i + 1) % segments]!);
    for (let i = 0; i < 4; i += 1) points.push(0, 0, 0, ...rim[Math.floor((i / 4) * segments)]!);
    return points;
  }
  if (kind === "point") {
    const radius = data.distance && data.distance > 0 ? data.distance : 1;
    const segments = 32;
    const on = (axis: number, t: number): [number, number, number] => {
      const c = Math.cos(t) * radius;
      const s = Math.sin(t) * radius;
      return axis === 0 ? [0, c, s] : axis === 1 ? [c, 0, s] : [c, s, 0];
    };
    for (const axis of [0, 1, 2]) {
      for (let i = 0; i < segments; i += 1) points.push(...on(axis, (i / segments) * Math.PI * 2), ...on(axis, ((i + 1) / segments) * Math.PI * 2));
    }
    return points;
  }
  return [0, 0, 0, 0, 0, -1.2];
}

interface Placed {
  readonly actor: WorldActor["id"];
  readonly holder: Group;
  readonly wire: LineSegments;
  readonly icon: Sprite;
}

export default defineEditorRenderBinding({
  feature: "forge.light",
  create(ctx: EditorHelperContext) {
    const placed = new Map<string, Placed>();
    const matrix = new Matrix4();
    const scale = new Vector3();

    const lightsOf = (actor: WorldActor): [string, ComponentRecord, Kind][] =>
      Object.entries(actor.components).flatMap(([key, component]) => {
        const kind = KINDS[parseComponentTypeTag(component.type)?.name ?? ""];
        return kind ? [[key, component, kind] as [string, ComponentRecord, Kind]] : [];
      });

    const add = (actor: WorldActor, key: string, component: ComponentRecord, kind: Kind): void => {
      const data = component as unknown as Partial<PointLightData & SpotLightData>;
      const holder = new Group();
      holder.name = `${actor.name}/${key} helper`;
      componentWorldMatrix(ctx.world, actor, key, matrix).decompose(holder.position, holder.quaternion as Quaternion, scale);
      const icon = ctx.icons.create(`light-${kind === "directional" ? "sun" : "bulb"}`, drawLightGlyph(kind === "directional"), ICON_SCALE);
      tagActorObject(icon, actor.id);
      const material = new LineBasicNodeMaterial({ color: typeof data.color === "string" ? data.color : "#ffffff", transparent: true, depthWrite: false });
      material.opacityNode = ctx.sceneVisibility.mul(WIRE_OPACITY);
      const geometry = new BufferGeometry();
      geometry.setAttribute("position", new Float32BufferAttribute(lightWirePoints(kind, data), 3));
      const wire = new LineSegments(geometry, material);
      wire.name = "light-wire";
      wire.raycast = () => {};
      wire.visible = false;
      holder.add(icon, wire);
      ctx.root.add(holder);
      placed.set(`${actor.id}/${key}`, { actor: actor.id, holder, wire, icon });
    };

    const remove = (id: string): void => {
      const entry = placed.get(id);
      if (!entry) return;
      placed.delete(id);
      entry.holder.removeFromParent();
      entry.wire.geometry.dispose();
      (entry.wire.material as LineBasicNodeMaterial).dispose();
    };

    return {
      actorsAdded(actors) {
        for (const actor of actors) for (const [key, component, kind] of lightsOf(actor)) add(actor, key, component, kind);
      },
      actorsRemoved(actors) {
        for (const actor of actors) for (const [key] of lightsOf(actor)) remove(`${actor.id}/${key}`);
      },
      sync() {
        const selected = ctx.selected();
        for (const entry of placed.values()) entry.wire.visible = selected.has(entry.actor);
      },
      dispose() {
        for (const id of [...placed.keys()]) remove(id);
      },
    };
  },
});
