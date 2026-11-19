// One pass per level in a windowed Chromium with the browser's own pointer lock (no simulated lock).
// A headless browser grants no lock, so scripted tests pass with handlers that a person's first
// click can still break. This is the last test before a hand-over, and the only one with a window.
//
// Usage: node scripts/capture/headed.mjs <levels=1> [deploy-query="m=deploy&q=high&splash=0"]
//   node scripts/capture/headed.mjs 1,2,3
//
// Per level: click the deploy button, check that the browser grants the lock to the canvas, turn
// the view with locked mouse movement, walk, fire, lose the lock (pause must open), resume.
// Page contract on top of lib.mjs: __g.game.state ('play'), .player { yaw, pitch, pos },
// .weapon.ammo. Selectors through the environment: DEPLOY_SEL (#bDeploy), RESUME_SEL (#bResume),
// PAUSE_SEL (#pause, class "on" when shown).
// The window is opened by this script and closed at the end. On macOS a locked screen makes the
// browser refuse the lock ("WrongDocumentError"): the script reads the session flag first and
// stops, so the report can say that the pass is still open instead of counting 20 false failures.
import { serve, chromium, GPU_ARGS, profile, BROWSER } from './lib.mjs';
import { execSync } from 'node:child_process';
const levels = (process.argv[2] || '1').split(',').map(Number);
const dq = process.argv[3] || 'm=deploy&q=high&splash=0';
const DEPLOY = process.env.DEPLOY_SEL || '#bDeploy',
  RESUME = process.env.RESUME_SEL || '#bResume',
  PAUSE = process.env.PAUSE_SEL || '#pause';
if (process.platform === 'darwin') {
  let locked = false;
  try {
    locked = /CGSSessionScreenIsLocked"?\s*=\s*Yes/.test(
      execSync('ioreg -n Root -d1', { encoding: 'utf8' })
    );
  } catch (e) {}
  if (locked && !process.env.HEADED_ANYWAY) {
    console.log(
      'SKIPPED the screen is locked: the browser refuses pointer lock under a locked screen. Unlock and run again (HEADED_ANYWAY=1 forces the pass). The real pointer lock is NOT tested.'
    );
    process.exit(3);
  }
}
const { srv, url } = await serve();
const ctx = await chromium.launchPersistentContext(profile('headed'), {
  headless: false,
  ...BROWSER,
  viewport: { width: 1280, height: 720 },
  args: [...GPU_ARGS, '--window-size=1300,820', '--window-position=40,40'],
});
const page = ctx.pages()[0] || (await ctx.newPage());
const errors = [];
page.on('pageerror', e => errors.push(e.message));
let pass = 0,
  fail = 0;
const ok = (n, v, extra = '') => {
  v ? pass++ : fail++;
  console.log((v ? 'PASS ' : 'FAIL ') + n + (extra ? '  ' + extra : ''));
};
const st = () =>
  page.evaluate(PAUSE => {
    const g = __g.game,
      p = g.player,
      pz = document.querySelector(PAUSE);
    return {
      state: g.state,
      yaw: p.yaw,
      pitch: p.pitch,
      x: p.pos.x,
      z: p.pos.z,
      locked: document.pointerLockElement === document.querySelector('canvas'),
      pause: !!pz && pz.classList.contains('on'),
      ammo: g.weapon.ammo,
    };
  }, PAUSE);
for (const L of levels) {
  await page.goto(url + `?level=${L}&${dq}`);
  await page.waitForFunction(() => window.__g && window.__g.ready, null, {
    timeout: 120000,
  });
  await page.waitForTimeout(600);
  await page.bringToFront();
  await page.evaluate(() => {
    window.__ple = [];
    document.addEventListener('pointerlockerror', () =>
      __ple.push('pointerlockerror')
    );
    const c = document.querySelector('canvas'),
      o = c.requestPointerLock.bind(c);
    c.requestPointerLock = (...a) => {
      let r;
      try {
        r = o(...a);
        if (r && r.catch) r.catch(e => __ple.push(String(e)));
      } catch (e) {
        __ple.push(String(e));
      }
      return r;
    };
  });
  await page.click(DEPLOY);
  await page.waitForTimeout(1200);
  let s = await st();
  console.log(
    'INFO focus=' +
      (await page.evaluate(
        () =>
          document.hasFocus() +
          ' visibility=' +
          document.visibilityState +
          ' errors=' +
          JSON.stringify(__ple)
      ))
  );
  ok(
    `L${L} browser grants pointer lock on deploy`,
    s.locked && s.state === 'play',
    `state=${s.state}`
  );
  const y0 = s.yaw,
    p0 = s.pitch;
  await page.mouse.move(640, 360);
  for (let i = 1; i <= 20; i++) {
    await page.mouse.move(640 + i * 12, 360 + i * 3);
    await page.waitForTimeout(16);
  }
  await page.waitForTimeout(200);
  s = await st();
  ok(
    `L${L} locked mouse movement turns the view`,
    Math.abs(s.yaw - y0) > 0.05,
    `dyaw=${(s.yaw - y0).toFixed(3)} dpitch=${(s.pitch - p0).toFixed(3)}`
  );
  const x0 = s.x,
    z0 = s.z;
  await page.keyboard.down('KeyW');
  await page.waitForTimeout(700);
  await page.keyboard.up('KeyW');
  s = await st();
  ok(
    `L${L} W walks`,
    Math.hypot(s.x - x0, s.z - z0) > 0.5,
    `moved ${Math.hypot(s.x - x0, s.z - z0).toFixed(2)} m`
  );
  const a0 = s.ammo;
  await page.mouse.down();
  await page.waitForTimeout(350);
  await page.mouse.up();
  await page.waitForTimeout(150);
  s = await st();
  ok(`L${L} left button fires`, s.ammo < a0, `${a0} to ${s.ammo}`);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(500);
  s = await st();
  let how = 'Escape key';
  if (s.locked) {
    await page.evaluate(() => document.exitPointerLock());
    await page.waitForTimeout(500);
    s = await st();
    how =
      'exitPointerLock (the scripted Escape key does not reach the browser lock)';
  }
  ok(`L${L} losing the lock opens the pause menu`, !s.locked && s.pause, how);
  try {
    await page.click(RESUME, { timeout: 4000 });
  } catch (e) {
    console.log('INFO resume button not shown');
  }
  await page.waitForTimeout(900);
  s = await st();
  ok(
    `L${L} resume takes the lock again`,
    s.locked && !s.pause && s.state === 'play'
  );
  await page.evaluate(() => document.exitPointerLock());
  await page.waitForTimeout(200);
}
console.log(`TOTAL ${pass} passed, ${fail} failed`);
if (errors.length)
  console.log('page errors: ' + errors.slice(0, 5).join(' | '));
await ctx.close();
srv.close();
process.exit(fail ? 1 : 0);
