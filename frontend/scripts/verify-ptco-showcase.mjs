import {chromium} from '../../node_modules/playwright/index.mjs';
import assert from 'node:assert/strict';
const base=process.env.PTCO_PREVIEW_URL || 'http://127.0.0.1:5181';
const live=Boolean(process.env.PTCO_PREVIEW_URL);
const prefix=live ? '' : '/p/ptco';
const browser=await chromium.launch({channel:'chrome',headless:true});
const page=await browser.newPage({viewport:{width:1440,height:1000}});
const errors=[],privateRequests=[],writes=[];
page.on('pageerror',e=>errors.push(e.message));
await page.route('**/api/**',async route=>{
 const req=route.request(),p=new URL(req.url()).pathname;
 // Never submit inquiries, messages, bookings or synthetic analytics on the live site.
 if(req.method()!=='GET') {writes.push(p);return route.fulfill({status:403,contentType:'application/json',body:'{"error":{"message":"Browser verification is read-only"}}'});}
 // Allow the existing public host lookup and branding preload, plus the anonymous session check.
 if(!p.startsWith('/api/public/') && !['/api/users/me','/api/platform-branding','/api/agencies/resolve','/api/uploads/assets/ptco/logo-flat.webp'].includes(p))privateRequests.push(p);
 if(live)return route.continue();
 let data={};
 if(p.endsWith('/public/marketing-pages/ptco'))data={page:{slug:'ptco',title:'Plot Twist Co.',branding:{landingTemplate:'ptco'},providerDirectories:[]}};
 else if(p.endsWith('/public/marketing-pages/partners'))data={partners:[]};
 else if(p==='/api/platform-branding')data={organization_name:'Plot Twist Co.'};
 else if(p==='/api/users/me')return route.fulfill({status:401,contentType:'application/json',body:'{"error":{"message":"Not signed in"}}'});
 else data={items:[],resources:[],categories:[]};
 return route.fulfill({contentType:'application/json',body:JSON.stringify(data)});
});
async function visit(section=''){await page.goto(`${base}${prefix}${section ? '/'+section : '/'}`);await page.locator('.ptco-hero h1').waitFor();}
async function noOverflow(label){assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),label);}
try {
 for(const width of [1920,1440,768,390,320]) {
  await page.setViewportSize({width,height:1000});
  for(const section of ['', 'hq', 'contact', 'start']) {
   await visit(section);
   assert.equal(await page.locator('h1').count(),1);
   await noOverflow(`${section || 'home'} overflows at ${width}`);
   assert.equal(await page.locator('.ptco-header-portal').getAttribute('href'),'https://app.plottwistco.com/login');
   if(section==='hq') {
    assert.equal(await page.locator('.comparison-table tbody tr').count(),6);
    assert.match(await page.locator('.comparison-table thead').innerText(), /Plot Twist HQ[\s\S]*TherapyNotes[\s\S]*SimplePractice/);
    assert(!/administrator preview/.test(await page.locator('#comparison-context').innerText()));
    assert.equal(await page.locator('#faq details').count(),13);
    assert.equal(await page.locator('.plan-card').count(),3);
    assert.match(await page.locator('#hq-walkthrough').innerText(), /People & operations/);
   }
   if(section==='')assert.equal(await page.locator('#faq details').count(),4);
   if(section==='contact')assert.equal(await page.locator('#faq details').count(),13);
  }
 }
 for(const width of [1440,320]) {
  await page.setViewportSize({width,height:1000});await visit('hq');
  const providers=page.locator('[data-ptco-example=providers]');
  await providers.scrollIntoViewIfNeeded();
  await providers.locator('.provider-card img').evaluateAll(images=>Promise.all(images.map(img=>img.decode())));
  await providers.locator('.provider-card').nth(1).getByRole('button',{name:'View availability'}).click();
  assert.equal(await providers.locator('.showcase-detail h3').first().innerText(),'Jordan Reed');
  await providers.locator('.opening-day button').first().click();
  assert.match(await providers.getByRole('status').innerText(),/no hold or appointment was created/);
  await providers.getByRole('button',{name:'Clear selection'}).click();
  const schedule=page.locator('[data-ptco-example=schedule]');
  await schedule.getByRole('button',{name:'Book a session',exact:true}).click();
  await schedule.locator('img').evaluate(img=>img.decode());
  assert.match(await schedule.locator('img').getAttribute('src'),/schedule-booking/);
  await page.getByRole('button',{name:'Guided note editor',exact:true}).click();
  await page.locator('.ptco-note-gallery img').evaluate(img=>img.decode());
  assert.match(await page.locator('.ptco-note-gallery img').getAttribute('src'),/note-editor/);
  const goals=page.locator('[data-ptco-example=goals]');
  await goals.getByRole('button',{name:'6',exact:true}).click();
  assert.match(await goals.locator('.actual-example-actions').innerText(),/Nothing was saved/);
  await goals.getByRole('button',{name:'Reset example',exact:true}).click();
  const kiosk=page.locator('[data-ptco-example=kiosk]');
  await kiosk.locator('.device-header img').evaluate(img=>img.decode());
  assert.match(await kiosk.locator('.device-header').innerText(),/Plot Twist HQ/);
  await kiosk.locator('.provider-card .choose').focus();await page.keyboard.press('Enter');
  assert(await kiosk.getByRole('button',{name:'I’m here · Check in'}).isDisabled());
  await kiosk.getByLabel('I’m answering for my dependent',{exact:true}).check();
  await kiosk.getByRole('button',{name:'I’m here · Check in'}).click();
  assert.match(await kiosk.locator('.app-alert').innerText(),/Guardian report/);
  assert.match(await kiosk.locator('.demo-local').innerText(),/no notification was sent/);
  await kiosk.getByRole('button',{name:'Got it · I’ll meet them'}).click();
  await kiosk.getByRole('button',{name:'Email',exact:true}).click();
  assert.match(await kiosk.locator('.email-example').innerText(),/Suppressed in this example/);
  assert.match(await kiosk.locator('.email-body').innerText(),/Plot Twist HQ/);
  await kiosk.getByRole('button',{name:'Provider SMS',exact:true}).click();
  assert.match(await kiosk.locator('.sms-bubble').innerText(),/Plot Twist HQ/);
  assert.match(await kiosk.locator('.sms-example').innerText(),/not active in the current office-kiosk flow/);
  await noOverflow(`SMS preview overflows at ${width}`);
  await kiosk.getByRole('button',{name:'Reset example'}).click();
  const faq=page.locator('#faq summary').filter({hasText:'Can clients confirm appointments by text?'});
  await faq.focus();await page.keyboard.press('Enter');
  assert.match(await page.locator('#faq details[open]').innerText(),/Plot Twist HQ setup/);
  const sourceLinks=await page.locator('.comparison-source').evaluateAll(links=>links.map(a=>a.href));
  assert.equal(sourceLinks.length,11);
  assert(sourceLinks.every(url=>['support.simplepractice.com','support.therapynotes.com'].includes(new URL(url).hostname)));
  await page.locator('#kiosk').screenshot({path:`/private/tmp/ptco-kiosk-${width}.png`});
  await page.locator('#compare').screenshot({path:`/private/tmp/ptco-compare-${width}.png`});
 }
 await visit();
 const link=page.locator('.ptco-showcase-links').getByRole('link',{name:/A connected arrival/});
 await link.click();
 await page.waitForURL('**/hq#kiosk');
 await page.waitForFunction(()=>{const el=document.querySelector('#kiosk');return el && el.getBoundingClientRect().top>=-1 && el.getBoundingClientRect().top<250;});
 await page.reload();await page.locator('#kiosk').waitFor();
 await page.waitForFunction(()=>document.querySelector('#kiosk').getBoundingClientRect().top<250);
 assert.deepEqual(privateRequests,[],'Examples must not fetch clinical records');
 assert.deepEqual(writes.filter(p=>!p.includes('analytics')&&!p.includes('track')),[],'Examples must not submit any workflow actions');
 assert.deepEqual(errors,[]);
 console.log('PlotTwistCo: 20 responsive pages; shared provider/calendar/notes/goals/kiosk examples, branded notifications, source links, FAQs, plans, keyboard and deep links passed. No clinical requests or workflow writes.');
} finally {await browser.close();}
