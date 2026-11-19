// Real-time frame rate at fixed camera poses, one line per pose.
//
// Usage: node scripts/capture/perf.mjs <tag> <level> [quality=high] [pose;pose;...] [extra-query]
//   node scripts/capture/perf.mjs L2 2
//   GAME_DIST=versions/v1/dist node scripts/capture/perf.mjs REF 1 high "0.3,0,62,0,0.03;12,1,-40,1.4,0"
//
// Poses come from __g.game.mod.poses (x, y, z, yaw, pitch) unless given. At each pose the page
// runs 480 frames through requestAnimationFrame with vsync off; the first 180 are dropped (shader
// compilation). Prints "<tag> <quality> <pose> {json}" with mean and median frame time, the
// 95th percentile, draw calls and triangles. One run is not a result: use perfround.sh for three
// rounds with a reference build and perftable.py for the table. Nothing else may use the GPU
// meanwhile (a video encode on all cores moved single poses by 10 to 20 fps).
import { serve, launch, open } from './lib.mjs';
const [tag = 'L1', L = '1', q = 'high', poseArg = '', extraArg = ''] =
  process.argv.slice(2);
// the extra query is joined with '&' whether or not it starts with one
const extra = extraArg ? '&' + extraArg.replace(/^&/, '') : '';
const { srv, url } = await serve();
const { ctx, page } = await launch(1920, 1080, 'perf');
let poses = poseArg ? poseArg.split(';') : null;
if (!poses) {
  await open(page, url, `level=${L}&capture=1&q=${q}`);
  poses = await page.evaluate(() => {
    const m = __g.game && __g.game.mod;
    return m && m.poses ? m.poses.map(p => p.join(',')) : null;
  });
}
if (!poses) {
  console.error(
    'the page exposes no __g.game.mod.poses: give the poses as "x,y,z,yaw,pitch;x,y,z,yaw,pitch"'
  );
  await ctx.close();
  srv.close();
  process.exit(2);
}
for (const p of poses) {
  await open(page, url, `level=${L}&pose=${p}&capture=1&q=${q}${extra}`);
  const r = await page.evaluate(
    () =>
      new Promise(res => {
        const g = __g;
        let n = 0;
        const ts = [];
        let last = performance.now();
        // draw calls and triangles of one whole frame, every pass included (info resets per render call otherwise)
        const count = () => {
          const I = g.eng.renderer.info;
          I.autoReset = false;
          I.reset();
          g.advance(1);
          const c = { calls: I.render.calls, tris: I.render.triangles };
          I.autoReset = true;
          return c;
        };
        const f = () => {
          g.advance(1);
          const now = performance.now();
          ts.push(now - last);
          last = now;
          if (++n < 480) requestAnimationFrame(f);
          else {
            ts.splice(0, 180);
            ts.sort((a, b) => a - b);
            const avg = ts.reduce((a, b) => a + b, 0) / ts.length;
            const med = ts[Math.floor(ts.length / 2)];
            res({
              avgMs: +avg.toFixed(2),
              fps: +(1000 / avg).toFixed(1),
              medMs: +med.toFixed(2),
              medFps: +(1000 / med).toFixed(1),
              p95Ms: +ts[Math.floor(ts.length * 0.95)].toFixed(2),
              ...count(),
            });
          }
        };
        requestAnimationFrame(f);
      })
  );
  console.log(tag, q, p, JSON.stringify(r));
}
await ctx.close();
srv.close();
