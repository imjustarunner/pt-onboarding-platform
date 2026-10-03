// Local synthetic website checks, including the isolated demo iframe.
import {chromium} from '../../node_modules/playwright/index.mjs';
import assert from 'node:assert/strict';
const base=process.env.SCB_PRODUCT_BASE||'http://127.0.0.1:5181';
const browser=await chromium.launch({channel:'chrome',headless:true});
const page=await browser.newPage({viewport:{width:1440,height:1000}});const errors=[];
page.on('pageerror',e=>errors.push(e.message));
await page.route('**/api/**',route=>{
 const p=new URL(route.request().url()).pathname;let data={};
 if(p.includes('/marketing-pages/ptco'))data={page:{slug:'ptco',title:'Plot Twist Co.',branding:{landingTemplate:'ptco'},providerDirectories:[]}};
 else if(p.endsWith('/marketing-pages/schoolcarebridge'))data={page:{slug:'schoolcarebridge',title:'SchoolCareBridge',branding:{schoolcarebridgeWebsite:{}}}};
 else if(p.endsWith('/schoolcarebridge/programs'))data={programs:[]};
 else if(p.includes('partners'))data={partners:[]};
 else if(p.endsWith('users/me'))return route.fulfill({status:401,contentType:'application/json',body:'{}'});
 return route.fulfill({contentType:'application/json',body:JSON.stringify(data)});
});
for(const width of [1440,768,390,320]){
 await page.setViewportSize({width,height:1000});
 for(const path of ['/p/ptco/products','/schoolcarebridge','/schoolcarebridge/for-agencies']){
  await page.goto(base+path);await page.locator('h1').waitFor();await page.waitForTimeout(200);
  const overflow=await page.evaluate(()=>({width:innerWidth,scroll:document.documentElement.scrollWidth,els:[...document.querySelectorAll('*')].filter(el=>el.getBoundingClientRect().right>innerWidth+1).slice(0,10).map(el=>el.className)}));
  console.log(width,path,overflow);assert(overflow.scroll<=width);
  if(path.endsWith('products'))assert.equal(await page.locator('.ptco-product-family article').count(),3);
 }
}
await page.setViewportSize({width:1440,height:1000});await page.goto(base+'/schoolcarebridge');
await page.getByRole('button',{name:'Explore here',exact:true}).last().click();
await page.frameLocator('iframe').last().locator('.school-portal').waitFor();
await page.frameLocator('iframe').last().getByRole('button',{name:'Provider profiles',exact:true}).click();
await page.frameLocator('iframe').last().getByText('Avery Lane',{exact:true}).first().click();
await page.frameLocator('iframe').last().getByText(/I help students build practical coping skills/).waitFor();
assert.deepEqual(errors,[]);console.log('PRODUCTS AND EMBED PASSED');
await browser.close();
