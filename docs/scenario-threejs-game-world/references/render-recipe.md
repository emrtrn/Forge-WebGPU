# Render recipe

The post stack, light handling and guards of the build (three.js 0.187, WebGL2, forward renderer). Values are the ones the final levels shipped with. They are starting points: judge every one on the pair, at full size.

## Contents

- Frame order
- Light loop patch
- Baked practical lamps
- Shadowed key lights with cached maps
- Mirror rule
- Fog and light cones
- Bloom, final pass
- Non-finite pixel guard
- Surfaces
- Switches for before and after

## Frame order

1. Planar mirror of the scene into a half-float target (wet ground reads it).
2. Scene into a half-float target, no tone mapping.
3. Ambient occlusion (`n8ao`) at half resolution.
4. One full-screen pass: analytic height fog plus raymarched light cones.
5. Bloom (`UnrealBloomPass`) on a clamped input.
6. Final pass: exposure 1.32, ACES tone mapping, grade, vignette, FXAA, contrast-adaptive sharpen, grain.

The simulation runs at a fixed 1/60 s step with a seeded random generator. A capture steps the simulation and draws one frame per step, so two runs give the same frames, and a still at 23 s costs seconds (step without drawing, then draw once).

## Light loop patch

Stock three.js evaluates every light on every lit pixel. With some thirty lights and a mirror view on top, that was the largest cost of a frame. The patch skips the BRDF and the shadow lookup for a light that does not reach the pixel. Apply it once, before any material compiles:

<!-- prettier-ignore -->
```js
{ const C = THREE.ShaderChunk; const n0 = C.lights_fragment_begin.length;
  C.lights_fragment_begin = C.lights_fragment_begin
    .replace(/directLight\.color \*= \( directLight\.visible && receiveShadow \) \? (get\w*Shadow\([^;]*\)) : 1\.0;/g, 'if ( directLight.visible && receiveShadow ) directLight.color *= $1;')
    .replace(/RE_Direct\( directLight, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight \);/g, 'if ( directLight.visible ) { RE_Direct( directLight, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight ); }');
  if (C.lights_fragment_begin.length === n0) console.warn('light loop patch did not apply'); }
```

The warning matters: a three.js release that rewords the chunk makes the patch a silent no-op. Check the console after an upgrade.

## Baked practical lamps

Static practicals (work lights, signals, door and canopy lamps) are not scene lights. Their positions and colours are written into the shader source as one range-culled loop appended to `lights_fragment_end`: a pixel outside a lamp's range pays one dot product. The build's API:

<!-- prettier-ignore -->
```js
addYardLamp(pos, col, I, range, decay = 1.7, mode = 1, bounce = false, rmin = 0);
bakeYardLamps();   // once per level, before the first frame
```

Each baked lamp becomes a block of this shape (world position `ylW`, world normal `ylN`, accumulators `ylD` diffuse and `ylS` specular):

```glsl
{ vec3 L = vec3(LX, LY, LZ) - ylW; float d2 = dot(L, L);
  if (d2 < RANGE2) { float d = sqrt(d2); vec3 Ln = L / d; float ndl = dot(ylN, Ln);
    if (ndl > 0.0) { float c = 1.0 - d2 * d2 / RANGE4;
      vec3 E = vec3(R, G, B) * (STATE * c * c * ndl / max(pow(d, DECAY), RMIN_POW));
      ylD += E;
      #ifdef STANDARD
      ylS += E * BRDF_GGX(Ln, ylV, ylN, material);
      #endif
    } } }
```

- `c * c` windows the lamp to zero at its range, so the cull is invisible.
- `rmin` per lamp clamps the falloff near the source, so the nearest surface (the wall a lamp is fixed to) does not clip to white.
- `bounce` lamps use a wrapped diffuse term and no specular: cheap fill that stands in for bounced light.
- Lamp states (on, follows a power ramp, off once power returns) ride on the channels of `ambientLightColor`, set by one `AmbientLight` of tiny intensity, so no shader recompiles when the state changes.

Measured in the first version of the build: 16.3 ms per frame against 31.0 ms with the same lamps as engine lights.

## Shadowed key lights with cached maps

One or two shadowed spot lights per level carry the key shapes. Their maps are static:

- `light.shadow.autoUpdate = false`, and `light.shadow.needsUpdate = true` only when something moves inside the cone (every second frame at most).
- `renderer.shadowMap.needsUpdate = true` is the global gate; each light then decides for itself.
- Trap: the first version never drew its shadow maps at all (update switched off globally). Look for the shadow of one known object in a full-size frame.
- Trap: the 16 texture unit limit of a fragment shader was met once (maps for surface, mirror, shadows and lamps add up). Count samplers before adding a shadowed light.

## Mirror rule

The mirror draws the scene a second time. Machines and placed models under 7 m across are drawn in it only within 22 m of the camera.

- One level pose: 1,878 to 1,433 draw calls, about 58 fps against 48 to 50.
- Another level's airlock: 2,119 to 1,518 draw calls.

Machines built from 14 to 66 rigid parts cost that many draw calls each, twice with the mirror: this rule and the part budget in the builder prompt are the two levers.

## Fog and light cones

One full-screen pass at half resolution:

- Analytic height fog (density falls with height), colour taken from the sky.
- Raymarched cones for up to 14 lights, 7 samples each, with a 4 x 4 ordered jitter; the key light gets 22 samples.
- Upsampled with a 16-tap tent filter, which hides the jitter pattern.

Each practical lamp also gets a cheap additive cone mesh (strength 0.035 to 0.14, longer shafts with a base of 0.5). Haze of moving lights fades near the player (full at 8 m, 5 percent at 2 m): before that, a headlight passing the camera glared over the frame for half a second in one capture. Emissive tanks need a local lamp and neutral fog around them.

## Bloom, final pass

<!-- prettier-ignore -->
```js
new UnrealBloomPass(new THREE.Vector2(w, h), 0.46, 0.72, 1.15); // strength, radius, threshold
```

The bloom input is clamped in the pass's high-pass shader, so one very bright pixel cannot bloom the whole frame. The final pass applies exposure 1.32, ACES, the grade, vignette, FXAA, sharpen and grain, in that order. Judge the grade at full size next to the target: on 320 px cells a grade passed that did not hold at full size.

## Non-finite pixel guard

Symptom: single full-white frames in a capture, 17 across three 40 s clips, none visible on a contact sheet. Cause: one pixel with a non-finite value in the mirror target (`pow(vV, 1.8)` on a varying that interpolation made slightly negative). The mip chain of the mirror and the bloom spread it over the frame.

1. Find the frame: `python3 scripts/flashscan.py clip.mp4`.
2. Name the object: `node scripts/capture/nanprobe.mjs "level=3&demo=1" <frame>` reads the target back, counts non-finite pixels and hides objects one at a time.
3. Fix the source: `pow(max(x, 0.0), e)`; never `normalize` a vector that can be zero; no division by a value that can reach zero.
4. Guard where the scene buffer is first read, before fog, cones and bloom:

```glsl
vec3 col = texture2D(tDiffuse, vUv).rgb;
if (!(col.r + col.g + col.b < 1e5)) col = vec3(0.0);
```

The comparison is written so that a NaN fails it. A guard in the final pass does nothing: by then the bloom has spread the pixel.

## Surfaces

- Interior walls are dielectric. Metalness on a wall turns it black where no reflection reaches. Keep metal for trim, rails and machines.
- Tile needs gloss to read as tile (roughness about 0.42). Painted steel and stone held best with a constant roughness plus noise.
- World-space wear in every surface shader (large-scale noise on albedo and roughness) hides tiling.
- Decals are restricted by wall type.
- Built metal under strong lamps: cap metalness to 0.45 to 0.85, raise roughness, scale base colour by 0.3 to 0.5.
- A surface that stays black: read its albedo first. A linear albedo near 0.03 stays black under any light.

## Switches for before and after

Every effect family reads a URL factor (`?nofog=1`, `?nof=1` for the state before the look pass, a bloom or haze factor). One capture with one switch changed is the proof that a change did what its name says, and the picture for the making-of.
