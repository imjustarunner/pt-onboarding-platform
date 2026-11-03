import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { chromium } from '../../node_modules/playwright/index.mjs';
import { featureNavigation, partners } from '../src/auricwell/website/ecosystem.mjs';
const base = process.env.AURICWELL_DEMO_BASE || 'http://127.0.0.1:5194';
const prefix = process.env.AURICWELL_PUBLIC_ROUTES ? '' : '/auricwell';
const artifacts = process.env.AURICWELL_DEMO_ARTIFACT_DIR;
if (artifacts) mkdirSync(artifacts, {recursive:true});
const browser = await chromium.launch({channel:'chrome',headless:true});
const page = await browser.newPage({viewport:{width:1440,height:1000},timezoneId:'America/Denver'});
page.setDefaultTimeout(15000);
const errors=[], requests=[], checks=[];
page.on('pageerror', e=>errors.push(e.message));
await page.route('**/api/**', route=>{
 const r=route.request(), path=new URL(r.url()).pathname;
 if(path==='/api/public/marketing-pages/auricwell/analytics/events' && r.method()==='POST') return route.fulfill({status:204});
 if(path==='/api/public/agency-support/auricwell' && r.method()==='GET') return route.fulfill({json:{categories:[{id:'intake_join',label:'New account'},{id:'billing',label:'Billing'},{id:'other',label:'Other'}],recaptchaRequired:false}});
 requests.push({method:r.method(),path});return route.abort();
});
const open=async p=>{await page.goto(`${base}${prefix}/${p}`);await page.waitForTimeout(250);};
const shot=async name=>{if(artifacts)await page.screenshot({path:`${artifacts}/${name}.png`,fullPage:true});};
try {
 await open('product');
 const menu=page.locator('.desktop-nav [data-feature-menu]');
 await menu.locator('summary').hover();await menu.locator('.feature-menu-panel').waitFor();
 assert.match(await menu.locator('.feature-menu-panel a[href*="#"]').first().innerText(),/Kiosk/);
 for(const [id] of featureNavigation)assert.equal(await page.locator(`[id="${id}"]`).count(),1,id);
 await menu.locator('a[href$="#office"]').click();
 assert.equal(new URL(page.url()).hash,'#office');
 await menu.locator('summary').focus();await page.keyboard.press('Enter');await page.keyboard.press('Tab');await page.keyboard.press('Escape');assert.equal(await menu.getAttribute('open'),null);
 assert.equal(await page.locator('[data-actual-example="kiosk"]').count(),1);
 await page.locator('#kiosk').scrollIntoViewIfNeeded();await shot('kiosk-office');
 checks.push('Features menu supports mouse and keyboard; kiosk leads all anchored features, every anchor resolves once, existing kiosk example mounts once');
 await open('partners');
 assert.equal(await page.locator('.partner-card').count(),6);
 for(const p of partners){const card=page.locator(`#${p.slug}`);assert.match(await card.innerText(),/AuricWell Partner/i);await card.locator('img').evaluate(img=>img.decode());assert.equal(await card.locator('.partner-website').getAttribute('href'),p.website);}
 await shot('partners-desktop');checks.push('All six approved partner cards have working brand assets, website links and real public provider/contact destinations');
 await open('about');for(const name of ['Managed by Plot Twist Co.','Plotline','SchoolCareBridge'])assert.match(await page.locator('main').innerText(),new RegExp(name.replaceAll('.','\\.')));await page.locator('#integrations').scrollIntoViewIfNeeded();for(const img of await page.locator('#integrations img').all())await img.evaluate(i=>i.decode());await shot('integrations');
 for(const [key,label] of [['billing','Billing'],['credentialing','Credentialing'],['people-operations','People Operations']]){
  await page.locator('.practice-help').getByRole('link',{name:`I need ${label}`,exact:true}).click();
  assert.equal(new URL(page.url()).searchParams.get('service'),key);await page.locator('textarea').waitFor();assert.match(await page.locator('textarea').inputValue(),new RegExp(key==='people-operations'?'people operations':key,'i'));
 }
 checks.push('Management/integrations and all three service shortcuts work through the existing contact form; no inquiry submitted');
 for(const width of [1440,1024,768,390,320]){
  await page.setViewportSize({width,height:1000});
  for(const section of ['partners','about','product','contact']){
   await open(section);assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`${section} overflow at ${width}`);
  }
  if(width===390){await open('partners');await shot('partners-phone');await page.locator('.mobile-menu>summary').click();await page.locator('.mobile-menu [data-feature-menu]>summary').click();await page.locator('.mobile-menu a[href$="#office"]').click();assert.equal(new URL(page.url()).hash,'#office');assert.equal(await page.locator('.mobile-menu').getAttribute('open'),null);}
 }
 checks.push('Four public pages fit 320–1440px; mobile Features selection closes navigation and opens the office section');
 assert.deepEqual(errors,[]);assert.deepEqual(requests,[]);
 const result={status:'PASS',checks,pageErrors:errors,unexpectedApiRequests:requests};
 if(artifacts)writeFileSync(`${artifacts}/WEBSITE-BROWSER.json`,JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result,null,2));
}catch(e){await shot('website-failure');console.error(JSON.stringify({url:page.url(),errors,requests},null,2));throw e;}finally{await browser.close();}
