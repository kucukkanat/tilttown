// Smoke test: builds, serves dist/, loads the game twice (fresh town, then from the autosave)
// and fails on any page error or console error. Usage: npm run smoke [-- --dev]
import {spawn, execSync} from 'node:child_process';
import {chromium} from 'playwright';

const dev = process.argv.includes('--dev'), port = 4319;
if (!dev) execSync('npx vite build', {stdio: 'inherit'});
const srv = spawn('npx', ['vite', dev ? '' : 'preview', '--port', port, '--strictPort'].filter(Boolean), {stdio: 'ignore'});
const url = `http://localhost:${port}/`;
for (let i = 0; ; i++) { try { await fetch(url); break; } catch { if (i > 50) throw new Error('server did not start'); await new Promise(r => setTimeout(r, 200)); } }

const errors = [];
const browser = await chromium.launch({args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader']});
try {
  const page = await browser.newPage({viewport: {width: 1100, height: 760}});
  page.on('pageerror', e => errors.push('pageerror: ' + (e.stack || e.message)));
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  for (const run of ['fresh', 'reload']) {
    if (run === 'fresh') await page.goto(url); else await page.reload();
    await page.waitForFunction(() => window.__g2 && window.__g2.cells().length > 0, null, {timeout: 30000});
    await page.waitForTimeout(4000); // let a few seconds of simulation and rendering run
    const s = await page.evaluate(() => ({cells: __g2.cells().length, shops: __g2.biz().length, people: __own.cit().length, time: __life.sim(120)}));
    console.log(run, JSON.stringify(s));
    if (!s.people) errors.push(run + ': no citizens spawned');
    await page.evaluate(() => dispatchEvent(new Event('pagehide'))); // force an autosave for the reload run
  }
} finally { await browser.close(); srv.kill(); }
if (errors.length) { console.error('FAIL\n' + errors.join('\n')); process.exit(1); }
console.log('OK');
