/** Run from the repository root: node frontend/scripts/sstc-interface-preview/capture.mjs
 * Requires root Playwright and frontend Vite dependencies. Uses only synthetic fixtures.
 * Set PLAYWRIGHT_CHROMIUM_EXECUTABLE to use an installed Chrome binary if needed.
 */
import { chromium } from 'playwright';
import { createServer } from 'vite';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
const out = fileURLToPath(new URL('../../public/assets/sstc/interface/', import.meta.url));
const server = await createServer({ configFile:fileURLToPath(new URL('./vite.config.mjs',import.meta.url)), server:{port:0} });
await server.listen();
let browser;
try {
  browser = await chromium.launch({headless:true,...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ? {executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE} : {})});
  const page = await browser.newPage({viewport:{width:1000,height:950},deviceScaleFactor:1.5,timezoneId:'America/Denver'});
  await page.clock.setFixedTime(new Date('2026-10-05T18:00:00Z'));
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/*', route => new URL(route.request().url()).hostname === '127.0.0.1' ? route.continue() : route.abort());
  await mkdir(out,{recursive:true});
  const origin = `http://127.0.0.1:${server.httpServer.address().port}`;
  for (const [screen,selector] of [['standings','.leaderboard-row'],['activity','.activity-name-btn'],['weekly','.challenge-card']]) {
    await page.goto(`${origin}/?screen=${screen}`);
    await page.locator(selector).first().waitFor();
    await page.evaluate(() => document.fonts.ready);
    if (errors.length) throw new Error(errors.join('\n'));
    await page.locator('.capture-surface').screenshot({path:`${out}/${screen}.png`});
    console.log(`Captured actual ${screen} component with sample data.`);
  }
} finally {
  await browser?.close();
  await server.close();
}
