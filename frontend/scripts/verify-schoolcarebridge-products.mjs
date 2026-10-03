// Public demo is repository-seeded; never permit a live mutation while verifying it.
import assert from 'node:assert/strict';
import {chromium} from '../../node_modules/playwright/index.mjs';
const base=process.env.SCB_PRODUCT_BASE||'http://127.0.0.1:5181';
const browser=await chromium.launch({channel:'chrome',headless:true});
const context=await browser.newContext({viewport:{width:1440,height:1000}});
const page=await context.newPage();
const errors=[],requests=[];
page.on('pageerror',error=>errors.push(error.message));
await page.route('**/api/**',route=>{requests.push(route.request().url());return route.abort();});
async function demo(query='') {
 console.log('Demo:',query||'home');
 await page.goto(`${base}/schoolcarebridge/demo${query}`);
 await page.locator('.scb-demo-switch').waitFor();
}
async function noOverflow(label) {
 assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),label);
}
try {
 // This separate same-origin document must not overwrite an existing application's storage.
 const keeper=page;
 await keeper.route('**/storage-sentinel',route=>route.fulfill({contentType:'text/html',body:'<p>Storage isolation sentinel</p>'}));
 await keeper.goto(`${base}/storage-sentinel`);
 await keeper.evaluate(()=>{localStorage.setItem('user','{"id":123,"role":"provider"}');sessionStorage.setItem('session-id','existing-session');});
 await demo('?sp=providers');
 await page.getByText('Avery Lane',{exact:true}).first().click();
 await page.getByText(/I help students build practical coping skills/).waitFor();
 assert.match(await page.locator('body').innerText(),/English, Spanish/);
 await demo('?sp=roster');
 await page.getByText('DEMO-101',{exact:true}).first().click();
 await page.locator('.sco-panel').waitFor();
 await page.getByText('Willow Brooks',{exact:true}).first().waitFor();
 assert(!/outside the fictional demo/.test(await page.locator('.sco-panel').innerText()));
 await page.locator('.sco-panel button.sco-close').click();
 await page.getByRole('button',{name:'Show full names',exact:true}).click();
 await page.getByRole('checkbox',{name:/I understand this risk/}).check();
 await page.getByRole('button',{name:'Show full names for 10 minutes',exact:true}).click();
 await page.getByText('Willow Brooks',{exact:true}).first().waitFor();
 await demo('?sp=days');
 await page.getByText('Avery Lane',{exact:true}).first().waitFor();
 await page.getByRole('button',{name:'Save',exact:true}).first().click();
 await page.locator('.scb-demo-notice').waitFor();
 assert.match(await page.locator('.scb-demo-notice').innerText(),/Nothing was sent or saved/);
 await demo('?view=overview');
 await page.locator('.school-overview-page').waitFor();
 await page.getByText('Cedar Grove Elementary',{exact:true}).first().waitFor();
 await page.getByRole('link',{name:'All portals',exact:true}).click();
 await page.getByRole('heading',{name:'Show All School Portals'}).waitFor();
 await page.getByRole('button',{name:/Open portal/}).click();
 await page.locator('.school-portal').waitFor();
 assert.match(await page.title(),/SchoolCareBridge/);
 console.log('Interactions passed; checking responsive views.');
 for(const width of [1440,768,390,320]) {
  await page.setViewportSize({width,height:1000});
  for(const query of ['', '?sp=providers','?sp=days','?sp=roster','?view=overview']) {
   await demo(query);
   await page.locator('.school-portal, .school-overview-page').waitFor();
   await page.waitForTimeout(200);
   console.log('Layout',width,query||'home');
   await noOverflow(`${query||'portal'} overflows at ${width}`);
  }
 }
 console.log('Checking same-tab storage.');
 await keeper.goto(`${base}/storage-sentinel`);
 assert.deepEqual(await keeper.evaluate(()=>({user:localStorage.getItem('user'),session:sessionStorage.getItem('session-id')})),{user:'{"id":123,"role":"provider"}',session:'existing-session'});
 assert.deepEqual(requests,[],'The fictional demo must make zero API requests');
 assert.deepEqual(errors,[],'No browser exceptions');
 console.log('Passed: actual provider profiles, student details, name acknowledgement, schedule write rejection, overview → all portals → school navigation, 320–1440px layouts, API isolation and existing-session storage isolation.');
} finally {console.log('Closing verification browser.');await browser.close();}
