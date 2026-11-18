// Zones and portals in the editor (plan 5c R9b Z5): drawn only in the editor,
// over the scene like the light helpers.
//
// - A zone: its box as a faint fill and edges in blue, the size times the
//   world scale (the gizmo scales it); a portal: its opening as a fill and
//   edges in orange. Both fade behind the scene's surface.
// - An icon at the centre takes the click (the box and the opening never do:
//   a room-sized box would swallow every click inside it).
// - The selected zone and its portals are highlighted; a selected portal
//   highlights the zones it joins. The links come from the same rule the
//   renderer uses (`engine/world/zones.ts`: pinned zones or the probes).

import { BoxGeometry, DoubleSide, EdgesGeometry, Group, LineBasicNodeMaterial, LineSegments, Matrix4, Mesh, MeshBasicNodeMaterial, PlaneGeometry, Quaternion, Vector3, type BufferGeometry, type Sprite, type UniformNode } from "three/webgpu";
import { uniform } from "three/tsl";
import { parseComponentTypeTag, type ActorId, type ComponentRecord, type WorldActor } from "../../core/index.ts";
import { buildZoneSet, OUTSIDE, type PortalInput, type ZoneInput } from "../../engine/world/zones.ts";
import { defineEditorRenderBinding, type EditorHelperContext } from "../../render/editor/editorBinding.ts";
import { tagActorObject } from "../../render/sync/pickTags.ts";
import { componentWorldMatrix } from "../../render/sync/transforms.ts";
import { Portal, Zone, type PortalData, type ZoneData } from "./schema.ts";

const ZONE_COLOR = "#45a8ff";
const PORTAL_COLOR = "#ffa13d";
const OUTSIDE_COLOR = "#32c7a4";
const FILL = { idle: 0.04, lit: 0.12 };
const EDGE = { idle: 0.45, lit: 1 };
const ICON_SCALE = 0.6;

type Kind = "zone" | "portal";

function drawGlyph(kind: Kind) {
  return (ctx: CanvasRenderingContext2D): void => {
    ctx.clearRect(0, 0, 64, 64);
    ctx.lineWidth = 4;
    ctx.lineJoin = "round";
    ctx.strokeStyle = "rgba(10,14,20,0.9)";
    ctx.fillStyle = kind === "zone" ? ZONE_COLOR : PORTAL_COLOR;
    if (kind === "zone") {
      // A box seen corner on.
      ctx.beginPath();
      ctx.moveTo(32, 10); ctx.lineTo(52, 21); ctx.lineTo(52, 43); ctx.lineTo(32, 54); ctx.lineTo(12, 43); ctx.lineTo(12, 21); ctx.closePath();
      ctx.fill(); ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(12, 21); ctx.lineTo(32, 32); ctx.lineTo(52, 21); ctx.moveTo(32, 32); ctx.lineTo(32, 54);
      ctx.stroke();
      return;
    }
    // A doorway.
    ctx.beginPath();
    ctx.rect(18, 10, 28, 44);
    ctx.fill(); ctx.stroke();
    ctx.fillStyle = "rgba(10,14,20,0.85)";
    ctx.fillRect(24, 16, 16, 38);
  };
}

interface Placed {
  readonly actor: ActorId;
  readonly kind: Kind;
  readonly holder: Group;
  readonly fill: Mesh;
  readonly edges: LineSegments;
  readonly fillStrength: UniformNode<"float">;
  readonly edgeStrength: UniformNode<"float">;
}

const KIND_OF: Readonly<Record<string, Kind>> = { [Zone.name]: "zone", [Portal.name]: "portal" };

export default defineEditorRenderBinding({
  feature: "forge.zone",
  create(ctx: EditorHelperContext) {
    const placed = new Map<string, Placed>();
    const matrix = new Matrix4();
    const position = new Vector3();
    const rotation = new Quaternion();
    const scale = new Vector3();
    const box = new BoxGeometry(1, 1, 1);
    const boxEdges = new EdgesGeometry(box);
    const plane = new PlaneGeometry(1, 1);
    const planeEdges = new EdgesGeometry(plane);
    /** Zone id (its actor) -> the actors to light with it: itself, its portals; a portal: itself and its zones. */
    let lit = new Map<ActorId, ActorId[]>();

    const partsOf = (actor: WorldActor): [string, ComponentRecord, Kind][] =>
      Object.entries(actor.components).flatMap(([key, component]) => {
        const kind = KIND_OF[parseComponentTypeTag(component.type)?.name ?? ""];
        return kind ? [[key, component, kind] as [string, ComponentRecord, Kind]] : [];
      });

    const add = (actor: WorldActor, key: string, component: ComponentRecord, kind: Kind): void => {
      const holder = new Group();
      holder.name = `${actor.name}/${key} ${kind}`;
      componentWorldMatrix(ctx.world, actor, key, matrix).decompose(position, rotation, scale);
      holder.position.copy(position);
      holder.quaternion.copy(rotation);
      const size: [number, number, number] = kind === "zone"
        ? [...(component as unknown as ZoneData).size] as [number, number, number]
        : [...(component as unknown as PortalData).size, 1] as [number, number, number];
      const color = kind === "zone" ? ZONE_COLOR : PORTAL_COLOR;
      const fillStrength = uniform(FILL.idle), edgeStrength = uniform(EDGE.idle);
      const fillMaterial = new MeshBasicNodeMaterial({ color, transparent: true, depthWrite: false, side: DoubleSide });
      fillMaterial.opacityNode = ctx.sceneVisibility.mul(fillStrength);
      const edgeMaterial = new LineBasicNodeMaterial({ color, transparent: true, depthWrite: false });
      edgeMaterial.opacityNode = ctx.sceneVisibility.mul(edgeStrength);
      const fill = new Mesh(kind === "zone" ? box : plane, fillMaterial);
      const edges = new LineSegments(kind === "zone" ? boxEdges : planeEdges, edgeMaterial);
      for (const part of [fill, edges]) {
        part.scale.set(Math.abs(size[0] * scale.x), Math.abs(size[1] * scale.y), Math.abs(size[2] * scale.z));
        part.raycast = () => {};
      }
      fill.name = `${kind}-fill`;
      edges.name = `${kind}-edges`;
      const icon: Sprite = ctx.icons.create(`zone-${kind}`, drawGlyph(kind), ICON_SCALE);
      tagActorObject(icon, actor.id);
      holder.add(fill, edges, icon);
      ctx.root.add(holder);
      placed.set(`${actor.id}/${key}`, { actor: actor.id, kind, holder, fill, edges, fillStrength, edgeStrength });
    };

    const remove = (id: string): void => {
      const entry = placed.get(id);
      if (!entry) return;
      placed.delete(id);
      entry.holder.removeFromParent();
      (entry.fill.material as MeshBasicNodeMaterial).dispose();
      (entry.edges.material as LineBasicNodeMaterial).dispose();
    };

    /** The links as the renderer finds them, for highlighting. */
    const relink = (): void => {
      const zones: ZoneInput[] = [];
      const portals: PortalInput[] = [];
      for (const entry of ctx.world.componentsOf(Zone.name)) {
        if (zones.some((zone) => zone.id === entry.actor.id)) continue;
        const data = entry.component as unknown as ZoneData;
        componentWorldMatrix(ctx.world, entry.actor, entry.key, matrix).decompose(position, rotation, scale);
        zones.push({ id: entry.actor.id, center: [position.x, position.y, position.z], rotation: [rotation.x, rotation.y, rotation.z, rotation.w],
          halfExtents: [Math.abs(data.size[0] * scale.x) / 2, Math.abs(data.size[1] * scale.y) / 2, Math.abs(data.size[2] * scale.z) / 2] });
      }
      for (const entry of ctx.world.componentsOf(Portal.name)) {
        const data = entry.component as unknown as PortalData;
        componentWorldMatrix(ctx.world, entry.actor, entry.key, matrix).decompose(position, rotation, scale);
        portals.push({ id: entry.actor.id, center: [position.x, position.y, position.z], rotation: [rotation.x, rotation.y, rotation.z, rotation.w],
          halfSize: [Math.abs(data.size[0] * scale.x) / 2, Math.abs(data.size[1] * scale.y) / 2], zoneA: data.zoneA, zoneB: data.zoneB });
      }
      const next = new Map<ActorId, ActorId[]>();
      const exterior = new Set<string>();
      const join = (from: string, to: string): void => {
        const list = next.get(from as ActorId) ?? [];
        list.push(to as ActorId);
        next.set(from as ActorId, list);
      };
      for (const link of buildZoneSet(zones, portals).links) {
        for (const side of [link.a, link.b]) {
          if (side === OUTSIDE) exterior.add(link.portal);
          else { join(side, link.portal); join(link.portal, side); }
        }
      }
      for (const entry of placed.values()) {
        if (entry.kind !== "portal") continue;
        const color = exterior.has(entry.actor) ? OUTSIDE_COLOR : PORTAL_COLOR;
        (entry.fill.material as MeshBasicNodeMaterial).color.set(color);
        (entry.edges.material as LineBasicNodeMaterial).color.set(color);
      }
      lit = next;
    };

    return {
      actorsAdded(actors) {
        for (const actor of actors) for (const [key, component, kind] of partsOf(actor)) add(actor, key, component, kind);
        if (actors.some((actor) => partsOf(actor).length > 0)) relink();
      },
      actorsRemoved(actors) {
        for (const actor of actors) for (const [key] of partsOf(actor)) remove(`${actor.id}/${key}`);
        if (actors.some((actor) => partsOf(actor).length > 0)) relink();
      },
      sync() {
        const selected = ctx.selected();
        const shown = new Set<ActorId>();
        for (const id of selected) {
          shown.add(id);
          for (const other of lit.get(id) ?? []) shown.add(other);
        }
        for (const entry of placed.values()) {
          const on = shown.has(entry.actor);
          entry.fillStrength.value = on ? FILL.lit : FILL.idle;
          entry.edgeStrength.value = on ? EDGE.lit : EDGE.idle;
          entry.holder.userData.zoneHighlight = on;
        }
      },
      dispose() {
        for (const id of [...placed.keys()]) remove(id);
        for (const geometry of [box, boxEdges, plane, planeEdges] as BufferGeometry[]) geometry.dispose();
      },
    };
  },
});
