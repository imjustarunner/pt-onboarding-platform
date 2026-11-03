// Shared Vue screens and fictional fixtures. Only anonymous analytics may use the backend.
import assert from 'node:assert/strict';
import {mkdirSync} from 'node:fs';
import {chromium} from '../../node_modules/playwright/index.mjs';
import {demoResponse,practice,actor,weekStart} from '../src/auricwell/demo/fixtures.js';
for(const method of ['post','put','patch','delete']) assert.throws(()=>demoResponse('/clinical-notes/drafts',{method}),/nothing was saved/);
assert.throws(()=>demoResponse('/clients',{params:{agencyId:1}}),/outside/);
assert.throws(()=>demoResponse('/clients/1'),/outside/);
assert.throws(()=>demoResponse('/users/1/schedule-summary'),/outside/);
assert.throws(()=>demoResponse('/medical-billing/claimmd/claims/1/draft'),/outside/);
assert.throws(()=>demoResponse('/unknown'),/not included/);
const base=process.env.AURICWELL_DEMO_BASE||'http://127.0.0.1:5181';
const browser=await chromium.launch({channel:'chrome',headless:true});
const page=await browser.newPage({viewport:{width:1440,height:1000},timezoneId:'America/Denver'});
page.setDefaultTimeout(15000);
const errors=[],requests=[],analytics=[];
const screenshots=process.env.AURICWELL_SCREENSHOTS;
if(screenshots)mkdirSync(screenshots,{recursive:true});
const shot=async name=>{if(screenshots)await page.screenshot({path:`${screenshots}/${name}.png`,fullPage:true});};
page.on('pageerror',e=>errors.push(e.message));
await page.route('**/api/**',route=>{const r=route.request(),u=new URL(r.url());if(u.pathname==='/api/public/marketing-pages/auricwell/analytics/events'&&r.method()==='POST'&&!u.search){analytics.push(r.postDataJSON());return route.fulfill({status:204});}requests.push(r.url());return route.abort();});
let visit=0;
const open=async section=>{await page.goto(`${base}/auricwell/demo?verify=${++visit}#/meadowbrook/${section}`);await page.locator('#aw-main').waitFor();};
try {
 await page.route('**/storage-sentinel',r=>r.fulfill({contentType:'text/html',body:'<p>Existing application storage</p>'}));
 await page.goto(`${base}/storage-sentinel`);
 await page.evaluate(()=>{localStorage.setItem('user','{"id":123,"role":"provider"}');sessionStorage.setItem('session-id','existing-session');});
 await open('clients');
 await page.locator('.client-table tbody tr').last().waitFor();
 assert.equal(await page.locator('.client-table tbody tr').count(),16);
 await page.getByRole('button',{name:/My clients/}).click();
 assert.equal(await page.locator('.client-table tbody tr').count(),4);
 await page.getByRole('button',{name:/Practice clients/}).click();
 await page.getByLabel('Find a client').fill('Emerson');
 assert.equal(await page.locator('.client-table tbody tr').count(),1);
 await page.getByLabel('Find a client').fill('');
 await shot('clients-desktop');
 await page.getByRole('link',{name:'Rowan Ellis',exact:true}).hover();
 await page.getByRole('complementary',{name:'Client detail panel'}).waitFor();
 assert.match(await page.getByRole('complementary',{name:'Client detail panel'}).innerText(),/Drew Ellis.*Reese Ellis/s);
 await shot('client-quick-look');
 await page.keyboard.press('Escape');await page.getByRole('complementary',{name:'Client detail panel'}).waitFor({state:'hidden'});
 await page.getByLabel('Find a client').fill('Emerson');
 await page.getByRole('link',{name:'Open chart',exact:false}).click();
 await page.getByRole('heading',{name:'Emerson Cole',exact:true}).waitFor();
 for(const tab of ['Treatment plan','Notes & documents','People & consent','Appointments','Overview']){
  await page.getByRole('tab',{name:tab,exact:true}).click();
  assert(await page.getByRole('tabpanel').isVisible());
 }
 await shot('client-chart-desktop');
 await page.getByRole('link',{name:'Open in Note Workspace',exact:false}).first().click();
 await page.locator('.na-obj-ratings').first().waitFor();
 await open('clients');
 await page.getByLabel('Find a client').fill('Harper Rowan');
 assert.equal(await page.locator('.client-table tbody tr').count(),1);
 await page.getByRole('link',{name:'Open chart',exact:false}).click();
 await page.getByRole('heading',{name:'Harper Rowan',exact:true}).waitFor();
 await page.getByRole('tab',{name:'Notes & documents',exact:true}).click();
 const addedHistory=page.locator('.document-row').filter({hasText:'Prior visit'});
 assert.match(await addedHistory.getAttribute('href'),/noteId=991171/);
 await addedHistory.click();
 const signedHistory=page.locator('.na-output--signed-view');
 await signedHistory.getByRole('heading',{name:'Finalized note',exact:true}).waitFor();
 await signedHistory.getByText('The client described declining an extra commitment and using that time for a restorative walk.',{exact:false}).waitFor();
 await shot('added-client-signed-history');
 await open('providers');
 assert.equal(await page.locator('.staff-card').count(),4);
 for(const img of await page.locator('.staff-card img').all())await img.evaluate(i=>i.decode());
 await page.locator('.staff-card').filter({hasText:'Milo Chen'}).click();
 const profile=page.getByRole('region',{name:'Provider profile'});await profile.waitFor();
 for(const tab of ['Caseload','Schedule','Documentation','Credentials','Plotline','Overview']){
  await profile.getByRole('tab',{name:tab,exact:true}).click();
  assert(await profile.getByRole('tabpanel').isVisible());
 }
 await profile.getByRole('tab',{name:'Plotline',exact:true}).click();
 await profile.locator('.plotline-logo').evaluate(i=>i.decode());
 await shot('provider-plotline');
 await page.locator('.staff-card').filter({hasText:'Tessa Brooks'}).click();
 await profile.getByRole('tab',{name:'Documentation',exact:true}).click();
 assert.equal(await profile.locator('.profile-note-row').count(),2);
 await shot('supervisor-profile');
 await page.getByRole('button',{name:/Show all staff/}).click();
 assert.equal(await page.locator('.staff-card').count(),6);
 for(const [person,tab] of [['Quinn Parker','Responsibilities'],['Riley Hayes','Practice access']]){
  await page.locator('.staff-card').filter({hasText:person}).click();
  await page.getByRole('tab',{name:tab,exact:true}).click();
  assert(await page.getByRole('tabpanel').isVisible());
 }
 await shot('support-staff');
 await open('appointments');
 await page.getByText('E.C. · Individual therapy',{exact:false}).first().waitFor();
 assert.match(await page.locator('.sched-wrap').innerText(),/Confirmed/);
 await page.getByRole('button',{name:'Book session',exact:true}).click();
 const booking=page.getByRole('dialog').last();await booking.waitFor();
 await booking.getByLabel('Appointment date',{exact:true}).fill(weekStart);
 await booking.locator('input[type=time]').nth(0).fill('10:00');await booking.locator('input[type=time]').nth(1).fill('10:50');
 await booking.locator('select').filter({has:page.locator('option[value="90834"]')}).first().selectOption('90834');
 await booking.locator('select').filter({has:page.locator('option[value="990121"]')}).first().selectOption('990121');
 await booking.getByRole('button',{name:'Schedule & link video room',exact:true}).click();
 await page.locator('.aw-demo-notice').waitFor();
 assert.match(await page.locator('.aw-demo-notice').innerText(),/nothing was saved/);
 await open('billing');
 await page.getByRole('button',{name:'DEMO-101',exact:true}).click();
 const claim=page.getByRole('dialog');await claim.getByText('Fictional claim prepared for review.',{exact:false}).waitFor();
 await claim.getByRole('button',{name:'Edit billing fields',exact:true}).click();
 await claim.getByRole('button',{name:'Save for review',exact:true}).waitFor();
 await claim.getByRole('button',{name:'Review for submission',exact:true}).click();
 await claim.getByText('Demo only: clearinghouse and payer enrollment are not connected.',{exact:true}).waitFor();
 assert(await claim.getByRole('button',{name:/Approve and submit/}).isDisabled());
 console.log('Rich client/chart, quick-look, all provider/staff tabs, Plotline, calendar and claim interactions passed.');
 for(const width of [1440,768,390,320]) {
  await page.setViewportSize({width,height:1000});
  for(const section of ['overview','providers','clients','appointments','documentation','billing']) {
   await open(section);await page.waitForTimeout(250);
   assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`${section} overflows at ${width}`);
   if(width===390&&['clients','providers','documentation'].includes(section))await shot(`${section}-phone`);
  }
 }
 await page.goto(`${base}/auricwell/demo#/another-practice/clients`);
 await page.getByRole('heading',{name:/Good .*Avery/}).waitFor();
 assert.match(page.url(),/#\/meadowbrook/);
 await page.goto(`${base}/auricwell/product`);
 await page.locator('[data-actual-example=workspace]').getByRole('button',{name:'Explore here',exact:true}).click();
 const embedded=page.frameLocator('iframe[title="Interactive AuricWell EHR demo"]');
 await embedded.locator('.sched-wrap').waitFor();
 const embeddedMenu=embedded.getByRole('button',{name:'Open navigation',exact:true});
 if(await embeddedMenu.isVisible())await embeddedMenu.click();
 await embedded.getByRole('navigation',{name:'Practice navigation'}).getByRole('link',{name:'Providers',exact:true}).click();
 await embedded.locator('.staff-card').filter({hasText:'Avery Lane'}).click();
 await embedded.getByRole('region',{name:'Provider profile'}).waitFor();
 assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'Embedded preview must fit mobile');
 await page.goto(`${base}/storage-sentinel`);
 assert.equal(analytics.length,0,'Existing signed-in storage excludes tracking');
 assert.deepEqual(await page.evaluate(()=>({user:localStorage.getItem('user'),session:sessionStorage.getItem('session-id')})),{user:'{"id":123,"role":"provider"}',session:'existing-session'});
 assert.deepEqual(errors,[]);assert.deepEqual(requests,[],'Demo must make zero backend requests');
 console.log('Passed: 320–1440px layouts, unknown-practice guard, write rejection, zero clinical backend requests, analytics exclusion for signed-in viewers, and account storage isolation.');
} catch(error) {console.error({errors,requests,url:page.url(),text:(await page.locator('body').innerText()).slice(-3500)});throw error;} finally {await browser.close();}
