// Editor billboard icons (plan phase 4 step 3, INV-G27): Forge WebGL's
// createActorBillboardIcon (engine/render-three/actorIcon.ts @
// forge-webgl-final), Unreal-style: a camera-facing sprite painted from a
// cached 64 x 64 canvas glyph, drawn over geometry (no depth test) so an actor
// without a mesh of its own stays visible and clickable. Textures and
// materials are shared per glyph key; the canvas is only made the first time
// a key is asked for.
//
// One change: the glyph texture is marked sRGB, so its colours are drawn as
// painted (Forge's canvas texture had no colour space and came out lighter).

import { CanvasTexture, SpriteNodeMaterial, Sprite, SRGBColorSpace } from "three/webgpu";

/** Paints a glyph onto a square canvas of `size` pixels. */
export type ActorIconGlyph = (ctx: CanvasRenderingContext2D, size: number) => void;

const ICON_CANVAS_SIZE = 64;

export interface ActorIcons {
  /** A sprite of the glyph `key`, `scale` metres wide; the caller places and tags it. */
  create(key: string, draw: ActorIconGlyph, scale?: number): Sprite;
  dispose(): void;
}

export function createActorIcons(document: Document): ActorIcons {
  const materials = new Map<string, SpriteNodeMaterial>();
  const material = (key: string, draw: ActorIconGlyph): SpriteNodeMaterial => {
    const cached = materials.get(key);
    if (cached) return cached;
    const canvas = document.createElement("canvas");
    canvas.width = ICON_CANVAS_SIZE;
    canvas.height = ICON_CANVAS_SIZE;
    const ctx = canvas.getContext("2d");
    if (ctx) draw(ctx, ICON_CANVAS_SIZE);
    const texture = new CanvasTexture(canvas);
    texture.colorSpace = SRGBColorSpace;
    const made = new SpriteNodeMaterial({ map: texture, transparent: true, depthTest: false, depthWrite: false });
    made.name = `editor icon ${key}`;
    materials.set(key, made);
    return made;
  };
  return {
    create(key, draw, scale = 0.5) {
      const sprite = new Sprite(material(key, draw));
      sprite.scale.setScalar(scale);
      sprite.name = "actor-icon";
      // Icons draw after the layer's other helpers.
      sprite.renderOrder = 10;
      return sprite;
    },
    dispose() {
      for (const one of materials.values()) {
        one.map?.dispose();
        one.dispose();
      }
      materials.clear();
    },
  };
}
