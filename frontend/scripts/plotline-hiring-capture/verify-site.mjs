import {chromium} from '../../../node_modules/playwright/index.mjs';
import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
const origin=process.env.PLOTLINE_TEST_ORIGIN||'http://127.0.0.1:5213';
const output=process.env.PLOTLINE_REVIEW_DIR||'/private/tmp/plotline-hiring-site-checks';
mkdirSync(output,{recursive:true});
const browser=await chromium.launch({channel:'chrome',headless:true});
const context=await browser.newContext({viewport:{width:1440,height:1080},reducedMotion:'reduce'});
const errors=[],blocked=[],writes=[],results=[];
await context.addInitScript(()=>{
 window.__mediaAttempts=0;
 if(navigator.mediaDevices)for(const method of ['getUserMedia','getDisplayMedia'])Object.defineProperty(navigator.mediaDevices,method,{value:async()=>{window.__mediaAttempts++;throw Error('No media in website validation');}});
});
await context.route('**/*',route=>{
 const request=route.request(),url=new URL(request.url());
 if(request.method()!=='GET'){writes.push(url.pathname);return route.abort();}
 if(url.origin!==origin&&!['data:','blob:'].includes(url.protocol)){blocked.push(url.origin+url.pathname);return route.abort();}
 return route.continue();
});
const page=await context.newPage();page.on('pageerror',error=>errors.push(error.message));
try{
 for(const width of [1440,1024,768,390,320]){
  await page.setViewportSize({width,height:1080});
  for(const section of ['','product','solutions','careers','resources','about','pricing','start']){
   await page.goto(origin+'/plottline'+(section?'/'+section:''));
   await page.locator('.pl-site-footer').waitFor();
   await page.evaluate(async()=>{await document.fonts.ready;await Promise.all([...document.images].map(image=>{image.loading='eager';return image.decode();}));});
   assert.equal(await page.locator('h1').count(),1,section+' must have one h1');
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false,`${section||'home'} overflow at ${width}`);
   assert.equal(await page.evaluate(()=>window.__mediaAttempts),0);
   if(['','product'].includes(section)){
    const root=page.locator('#interview-platform');
    await root.getByRole('tab',{name:'Applicant view',exact:true}).click();
    assert.match(await root.locator('.pl-example-open img').getAttribute('src'),/interview-applicant\.png/);
    await root.locator('.pl-example-open').click();
    assert.match(await root.locator('dialog[open]').innerText(),/speech capture is disabled/);
    await page.keyboard.press('Escape');assert.equal(await page.locator('dialog[open]').count(),0);
    await root.getByRole('tab',{name:'Interview team view',exact:true}).click();await page.keyboard.press('ArrowRight');
    assert.equal(await root.getByRole('tab',{name:'Applicant view',exact:true}).evaluate(el=>el===document.activeElement),true);
    await root.getByRole('tab',{name:'Interview team view',exact:true}).click();
    if(section==='product'){
     await page.getByRole('button',{name:'Review checklist',exact:true}).click();
     assert.match(await page.locator('#pre-hire-portal .pl-example-open img').getAttribute('src'),/prehire-review\.png/);
     await page.getByRole('button',{name:'Candidate home',exact:true}).click();
     for(const id of ['professional-references','pre-hire-portal'])assert.equal(await page.locator('#'+id).count(),1);
     if([1440,390].includes(width))for(const id of ['interview-platform','professional-references','pre-hire-portal'])await page.locator('#'+id).screenshot({path:`${output}/${id}-${width}.png`});
    }
   }
   results.push({section:section||'home',width,status:'PASS'});
  }
 }
 for(const [interest,label] of [['interviews','Browser interviews'],['references','Professional references'],['prehire','Pre-hire portal']]){
  await page.goto(origin+'/plottline/product');
  await page.locator(`a[href="/plottline/start?interest=${interest}"]`).first().click();
  assert.equal(await page.getByLabel('What would you like to explore?',{exact:true}).inputValue(),label);
 }
 await page.goto(origin+'/plottline/pricing');
 await page.getByLabel('Active employees',{exact:true}).fill('50');
 await page.getByLabel('AuricWell',{exact:true}).check();await page.getByLabel('Conversa',{exact:true}).check();
 assert.equal(await page.locator('.pl-quote>strong').innerText(),'$229');
 assert.deepEqual(errors,[]);assert.deepEqual(blocked,[]);assert.deepEqual(writes,[]);
 writeFileSync(output+'/BROWSER.json',JSON.stringify({status:'PASS',origin,results,errors,blocked,writes,mediaAttempts:0,featureLinks:'PASS',dialogs:'PASS',keyboard:'PASS',pricing:'PASS',limits:'Local compiled website only. No production identity, video, reference, signature, invitation, message or inquiry submission.'},null,2)+'\n');
 console.log('PASS: 40 responsive page checks, interview perspectives, dialogs, keyboard, pre-hire screens, three inquiry handoffs and existing pricing. No media or writes.');
}finally{await context.close();await browser.close();}
