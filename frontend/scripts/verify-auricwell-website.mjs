import { chromium } from '../../node_modules/playwright/index.mjs';
import assert from 'node:assert/strict';
const base = process.env.AURICWELL_PREVIEW_URL || 'http://127.0.0.1:5181';
const browser = await chromium.launch({headless:true, channel:'chrome'});
const page = await browser.newPage();
const errors = [], apiRequests = [];
page.on('pageerror', error => errors.push(error.message));
page.on('request', req => { if (new URL(req.url()).pathname.startsWith('/api/')) apiRequests.push(req.url()); });
try {
 for (const width of [1440, 768, 390, 320]) {
  await page.setViewportSize({width,height:1000});
  for (const section of ['', 'product', 'security', 'about', 'contact']) {
   const response = await page.goto(`${base}/auricwell${section ? `/${section}` : ''}`);
   assert.equal(response.status(),200);
   assert.equal(await page.locator('h1').count(),1);
   assert(await page.locator('meta[name=description]').getAttribute('content'));
   assert.equal(await page.locator('a.sign-in').getAttribute('href'),'/auricwell/app/login');
   assert(await page.evaluate(()=>document.documentElement.scrollWidth <= innerWidth), `Overflow at ${width}: ${section}`);
   if (width === 1440 || width === 390) await page.screenshot({path:`/private/tmp/auricwell-website-${section || 'home'}-${width}.png`,fullPage:true});
  }
 }
 assert.equal(apiRequests.length,0,'Public pages must not request clinical or authentication APIs');
 await page.locator('.faq summary').first().click();
 assert(await page.locator('.faq').first().getAttribute('open') !== null);
 assert.match(await page.locator('a[href^="mailto:"]').getAttribute('href'),/^mailto:support@auricwell.com/);
 await page.goto(`${base}/auricwell`);
 await page.keyboard.press('Tab');
 assert.equal(await page.locator(':focus').textContent(),'Skip to content');
 await page.keyboard.press('Enter');
 await page.locator('.mobile-menu summary').click();
 await page.getByRole('navigation',{name:'Mobile navigation',exact:true}).getByRole('link',{name:'Product',exact:true}).click();
 assert.match(page.url(),/\/auricwell\/product$/);
 await page.locator('.sign-in').click();
 await page.getByRole('heading',{name:'A clear place for your clinical work.'}).waitFor();
 assert.equal(await page.getByRole('link',{name:'Continue to secure sign-in'}).getAttribute('href'),'/login?redirect=%2Fauricwell%2Fapp');
 assert.equal(apiRequests.length,0,'The public login landing must not fetch practice data');
 assert.equal(errors.length,0, errors.join('\n'));
 console.log('Website: 20 responsive page checks; navigation, keyboard, contact, login and no clinical requests passed.');
} finally { await browser.close(); }
