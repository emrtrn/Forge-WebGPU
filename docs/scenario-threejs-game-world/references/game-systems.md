# Game systems

Systems of the build that are worth lifting, with the code that carries them and the numbers measured, then a checklist of the systems every genre shares.

## Contents

- Ballistics against drawn triangles
- Clip phase from ground distance
- Reload driven by named parts
- Machines that break up
- Finishes from one pattern set
- Flying enemies and colliders
- Systems every genre shares

## Ballistics against drawn triangles

**The bug.** The first version tested shots against the collision boxes used for walking. Boxes are larger than what is drawn and miss thin geometry. Of 33,760 test rays, 8,637 ended in mid air and 4,621 passed through visible geometry. In the final build no level counts more than 11 in mid air or 10 through, out of 48,384 to 62,208 rays.

**The rule.** A shot is a ray against the triangles that are drawn. Boxes stay for walking only.

The build's module, complete (`three-mesh-bvh`):

<!-- prettier-ignore -->
```js
// Bullets against what is drawn: every shot is a ray tested on the triangles of the visible meshes (three-mesh-bvh),
// not on the coarse boxes used for walking. Static world meshes get a bounds tree once; moving objects are tested each shot.
import * as THREE from 'three';
import { computeBoundsTree, acceleratedRaycast } from 'three-mesh-bvh';
THREE.BufferGeometry.prototype.computeBoundsTree = computeBoundsTree; THREE.Mesh.prototype.raycast = acceleratedRaycast;

const KIND = { paint: 'steel', paintG: 'steel', steel: 'steel', rail: 'steel', corr: 'steel', hazard: 'steel', concrete: 'concrete', brick: 'concrete', tile: 'concrete', wood: 'wood', board: 'wood', ballast: 'ballast', rubber: 'rubber', ground: 'ground', glassDark: 'glass' };
// what a bullet passes through: see-through or thin drawables (fences, wires, decals, glass shaders, particles) and helpers that are never drawn
export function solidMesh(o) {
  if (!o.isMesh || o.isSkinnedMesh || o.userData.noHit) return false; const m = o.material; if (!m || Array.isArray(m)) return false;
  if (m.transparent || m.depthWrite === false || m.colorWrite === false || m.alphaTest > 0 || m.visible === false) return false;
  if (o.name === 'batch:wire' || o.name === 'batch:fence' || o.name === 'batch:decal' || o.name === 'batch:decalPaint') return false;
  return true;
}
const shown = (o) => { for (let p = o; p; p = p.parent) if (!p.visible) return false; return true; };

export class Ballistics {
  constructor(eng) { this.eng = eng; this.scene = eng.scene; this.statics = []; this.set = new Set(); this.rc = new THREE.Raycaster(); this.rc.firstHitOnly = true; this._n = new THREE.Vector3(); this._m = new THREE.Matrix4(); this._one = []; this.skip = new Set(); }
  // call once after the world is built, before actors and effects are added
  collectStatic() { this.scene.updateMatrixWorld(true); this.scene.traverse((o) => { if (!solidMesh(o) || this.set.has(o)) return; if (o.geometry.boundingSphere === null) o.geometry.computeBoundingSphere(); if (!o.geometry.boundsTree && o.geometry.attributes.position.count > 600) o.geometry.computeBoundsTree(); this.statics.push(o); this.set.add(o); }); this.dynT = -1; }
  // roots that never stop bullets (view model, effect pools)
  ignore(root) { root.traverse((o) => this.skip.add(o)); this.skip.add(root); }
  _dynamics() { const n = this.scene.children.length; if (this.dynN === n && this.dyn && this.tick === this.dynT) return this.dyn; const out = []; const walk = (o) => { if (this.skip.has(o) || !o.visible) return; if (o.isMesh && !this.set.has(o) && solidMesh(o)) { const g = o.geometry; if (!g.boundsTree && g.attributes.position && g.attributes.position.count > 3000) g.computeBoundsTree(); out.push(o); } for (const c of o.children) walk(c); }; walk(this.scene); this.dyn = out; this.dynN = n; this.dynT = this.tick; return out; }
  // returns { t, x, y, z, nx, ny, nz, mat, object, dynamic } or null
  cast(o, d, maxT = 300, staticOnly = false) {
    const rc = this.rc; rc.ray.origin.copy(o); rc.ray.direction.copy(d); rc.near = 0; rc.far = maxT; let best = null, dyn = false;
    for (let i = 0; i < this.statics.length; i++) { const m = this.statics[i]; if (!m.visible || (m.parent !== this.scene && !shown(m))) continue; this._one.length = 0; m.raycast(rc, this._one); for (const h of this._one) if (!best || h.distance < best.distance) { best = h; rc.far = h.distance; } }
    if (!staticOnly) { const D = this._dynamics(); for (let i = 0; i < D.length; i++) { const m = D[i]; if (!shown(m)) continue; m.updateWorldMatrix(true, false); this._one.length = 0; m.raycast(rc, this._one); for (const h of this._one) if (!best || h.distance < best.distance) { best = h; rc.far = h.distance; dyn = true; } } }
    if (!best) return null;
    const n = this._n; if (best.face) { n.copy(best.face.normal); if (best.instanceId != null && best.object.isInstancedMesh) { best.object.getMatrixAt(best.instanceId, this._m); n.transformDirection(this._m); } n.transformDirection(best.object.matrixWorld); if (n.dot(d) > 0) n.negate(); } else n.set(-d.x, -d.y, -d.z);
    const ob = best.object, key = ob.name.startsWith('batch:') ? ob.name.slice(6) : ''; const mat = ob.userData.kind || KIND[key] || 'steel';
    return { t: best.distance, x: best.point.x, y: best.point.y, z: best.point.z, nx: n.x, ny: n.y, nz: n.z, mat, object: ob, dynamic: dyn };
  }
}
```

Points to keep when porting it:

- `solidMesh` decides what stops a bullet: drawn, opaque, depth-writing meshes. Skinned, transparent and alpha-tested meshes and particle batches are out.
- One bounds tree per static mesh above a vertex threshold, built once after the level loads. Moving parts (machines, doors) are tested per shot without a tree.
- `cast` returns the hit point, the normal and the object, so the decal lands on the surface that is drawn and the hit can name the part of a machine.
- The same `solid` function is exposed on the hook for the impact test, so the test hides nothing the game shoots at.

## Clip phase from ground distance

A walk clip played at a time rate slides whenever the machine's speed differs from the clip's. Drive the clip by distance: the phase advances by distance travelled over stride.

The build's functions (`damp` is an exponential approach, `clamp` the usual one; `G` is the per-machine state, `a` its actions by name, `B` its table entry with `move`, `run`, clip speeds `v0`, `v1` and switch speeds `sw`, `vs` the signed ground speed, `k` the model scale):

<!-- prettier-ignore -->
```js
const fr = (x) => x - Math.floor(x);
export function gait(G, a, B, vs, k, dt) {
  const mv = a[B.move], rn = B.run && a[B.run], d0 = mv.getClip().duration, L0 = B.v0 * k * d0, sp = Math.abs(vs); mv.timeScale = 0; G.gph = fr((G.gph || 0) + vs / L0 * dt); mv.time = G.gph * d0; if (!rn) return 0;
  const d1 = rn.getClip().duration, L1 = B.v1 * k * d1, sw = B.sw || [B.v0 * 2, B.v0 * 2.6]; rn.timeScale = 0; G.gRun = sp > sw[G.gRun ? 0 : 1] * k; G.grw = damp(G.grw || 0, G.gRun ? 1 : 0, 30, dt); G.gph1 = fr((G.gph1 || 0) + (B.rmax ? clamp(vs / L1, -B.rmax / d1, B.rmax / d1) : vs / L1) * dt); rn.time = G.gph1 * d1; return G.grw; }
// heading of the body of a legged machine: along the movement, or opposite to it when the movement points away from the facing (it backs up); the facing itself is kept for the logic and the head
export function bodyYaw(G, yaw, vx, vz, on, dt) { let tg = yaw; if (on && Math.hypot(vx, vz) > 0.25) { const mh = Math.atan2(-vx, -vz), e = Math.abs(Math.atan2(Math.sin(mh - yaw), Math.cos(mh - yaw))); G.bkw = e > (G.bkw ? 1.75 : 2.1); tg = G.bkw ? mh + Math.PI : mh; } else G.bkw = false;
  if (G.byaw === undefined) G.byaw = yaw; const d = Math.atan2(Math.sin(tg - G.byaw), Math.cos(tg - G.byaw)); G.byaw += clamp(d, -7 * dt, 7 * dt); return G.byaw; }
```

- `timeScale = 0` and `time = phase * duration`: the mixer only poses, the game owns the clock.
- Stride is `L0 = v0 * k * duration`: the ground speed the clip was authored for, times its length. This is why the builder prompt must state speed and distance per cycle.
- Gaits are **switched with hysteresis** (`sw: [down, up]`), **never blended**. A blend of walk and run measured 0.3 to 0.5 of slide; the switch measured 0.05.
- `bodyYaw` turns the body toward travel at up to 7 rad/s and backs up when the movement points away from the facing. The logical facing stays for aiming and the head.
- One mixer per machine, built in a `mount(src, scale)` that clones the loaded scene. A look layer (tilt, recoil, hit shake) is a plain group inserted above the animated node, so code and clip never fight over one transform.

Measured foot slide in the final build (mean speed of the feet during stance as a share of the body speed: 0 is planted, 1 is dragged): walker 0.05 at 2.9 m/s (0.65 before the run clip), spider 0.04 at 4.6 m/s, small crawler 0.36 to 0.38 with its walk clip. That clip moves its three leg pairs at 0.46, 0.29 and 0.32 m/s, so no playback rate plants all six feet.

## When no rate plants the feet: compute the walk

Build v2.2 replaced the small crawler's walk clip with a computed walk and kept the clips for idle, aim, hit and the run. Two tripods run half a cycle apart, with 62 percent of the cycle in stance. In stance the tip of a leg is held on a line that runs backward at the ground speed: hip yaw toward the tip, then the two segments solved for the reach in the plane of the leg. In swing the tip is carried forward with a small lift. The clips still sway the hull, so the targets are set in the rest frame of the hull and brought into its current frame. It works because the builder file has rigid legs with named upper and lower segments and pivots at the joints.

Measured at the tip (mean speed while in the lowest 12 percent of its height, as a share of body speed): 0.47 to 0.02 at 0.36 m/s, 0.46 to 0.01 at 0.8 m/s. The older probe followed a corner of the lower leg bounds, which swings around a planted tip: on that point the new walk still reads 0.46. Probe the point that touches the floor.

From `game/src/built.js`, verbatim (`Q` is the page's URL parameters, `fr` the fractional part, `clamp` the usual clamp):

<!-- prettier-ignore -->
```js
// Six-legged body (tick crawler): rest geometry of each leg in hull space. hip: pivot of the upper segment, knee: pivot of the lower one, tip: mean of the lowest
// vertices of the lower segment. The leg is solved in the vertical plane through hip and tip: l1, l2 are the two lengths, a10, a20 the rest angles of the segments.
function legRig(inner, N) {
  if (!N.hull || !N.leg_L1_upper || !N.leg_R3_lower) return null; inner.updateMatrixWorld(true); const hi = new THREE.Matrix4().copy(N.hull.matrixWorld).invert(), list = [], v = new THREE.Vector3();
  for (const [s, ph] of [['L1', 0], ['R2', 0], ['L3', 0], ['R1', 0.5], ['L2', 0.5], ['R3', 0.5]]) { const up = N['leg_' + s + '_upper'], lo = N['leg_' + s + '_lower']; if (!up || !lo || up.parent !== N.hull || lo.parent !== up) return null;
    const hip = up.position.clone(), knee = new THREE.Vector3().setFromMatrixPosition(lo.matrixWorld).applyMatrix4(hi), pts = []; let lowY = 1e9;
    lo.traverse((m) => { if (!m.isMesh) return; const pa = m.geometry.attributes.position; for (let j = 0; j < pa.count; j++) { v.fromBufferAttribute(pa, j).applyMatrix4(m.matrixWorld).applyMatrix4(hi); pts.push(v.clone()); if (v.y < lowY) lowY = v.y; } });
    const tip = new THREE.Vector3(); let n = 0; for (const q of pts) if (q.y < lowY + 0.012) { tip.add(q); n++; } if (!n) return null; tip.multiplyScalar(1 / n);
    const t0x = tip.x - hip.x, t0z = tip.z - hip.z, r = Math.hypot(t0x, t0z), al0 = Math.atan2(t0x, t0z), ty = tip.y - hip.y, rk = (knee.x - hip.x) * Math.sin(al0) + (knee.z - hip.z) * Math.cos(al0), yk = knee.y - hip.y;
    const n0 = new THREE.Vector3(-Math.cos(al0), 0, Math.sin(al0)), rqU = up.quaternion.clone(), rqL = lo.quaternion.clone();
    list.push({ up, lo, ph, tipL: tip.clone().applyMatrix4(new THREE.Matrix4().copy(lo.matrixWorld).invert().multiply(N.hull.matrixWorld)), hip, t0x, t0z, ty, al0, l1: Math.hypot(rk, yk), l2: Math.hypot(r - rk, ty - yk), a10: Math.atan2(yk, rk), a20: Math.atan2(ty - yk, r - rk), n0, nL: n0.clone().applyQuaternion(rqU.clone().invert()), rqU, rqL }); }
  const A = +(Q.get('tla') ?? 0.2), beta = +(Q.get('tlb') ?? 0.62); N.hull.updateMatrix(); return { list, A, beta, H: +(Q.get('tlh') ?? 0.07), Ls: A / beta, hull: N.hull, H0: N.hull.matrix.clone() };
}
// Walk of the six-legged body from ground distance: two tripods half a cycle apart. In stance the tip is held on a line that runs backward at the ground speed
// (hip yaw toward the tip, then the two segments solved for the reach), so the planted foot does not move over the floor; in swing it is carried forward with a lift.
// wgt is the share of the walk in the pose (the clips keep idle, aim, hit and the run).
const _q1 = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), UPY = new THREE.Vector3(0, 1, 0), _lm = new THREE.Matrix4(), _lv = new THREE.Vector3();
export function procLegs(G, u, vs, dt, wgt) {
  const P = u.legs; if (!P) return; G.pph = fr((G.pph || 0) + vs / (P.Ls * u.piv.scale.x) * dt); if (wgt <= 0.001) return;
  P.hull.updateMatrix(); _lm.copy(P.hull.matrix).invert().multiply(P.H0);   // the clips sway the hull: targets are set in the rest frame of the hull and brought into its current frame
  for (const L of P.list) { if (L.up.userData.gone || L.lo.userData.gone) continue; const q = fr(G.pph + L.ph); let off, lift = 0; if (q < P.beta) off = P.A * (0.5 - q / P.beta); else { const s = (q - P.beta) / (1 - P.beta), e = s * s * (3 - 2 * s); off = P.A * (e - 0.5); lift = P.H * Math.sin(Math.PI * s); }
    _lv.set(L.hip.x + L.t0x, L.hip.y + L.ty + lift, L.hip.z + L.t0z + off).applyMatrix4(_lm); const dx = _lv.x - L.hip.x, dz = _lv.z - L.hip.z, al = Math.atan2(dx, dz), rho = Math.hypot(dx, dz), ty = _lv.y - L.hip.y, D = Math.min(Math.hypot(rho, ty), L.l1 + L.l2 - 1e-3), ga = Math.atan2(ty, rho), a1 = ga + Math.acos(clamp((L.l1 * L.l1 + D * D - L.l2 * L.l2) / (2 * L.l1 * D), -1, 1)), kx = L.l1 * Math.cos(a1), ky = L.l1 * Math.sin(a1), a2 = Math.atan2(ty - ky, rho - kx);
    _q1.setFromAxisAngle(UPY, al - L.al0); _q2.setFromAxisAngle(L.n0, a1 - L.a10); _q1.multiply(_q2).multiply(L.rqU); L.up.quaternion.slerp(_q1, wgt);
    _q2.setFromAxisAngle(L.nL, (a2 - L.a20) - (a1 - L.a10)).multiply(L.rqL); L.lo.quaternion.slerp(_q2, wgt); } }
```

## Reload driven by named parts

The weapons are builder models with parts named `magazine`, `bolt`, `charging_handle`, `pump`, `slide`. A reload is a list of stages, each moving one named part by code (drop the magazine, bring a new one, rack the bolt), with its sound.

- A part that changes hands is reparented with `group.attach(node)`, which keeps its world transform.
- Offsets are measured on the file, per weapon. Orientation differed between files of one batch: read the barrel and stock positions and rotate in the loader.
- A variant ordered as an edit keeps names and positions, so the stages work unchanged. A variant ordered as a new build breaks them.

## Machines that break up

Because every part is a node: `dropPart` detaches a named part with a velocity and lets it fall to the floor, `breakUp` does it for a list of parts from an impact direction, and a `scorch` pass darkens the materials of the wreck. Cover plates named in the builder prompt (`plate_FL`, `cover_plates`) exist for this.

## Finishes from one pattern set

The six weapons came from separate builds. One finish gives them a family look:

1. A regular expression on part names gives each part a class.
2. All parts share clones of the hero weapon's two materials; the class goes into a vertex colour.
3. UVs are box-projected from position (`uv = position_m * 15`), so parts without UVs work.
4. An attribute holds the distance to the nearest crease (edges sharper than 30 degrees). Wear is `1 - smoothstep(0.0001, 0.00035 + 0.001 * noise^3, minEdge)`: bare metal on edges, broken up by noise.
5. Site skins multiply one generated PBR base colour into the paint, at 0.2 to 0.3 (0.85 for a navy skin).

Six finishes per weapon came from this: factory plus five site skins. Two site editions with physical additions were builder edits (see builder-prompts.md).

## Flying enemies and colliders

A flying enemy that steers straight at an orbit point around the player, with no test against the level's colliders, ends inside buildings and crosses walls. A demo pass can hide it: in the reference build the fault stayed until a probe counted it. Give every flying enemy the static colliders from its first version.

As built in the reference game:

- **Goal point.** Each frame the orbit point is kept only if it is free air for the enemy's sphere plus a margin (0.5 m plus 0.16 m) and the segment to it is clear. Otherwise the enemy takes the nearest free point on wider or higher rings, preferring one with a clear line to the player, and holds it for a short time (0.7 s) so the choice does not flicker. Fallbacks: the spawn anchor, then a climb. An enemy that barely moves for 1.2 s while far from its goal takes the next candidate.
- **Movement.** Axis-separated sub-steps of at most 0.15 m against the static colliders: a blocked axis slides and loses its speed.
- **Spawn.** An enemy that starts inside a solid is lifted or pushed out.
- **Falling.** A shot-down enemy uses the same movement and rests on a roof if it lands on one.
- **Fire** needs a clear segment to the player.

The probe (described here; it is not among the packaged scripts): each frame, test every enemy sphere against all static colliders, and the segment from its previous position. Count the frames that overlap a solid and the segments that cross one, for flying and for falling enemies. Run it on the demo pass and on a stress run: several enemies, the player moved beside the biggest solids, half of the enemies shot down mid-run.

Result in the reference build, on its three levels with drones: thousands of overlap frames and crossings per level before the fix (up to 13,808 overlap frames in one stress run), 0 and 0 after it on every run.

Limits and a side effect: only static colliders are tested, so a ceiling that is not a collider is not seen. Enemies that keep to free air see the player more often: the share of frames with a clear line rose in the demo passes (51 to 91 percent on one level). Check difficulty again after the fix.

## Systems every genre shares

Evidence: each line says "build" when the reference build has it and it passed its scripted checks, or "derived" when it is standard practice that the build did not exercise. Write one line per system in the brief: what the game needs, or "none".

### Time step and loop

- Build: a fixed step of 1/60 s for simulation with a seeded generator, so a demo pass replays the same frames for captures.
- Build: the loop returns before drawing while the document is hidden.
- Derived: physics-heavy games (vehicles, fighting) run whole substeps inside each 1/60 s step (two at 120 Hz, four at 240 Hz), never a variable step. The demo pass and the hook's frame advance then stay repeatable.
- Ambient effects draw from their own generator, never from the seeded one.

### Input

- Build: keyboard and mouse with pointer lock; sensitivity, invert Y; a hold key and a toggle key for the same action; hints that fade once used.
- Build: the audio context and pointer lock start on a user gesture only.
- Derived: gamepad through the browser's gamepad interface, with dead zones, analogue triggers and a remap screen; touch controls for phones. A scripted browser has no pad: test pad logic through a test-only virtual device that feeds the same action table with analogue values, and keep one human pass with a real pad.
- One action table: every action has a name, and devices bind to names. Tests drive actions through the real events, not through the table.
- Focus loss, pointer lock loss and a hidden tab all pause.

### Camera

- Build: first person at eye height, a field of view option, exposure that settles at once after a cut or respawn.
- Derived: orbit boom, chase spring, fixed pitch from above, rail (see the genre files).
- Every camera has collision or bounds, a cut rule (no easing through walls after a teleport), and a list of positions the exposure test samples.
- Shake, bob, blur and field of view changes sit behind switches.

### Physics and collision

- Build: the player's body against boxes of the level kit; shots against the drawn triangles through a bounds tree; parts that break off as simple falling bodies.
- Rule from the build: the test a player can see (a shot, a hit, a contact) runs against what is drawn. Proxy shapes are for bodies that slide along the world.
- Derived: wheel rays for vehicles, hit and hurt volumes on bones for melee and for shots at skinned bodies (the ray filter above skips skinned meshes), a physics library when stacking or joints are needed. The reference build used none and none is recommended here: choose at the grey-box and prototype the hardest case (a pile-up, a ragdoll, a stack) before committing.
- A kill plane and a reset for anything that can leave the world.

### Opponents and AI

- Build: machines with states (idle, alert, approach, aim with a telegraph, fire, hit, break up), one mixer each, an alert sound on waking, a marker on the map.
- Build: the telegraph length equals the `aim` clip length.
- Build: flying machines test their goal points and their movement against the static colliders ("Flying enemies and colliders" above).
- Derived: a navigation mesh or grid from the collision layout (the build's machines moved in open halls without one; no library was used or is recommended here), path requests spread over frames, a cap on simultaneous attackers, rival drivers on a racing line, pursuit curves in the air.
- Every state change is visible or audible to the player.

### Damage and health

- Build: player health with a hit sound, a final hit, a death sequence (last breath, fall, ring, the mix low-passed until respawn), "signal lost" and retry from the last checkpoint.
- Build: machines lose named parts under fire and break apart into their parts when destroyed.
- Derived: damage by part or by bone, armour, status effects, vehicle damage by detached parts.
- A damage table in one file: source, target, amount, by difficulty.

### Progression and game flow

- Build: mission select with one card per level, a loadout choice, three difficulties, checkpoints at each beat, results with a grade, best record per level.
- Build: a choice made in a menu applies to the mission that follows, rebuilt in place (0.04 to 0.07 s) without a page reload.
- Derived: unlocks, upgrades, currencies, a campaign map. Each one is interface, save data and tests.
- The whole flow exists in the grey-box.

### Save and settings

- Build: options and best records stored in the browser; splash once per session; the asset count of the last load stored for the progress bar.
- Derived: a save of world state with a version number, written at checkpoints, with a test that an old save loads or is refused with a message.
- Say to the player what clearing site data removes.

### Difficulty

- Build: three levels chosen at deploy.
- Suggestion: change health, damage, counts and resources; keep telegraph lengths and rules the same so skill carries over.
- Not measured in the build: whether the balance holds in human play. Write it as not verified until a person has finished a level on each setting.

### Accessibility and comfort

- Build: subtitles for every voice line; a brightness slider; switches for motion blur and grain; three volume sliders; an enemy highlight with Off, Subtle and Strong; a toggle in place of a held key; a field of view option.
- Build: a reduced-motion mode that follows `prefers-reduced-motion` live. Camera shake, bob and menu motion off, flashes scaled, recoil and every action kept ([performance.md](performance.md)).
- Derived: remapping, a colour-blind check of team and hazard colours (shape or mark as well as hue), text size, hold-to-press alternatives, a pause that works everywhere.
- Photosensitivity: run the flash scan on every demo pass and keep the highest frame mean per segment under your bound.

### Pause, focus and failure

- Build: pause on leaving pointer lock; the loop suspended when hidden or off screen; on a lost graphics context the page leaves full screen and offers a restart.
- Every state of the game answers three questions: what does pause do here, what does a reload do here, what does a lost context do here.

### Debug hook and switches

- Build: a hook that reports "ready", level, player state and counters, and URL switches for level, demo pass, quality, each effect family, the map and subtitles ([testing.md](testing.md), page contract).
- Add them in the grey-box. Every test and every capture depends on them.
- Tests read state through the hook and act through the real screen.
