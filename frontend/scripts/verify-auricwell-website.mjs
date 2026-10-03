import { chromium } from '../../node_modules/playwright/index.mjs';
import assert from 'node:assert/strict';
const base = process.env.AURICWELL_PREVIEW_URL || 'http://127.0.0.1:5181';
const browser = await chromium.launch({headless:true, channel:'chrome'});
const page = await browser.newPage();
const errors = [], apiRequests = [];
page.on('pageerror', error => errors.push(error.message));
page.on('request', req => { if (new URL(req.url()).pathname.startsWith('/api/')) apiRequests.push(req.url()); });
try {
 const legacy = await page.request.get(`${base}/auricwell/innerstrength/clients?clientId=71`, {maxRedirects:0});
 assert([301,302].includes(legacy.status()));
 const destination = new URL(legacy.headers().location, base);
 assert.equal(destination.origin, new URL(base).origin, 'Redirect must retain the external scheme and port');
 assert.equal(destination.pathname, '/auricwell/app/innerstrength/clients');
 assert.equal(destination.search, '?clientId=71');
 for (const width of [2560, 1920, 1440, 768, 390, 320]) {
  await page.setViewportSize({width,height:1000});
  for (const section of ['', 'product', 'security', 'about', 'contact']) {
   const response = await page.goto(`${base}/auricwell${section ? `/${section}` : ''}`);
   assert.equal(response.status(),200);
   assert.equal(await page.locator('h1').count(),1);
   assert(!/TherapyNotes/i.test(await page.locator('main').innerText()), 'Transitions must refer to the current EHR');
   assert.equal(Math.round((await page.locator('main').boundingBox()).width), width, 'Main should fill the viewport');
   assert(await page.locator('meta[name=description]').getAttribute('content'));
   assert.equal(await page.locator('a.sign-in').getAttribute('href'),'/auricwell/app/login');
   assert(await page.evaluate(()=>document.documentElement.scrollWidth <= innerWidth), `Overflow at ${width}: ${section}`);
   if (width === 1440 || width === 390) await page.screenshot({path:`/private/tmp/auricwell-website-${section || 'home'}-${width}.png`,fullPage:true});
  }
 }
 for (const width of [1920,320]) {
  await page.setViewportSize({width,height:1000});
  await page.goto(`${base}/auricwell/product`);
  const providerDemo = page.locator('[data-actual-example=providers]');
  await providerDemo.locator('.provider-card').first().waitFor();
  assert.equal(await providerDemo.locator('.provider-card').count(),2);
  await providerDemo.locator('button.slot-chip').first().focus();
  await page.keyboard.press('Enter');
  assert.match(await providerDemo.getByRole('status').innerText(), /Avery Lane/);
  assert.match(await providerDemo.getByRole('status').innerText(), /no hold or appointment was created/);
  await providerDemo.locator('.provider-card').nth(1).getByRole('button',{name:'View availability'}).click();
  assert.match(await providerDemo.getByRole('status').innerText(), /Jordan Reed selected/);
  const goalDemo = page.locator('[data-actual-example=goals]');
  await goalDemo.getByRole('button',{name:'6',exact:true}).click();
  assert.match(await goalDemo.locator('.actual-example-actions').innerText(), /Nothing was saved/);
  await goalDemo.getByRole('button',{name:'Reset example'}).click();
  await goalDemo.getByRole('button',{name:'Client',exact:true}).click();
  assert.equal((await goalDemo.locator('.na-scale-btn.prev').textContent()).trim(),'4');
  assert.equal(await page.locator('img[src="/auricwell/examples/practice-notes.png"]').count(),1);
  assert.equal(await page.locator('img[src="/auricwell/examples/note-editor.png"]').count(),1);
  assert(await page.locator('.app-screenshot img').first().evaluate(img=>img.complete && img.naturalWidth>0));
  assert.equal(await page.locator('.plan-card').count(),3);
  await page.screenshot({path:`/private/tmp/auricwell-feature-product-${width}.png`,fullPage:true});
 }
 await page.goto(`${base}/auricwell/contact`);
 assert.equal(apiRequests.length,0,'Public pages and examples must not request clinical or authentication APIs');
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
 console.log('Website: 30 full-width responsive page checks; actual provider and goal components, screenshots, keyboard, plan comparison, contact, login and no clinical requests passed.');
} finally { await browser.close(); }
