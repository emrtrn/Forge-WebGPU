// Lights: render binding (plan phase 3 step 3, architecture §4.9). One three
// light per component, placed by the component's world matrix: a directional
// or spot light shines along its local -Z (its target sits one metre ahead).
// Forge WebGL's light setup (engine/render-three/lights.ts) without the editor
// gizmo: colour, intensity, reach, decay, cone angle and penumbra as authored.
//
// Shadows follow the quality profile (map size, distance, on / off): the sun
// (the first directional light marked `atmosphereSun`) with Cascaded Shadows
// casts through CSMShadowNode; every other shadow-casting directional light
// through one map that follows the camera; point and spot lights through
// their own maps. The sun's direction is published for fog, sky and clouds.

import { DirectionalLight, MathUtils, Object3D, PointLight, SpotLight, Vector3 } from "three/webgpu";
import { sunCascadeDistance } from "../../engine/world/sunCascades.ts";
import { parseComponentTypeTag, type ActorId, type ComponentRecord, type WorldActor } from "../../core/index.ts";
import { defineRenderBinding } from "../../render/sync/renderBinding.ts";
import { configureShadow, createSunCascades, FOLLOW_SHADOW_HALF_EXTENT, updateFollowShadow, type SunCascades } from "../../render/sync/sunShadow.ts";
import { componentWorldMatrix } from "../../render/sync/transforms.ts";
import { DirectionalLight as DirectionalLightComponent, PointLight as PointLightComponent, SpotLight as SpotLightComponent } from "./schema.ts";
import type { DirectionalLightData, PointLightData, SpotLightData } from "./schema.ts";

type Placed =
  | { readonly kind: "directional"; readonly actor: ActorId; readonly holder: Object3D; readonly light: DirectionalLight; readonly data: DirectionalLightData; readonly cascades: SunCascades }
  | { readonly kind: "point"; readonly actor: ActorId; readonly holder: Object3D; readonly light: PointLight; readonly data: PointLightData }
  | { readonly kind: "spot"; readonly actor: ActorId; readonly holder: Object3D; readonly light: SpotLight; readonly data: SpotLightData };

const KINDS: Readonly<Record<string, Placed["kind"]>> = {
  [DirectionalLightComponent.name]: "directional",
  [PointLightComponent.name]: "point",
  [SpotLightComponent.name]: "spot",
};

const lightWorld = new Vector3();
const targetWorld = new Vector3();
const forward = new Vector3();

export default defineRenderBinding({
  feature: "forge.light",
  create(ctx) {
    const placed = new Map<string, Placed>();

    const lightsOf = (actor: WorldActor): [string, ComponentRecord, Placed["kind"]][] =>
      Object.entries(actor.components).flatMap(([key, component]) => {
        const kind = KINDS[parseComponentTypeTag(component.type)?.name ?? ""];
        return kind ? [[key, component, kind] as [string, ComponentRecord, Placed["kind"]]] : [];
      });

    const add = (actor: WorldActor, key: string, component: ComponentRecord, kind: Placed["kind"]): void => {
      const holder = new Object3D();
      holder.name = `${actor.name}/${key}`;
      holder.matrixAutoUpdate = false;
      componentWorldMatrix(ctx.world, actor, key, holder.matrix);
      holder.matrixWorldNeedsUpdate = true;
      let entry: Placed;
      if (kind === "directional") {
        const data = component as unknown as DirectionalLightData;
        const light = new DirectionalLight(data.color, data.intensity);
        entry = { kind, actor: actor.id, holder, light, data, cascades: createSunCascades(light) };
      } else if (kind === "point") {
        const data = component as unknown as PointLightData;
        entry = { kind, actor: actor.id, holder, light: new PointLight(data.color, data.intensity, data.distance, data.decay), data };
      } else {
        const data = component as unknown as SpotLightData;
        const light = new SpotLight(data.color, data.intensity, data.distance, MathUtils.degToRad(data.angle), data.penumbra, data.decay);
        entry = { kind, actor: actor.id, holder, light, data };
      }
      // three's directional / spot constructors start at (0, 1, 0); the holder owns the position.
      entry.light.position.set(0, 0, 0);
      entry.light.name = holder.name;
      holder.add(entry.light);
      if (entry.kind !== "point") {
        entry.light.target.position.set(0, 0, -1);
        holder.add(entry.light.target);
      }
      placed.set(`${actor.id}/${key}`, entry);
      ctx.root.add(holder);
    };

    const remove = (id: string): void => {
      const entry = placed.get(id);
      if (!entry) return;
      placed.delete(id);
      if (entry.kind === "directional") entry.cascades.deactivate();
      entry.holder.removeFromParent();
      entry.light.dispose();
    };

    /** The first directional light marked as the sun, in actor order. */
    const sun = (): Extract<Placed, { kind: "directional" }> | null => {
      for (const entry of ctx.world.componentsOf(DirectionalLightComponent.name)) {
        const found = placed.get(`${entry.actor.id}/${entry.key}`);
        if (found?.kind === "directional" && found.data.atmosphereSun) return found;
      }
      return null;
    };

    return {
      actorsAdded(actors) {
        for (const actor of actors) for (const [key, component, kind] of lightsOf(actor)) add(actor, key, component, kind);
      },
      actorsRemoved(actors) {
        for (const actor of actors) for (const [key] of lightsOf(actor)) remove(`${actor.id}/${key}`);
      },
      sync(frame) {
        const quality = ctx.quality();
        const theSun = sun();
        if (theSun) {
          theSun.holder.updateWorldMatrix(true, true);
          theSun.light.getWorldPosition(lightWorld);
          theSun.light.target.getWorldPosition(targetWorld);
          const direction = lightWorld.sub(targetWorld);
          if (direction.lengthSq() > 0) ctx.lighting.sunDirection.copy(direction.normalize());
        }
        for (const entry of placed.values()) {
          const cast = entry.data.castShadow && quality.shadowsEnabled;
          entry.light.castShadow = cast;
          if (entry.kind !== "directional") {
            if (cast) configureShadow(entry.light, quality.shadowMapSize);
            continue;
          }
          if (!cast) {
            entry.cascades.deactivate();
            continue;
          }
          if (entry === theSun && entry.data.cascadedShadows) {
            if (entry.cascades.apply(quality.shadowCascades, sunCascadeDistance(quality.shadowDistanceScale), quality.shadowMapSize)) continue;
          } else {
            entry.cascades.deactivate();
          }
          configureShadow(entry.light, quality.shadowMapSize);
          if (frame.camera === null) continue;
          frame.camera.getWorldDirection(forward);
          updateFollowShadow(entry.light, frame.camera.position, forward, FOLLOW_SHADOW_HALF_EXTENT * quality.shadowDistanceScale);
        }
      },
      dispose() {
        for (const id of [...placed.keys()]) remove(id);
      },
    };
  },
});
