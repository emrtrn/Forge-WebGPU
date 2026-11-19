// Full-size stills of a deterministic pass or of a fixed pose: the "ours" half of every pair.
//
// Usage: node scripts/capture/shot.mjs <out-dir> <query> <t1,t2,...> [width=1920] [height=1080]
//   node scripts/capture/shot.mjs out/look/l2_3 "level=2&demo=1" 4,11.5,23
//   node scripts/capture/shot.mjs out/look/l2_3 "level=2&pose=0,0,17.5,-0.2,0.02&nofog=1" 0.5
//
// Times are seconds of game time. The simulation is stepped without drawing between them, so a
// still at 23 s costs seconds, and the same query with one switch changed gives the before and
// after of one change. Environment: see lib.mjs.
import { serve, launch, open, real } from './lib.mjs';
import fs from 'node:fs';
import path from 'node:path';
const [out, query, times, W = 1920, H = 1080] = process.argv.slice(2);
if (!out || !query || !times) {
  console.error(
    'usage: node shot.mjs <out-dir> <query> <t1,t2,...> [width] [height]'
  );
  process.exit(2);
}
fs.mkdirSync(out, { recursive: true });
const { srv, url } = await serve();
const { ctx, page, errors } = await launch(+W, +H, 'shot');
try {
  await open(page, url, query + '&capture=1');
} catch (e) {
  console.log('OPEN FAILED', e.message);
  console.log(errors.slice(0, 12).join('\n'));
  await ctx.close();
  srv.close();
  process.exit(1);
}
let tick = 0;
for (const t of times.split(',').map(Number)) {
  const n = Math.round(t * 60) - tick;
  if (n > 0) {
    for (let k = 0; k < n; k += 30)
      await page.evaluate(m => __g.advance(m, false), Math.min(30, n - k));
    tick += n;
  }
  await page.evaluate(() => __g.advance(1));
  tick++;
  const f = path.join(out, `t${String(t).replace('.', '_')}.jpg`);
  await page.screenshot({ path: f, type: 'jpeg', quality: 92 });
  console.log('wrote', f);
}
const er = real(errors);
if (er.length) console.log(er.slice(0, 10).join('\n'));
await ctx.close();
srv.close();
