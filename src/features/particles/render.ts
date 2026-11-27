import { InstancedBufferAttribute, InstancedMesh, Matrix4, MeshBasicNodeMaterial, PlaneGeometry, Quaternion, Vector3, type Texture } from "three/webgpu";
import { attribute, texture, uv, vec2 } from "three/tsl";
import { normalizeJsonAsset, parseComponentTypeTag, type ActorId, type WorldActor } from "../../core/index.ts";
import { resourceKey } from "../../render/resources/resourceCache.ts";
import { defineRenderBinding } from "../../render/sync/renderBinding.ts";
import { componentWorldMatrix } from "../../render/sync/transforms.ts";
import { ParticleEffect, ParticleEmitter } from "./schema.ts";

interface Particle {
  readonly position: Vector3;
  readonly velocity: Vector3;
  age: number;
}

const readEffect = (value: unknown) => normalizeJsonAsset(ParticleEffect, value, { strict: false }).value;

export default defineRenderBinding({
  feature: "forge.particles",
  create(ctx) {
    const emitters = new Map<string, { actor: ActorId; dispose(): void; advance(dt: number, facing: Quaternion): void }>();
    const facing = new Quaternion(), origin = new Vector3(), scale = new Vector3();
    const transform = new Matrix4();
    const add = (actors: readonly WorldActor[]) => {
      for (const actor of actors) for (const [key, component] of Object.entries(actor.components)) {
        if (parseComponentTypeTag(component.type)?.name !== ParticleEmitter.name || component.enabled !== true || typeof component.effect !== "string") continue;
        const asset = component.effect;
        let mesh: InstancedMesh<PlaneGeometry, MeshBasicNodeMaterial> | null = null;
        let diffuse: string | null = null;
        let live = true;
        const id = `${actor.id}/${key}`;
        const particles: Particle[] = [];
        let carry = 0, seed = 1;
        let data: ReturnType<typeof readEffect> = null;
        let opacity: InstancedBufferAttribute | null = null;
        const random = () => {
          seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5;
          return (seed >>> 0) / 0x1_0000_0000;
        };
        const create = (image: Texture | null) => {
          if (!live || !data) return;
          const capacity = Math.round(data.capacity);
          const geometry = new PlaneGeometry(1, 1);
          opacity = new InstancedBufferAttribute(new Float32Array(capacity), 1);
          geometry.setAttribute("forgeParticleOpacity", opacity);
          const material = new MeshBasicNodeMaterial({ color: data.tint, transparent: true, depthWrite: false });
          const mask = image ? texture(image, uv()).a : uv().sub(vec2(0.5)).length().mul(-2).add(1).max(0);
          if (image) material.colorNode = texture(image, uv()).rgb;
          material.opacityNode = mask.mul(attribute("forgeParticleOpacity", "float"));
          mesh = new InstancedMesh(geometry, material, capacity);
          mesh.count = 0;
          mesh.frustumCulled = false;
          mesh.name = `${actor.name}/${key}`;
          ctx.root.add(mesh);
        };
        emitters.set(id, {
          actor: actor.id,
          dispose() {
            live = false;
            mesh?.removeFromParent();
            mesh?.geometry.dispose();
            mesh?.material.dispose();
            if (diffuse) ctx.resources.release(resourceKey.texture(diffuse, "srgb"));
            ctx.resources.release(resourceKey.json(asset));
          },
          advance(dt, camera) {
            if (!mesh || !data || !opacity) return;
            const one = ctx.world.actor(actor.id);
            if (!one) return;
            const density = ctx.quality().particleDensity;
            carry += data.rate * density * dt;
            const count = Math.floor(carry);
            carry -= count;
            origin.setFromMatrixPosition(componentWorldMatrix(ctx.world, one, key, transform));
            for (let i = 0; i < count && particles.length < mesh.instanceMatrix.count; i += 1) {
              particles.push({
                position: origin.clone(),
                velocity: new Vector3(...data.velocity).add(new Vector3(random() - 0.5, random() - 0.5, random() - 0.5).multiplyScalar(data.spread)),
                age: 0,
              });
            }
            for (let i = particles.length - 1; i >= 0; i -= 1) {
              const particle = particles[i]!;
              particle.age += dt;
              if (particle.age >= data.lifetime) {
                const tail = particles.pop()!;
                if (i < particles.length) particles[i] = tail;
                continue;
              }
              particle.velocity.y -= data.gravity * dt;
              particle.position.addScaledVector(particle.velocity, dt);
            }
            mesh.count = particles.length;
            particles.forEach((particle, index) => {
              const life = particle.age / data!.lifetime;
              const size = data!.size + (data!.endSize - data!.size) * life;
              mesh!.setMatrixAt(index, transform.compose(particle.position, camera, scale.set(size, size, size)));
              opacity!.setX(index, 1 - life);
            });
            mesh.instanceMatrix.needsUpdate = true;
            opacity.needsUpdate = true;
          },
        });
        void ctx.resources.json(asset).then(async (value) => {
          if (!live) return;
          data = readEffect(value);
          if (!data) return;
          seed = Math.round(data.seed);
          diffuse = data.texture;
          create(diffuse ? await ctx.resources.texture(diffuse, "srgb").catch(() => null) : null);
        }, () => {});
      }
    };
    const remove = (actor: ActorId) => {
      for (const [key, entry] of emitters) if (entry.actor === actor) {
        emitters.delete(key);
        entry.dispose();
      }
    };
    return {
      actorsAdded: add,
      actorsRemoved(actors) { for (const { id } of actors) remove(id); },
      actorsChanged(changes) { for (const { actor, transformOnly } of changes) if (!transformOnly) { remove(actor.id); add([actor]); } },
      sync({ camera, dt }) {
        if (!camera) return;
        camera.getWorldQuaternion(facing);
        for (const emitter of emitters.values()) emitter.advance(dt, facing);
      },
      dispose() { for (const entry of emitters.values()) entry.dispose(); emitters.clear(); },
    };
  },
});
