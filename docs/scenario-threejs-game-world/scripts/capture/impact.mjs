// Impact test: does a shot land on what is drawn? For a grid of rays from many views of a level,
// the distance of the game's own shot ray is compared with the depth of the drawn geometry at
// the same pixel. It counts impacts in mid air (the shot stops before the drawn surface) and
// passes through visible geometry (the shot goes on behind it).
//
// Usage: node scripts/capture/impact.mjs <levels=1> [out.json] [extra-query]
//   node scripts/capture/impact.mjs 1,2,3 out/tests/impact.json
//
// Page contract on top of lib.mjs: __g.play(), __g.solid(mesh) (true for a mesh that stops a
// bullet), __g.game.world.rayShot(origin, dir, maxT) returning { t, object, mat } or null,
// __g.game.mod.poses and .checkpoints as [x, y, z, yaw] lists (optional .impactSpots),
// __g.game.actors.list with an active flag. Optional __g.impactHide: objects to hide (view model).
// A level passes under 1 percent of each kind. Name what is left in the report: silhouette edges,
// and far objects that are drawn without a hit mesh on purpose. Exit code 1 on a failed level.
import fs from 'node:fs';
import path from 'node:path';
import { serve, launch, open, real } from './lib.mjs';
const levels = (process.argv[2] || '1').split(',').map(Number);
const out = process.argv[3];
// the extra query is joined with '&' whether or not it starts with one
const extra = process.argv[4] ? '&' + process.argv[4].replace(/^&/, '') : '';
const { srv, url } = await serve();
const { ctx, page, errors } = await launch(1280, 720, 'impact');
const all = {};
let bad = 0;
for (const L of levels) {
  await open(page, url, `level=${L}&capture=1${extra}`);
  const res = await page.evaluate(() => {
    const g = __g.game,
      eng = __g.eng,
      THREE = __g.THREE,
      cam = eng.camera,
      scene = eng.scene,
      r = eng.renderer;
    __g.play();
    for (const a of g.actors.list) a.active = false;
    __g.advance(3, false);
    const W = 320,
      H = 180,
      rt = new THREE.WebGLRenderTarget(W, H, { depthBuffer: true });
    // view distance packed into three bytes: the depth of what is drawn, read back per pixel
    const mat = new THREE.ShaderMaterial({
      vertexShader:
        'varying vec3 vV; void main(){\n#include <begin_vertex>\n#include <project_vertex>\n vV = mvPosition.xyz; }',
      fragmentShader:
        'varying vec3 vV; void main(){ float q = clamp(length(vV) / 400.0, 0.0, 0.99999); vec3 e = fract(q * vec3(1.0, 255.0, 65025.0)); e.xy -= e.yz / 255.0; gl_FragColor = vec4(e, 1.0); }',
      side: THREE.DoubleSide,
    });
    // hide what a bullet passes through by design (the same rule as the shot ray): see-through and thin drawables, particles, the view model
    const hidden = [];
    scene.traverse(o => {
      if (!o.visible) return;
      if (o.isPoints || o.isSprite || o.isLine || (o.isMesh && !__g.solid(o))) {
        o.visible = false;
        hidden.push(o);
      }
    });
    for (const o of __g.impactHide || [])
      if (o.visible) {
        o.visible = false;
        hidden.push(o);
      }
    const buf = new Uint8Array(W * H * 4),
      o = new THREE.Vector3(),
      d = new THREE.Vector3(),
      groups = {},
      poses = [];
    let rays = 0,
      air = 0,
      through = 0,
      sky = 0;
    const spots = [
      ...g.mod.poses.map(p => [p[0], p[1], p[2], p[3]]),
      ...(g.mod.checkpoints || []).map(c => [c[0], c[1], c[2], c[3] || 0]),
      ...(g.mod.impactSpots || []),
    ];
    for (const sp of spots)
      for (const dy of [0, 1.6, 3.14, -1.6])
        for (const pitch of [0, 0.42, -0.3]) {
          cam.position.set(sp[0], sp[1] + 1.65, sp[2]);
          cam.rotation.set(pitch, sp[3] + dy, 0, 'YXZ');
          cam.fov = 75;
          cam.updateProjectionMatrix();
          cam.updateMatrixWorld(true);
          const bg = scene.background;
          scene.background = null;
          scene.overrideMaterial = mat;
          r.setRenderTarget(rt);
          r.setClearColor(0x000000, 0);
          r.clear();
          r.render(scene, cam);
          r.readRenderTargetPixels(rt, 0, 0, W, H, buf);
          r.setRenderTarget(null);
          scene.overrideMaterial = null;
          scene.background = bg;
          let pa = 0,
            pt = 0;
          for (let gy = 5; gy < H; gy += 10)
            for (let gx = 5; gx < W; gx += 10) {
              const bi = (gy * W + gx) * 4;
              const vis =
                buf[bi + 3] > 0 && buf[bi] + buf[bi + 1] + buf[bi + 2] > 0
                  ? (buf[bi] / 255 +
                      buf[bi + 1] / 65025 +
                      buf[bi + 2] / 16581375) *
                    400
                  : 1e9;
              o.setFromMatrixPosition(cam.matrixWorld);
              d.set(((gx + 0.5) / W) * 2 - 1, ((gy + 0.5) / H) * 2 - 1, 0.5)
                .unproject(cam)
                .sub(o)
                .normalize();
              const hit = g.world.rayShot(o, d, 300);
              const t = hit ? hit.t : 1e9;
              rays++;
              if (t > 1e8 && vis > 1e8) {
                sky++;
                continue;
              }
              const tol = Math.max(0.3, Math.min(t, vis) * 0.05);
              if (t < vis - tol || t > vis + tol) {
                const isAir = t < vis - tol;
                if (isAir) {
                  air++;
                  pa++;
                } else {
                  through++;
                  pt++;
                }
                const key =
                  (isAir ? 'air: ' : 'through: ') +
                  (hit
                    ? (hit.object.name || hit.object.type) + ' / ' + hit.mat
                    : 'no hit');
                const G = groups[key] || (groups[key] = { n: 0, gap: 0 });
                G.n++;
                G.gap = Math.max(
                  G.gap,
                  Math.abs(Math.min(vis, 300) - Math.min(t, 300))
                );
              }
            }
          poses.push([
            +sp[0].toFixed(1),
            +sp[2].toFixed(1),
            +(sp[3] + dy).toFixed(2),
            pitch,
            pa,
            pt,
          ]);
        }
    hidden.forEach(h => {
      h.visible = true;
    });
    rt.dispose();
    const top = Object.entries(groups)
      .sort((a, b) => b[1].n - a[1].n)
      .slice(0, 12)
      .map(([k, v]) => ({ where: k, rays: v.n, maxGapM: +v.gap.toFixed(1) }));
    return {
      rays,
      sky,
      impactsInMidAir: air,
      passesThroughVisibleGeometry: through,
      top,
      poses,
    };
  });
  const solid = res.rays - res.sky,
    pct = n => ((n / Math.max(1, solid)) * 100).toFixed(2);
  const pass =
    res.impactsInMidAir / solid < 0.01 &&
    res.passesThroughVisibleGeometry / solid < 0.01;
  if (!pass) bad++;
  console.log(
    `${pass ? 'PASS' : 'FAIL'} L${L} impacts match the drawn geometry: ${res.rays} rays from ${res.poses.length} views, ${res.sky} sky, ${res.impactsInMidAir} in mid air (${pct(res.impactsInMidAir)}%), ${res.passesThroughVisibleGeometry} through geometry (${pct(res.passesThroughVisibleGeometry)}%)`
  );
  for (const t of res.top.slice(0, 6))
    console.log('   ', t.rays, t.where, 'max gap', t.maxGapM, 'm');
  all['L' + L] = res;
}
if (out) {
  fs.mkdirSync(path.dirname(path.resolve(out)), { recursive: true });
  fs.writeFileSync(out, JSON.stringify(all, null, 1));
}
const er = real(errors);
if (er.length) console.log(er.slice(0, 5).join('\n'));
await ctx.close();
srv.close();
process.exit(bad ? 1 : 0);
