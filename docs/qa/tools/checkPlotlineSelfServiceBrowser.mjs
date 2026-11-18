// Local built-interface checks only. API responses are synthetic test fixtures;
// no application session, real account, email or production record is created.
import fs from 'node:fs/promises';
import path from 'node:path';
import http from 'node:http';
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
const dist=path.resolve('frontend/dist'),out=path.resolve(process.argv[2]||'deliverables/plotline-selfservice-rollout-2026-11-18');
await fs.mkdir(out,{recursive:true});
const mime={'.js':'text/javascript','.css':'text/css','.html':'text/html','.svg':'image/svg+xml','.png':'image/png','.ttf':'font/ttf','.webp':'image/webp'};
const server=http.createServer(async(req,res)=>{try{const target=path.resolve(dist,'.'+new URL(req.url,'http://localhost').pathname);if(target!==dist&&!target.startsWith(dist+path.sep)){res.writeHead(404).end();return;}let file=target;try{if(!(await fs.stat(file)).isFile())file=path.join(dist,'index.html');}catch{file=path.join(dist,'index.html');}res.writeHead(200,{'content-type':mime[path.extname(file)]||'application/octet-stream'});res.end(await fs.readFile(file));}catch{res.writeHead(500).end();}});
server.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
const base=`http://127.0.0.1:${server.address().port}`;
const user={id:1434,role:'support',status:'ACTIVE_EMPLOYEE',first_name:'Synthetic',last_name:'QA',capabilities:{canManageHiring:true}};
let draft={id:'00000000-1111-2222-3333-444444444444',revision:1,name:'',industry:'other',timezone:'America/Denver',brand:{theme:'clarity',primary:'#205846',accent:'#DCAA73',mission:'',headline:'',introduction:''},hasLogo:false};
const browser=await chromium.launch({executablePath:process.env.PLAYWRIGHT_CHROME||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
const checks=[],errors=[],external=[];
try{
 const context=await browser.newContext({viewport:{width:1440,height:1050}});
 // Only a local UI fixture; the mock network below provides no authentication
 // credential and cannot be used against any real API.
 await context.addInitScript(u=>localStorage.setItem('user',JSON.stringify(u)),user);
 await context.route('**/*',async route=>{
  const url=new URL(route.request().url());
  if(url.origin!==base){external.push(url.origin);return route.abort();}
  if(!url.pathname.startsWith('/api/'))return route.continue();
  let data={};
  if(url.pathname==='/api/plotline/availability')data={enabled:true,captcha:{siteKey:'',useEnterprise:false}};
  else if(url.pathname==='/api/plotline/workspace')data={email:'qa@example.test',emailVerified:true,canCreateCompany:true,companies:[]};
  else if(url.pathname==='/api/plotline/drafts'&&route.request().method()==='POST')data=draft;
  else if(url.pathname.startsWith('/api/plotline/drafts/')&&route.request().method()==='PUT'){draft={...draft,...route.request().postDataJSON(),revision:draft.revision+1};data=draft;}
  else if(url.pathname==='/api/plotline/copy-suggestion')data={headline:'Make meaningful work happen.',introduction:'We help growing teams make complex decisions clear.'};
  else if(url.pathname==='/api/auth/me')data={user,agencies:[]};
  else if(url.pathname.includes('/agencies'))data=[];
  await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(data)});
 });
 const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
 await page.goto(base+'/plotline/setup');await page.getByLabel('Business name',{exact:true}).waitFor();
 assert.equal(await page.getByLabel('Business name',{exact:true}).inputValue(),'');checks.push('Business name starts empty and required');
 await page.getByLabel('Business name',{exact:true}).fill('Juniper Consulting QA');await page.getByRole('combobox',{name:/Business type/}).selectOption('consulting');
 await page.locator('summary').click();await page.getByLabel('Your mission',{exact:true}).fill('We help growing teams make complex decisions clear.');
 await page.getByRole('button',{name:'Suggest a starting point'}).click();
 await page.evaluate(()=>document.fonts.ready);
 for(const width of [1440,390]){await page.setViewportSize({width,height:1050});for(const theme of ['Clarity','Studio','Story']){
  await page.locator('.pl-style-options button').filter({hasText:theme}).click();
  for(const surface of ['Workspace','Careers','Pre-hire','Onboarding','Offboarding']){
   await page.locator('nav[aria-label="Preview surface"]').getByRole('button',{name:surface,exact:true}).click();
   const preview=page.locator('section[aria-label="Your company preview"]');
   assert.equal(await preview.locator('[data-plotline-theme]').getAttribute('data-plotline-theme'),theme.toLowerCase());
   assert.equal(await preview.locator('img[alt="Plotline by PlotTwistCo"]').evaluate(img=>img.complete&&img.naturalWidth>0),true);
   const expected={Clarity:'Montserrat',Studio:'Plotline Sora',Story:'Georgia'}[theme];
   if(expected!=='Georgia')assert.equal(await page.evaluate(async font=>(await document.fonts.load(`600 20px \"${font}\"`)).every(face=>face.status==='loaded'),expected),true);
   assert.match(await preview.locator('h2.pl-company-title').evaluate(el=>getComputedStyle(el).fontFamily),new RegExp(expected));
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);
   checks.push(`${width}px ${theme} ${surface}`);
   if(width===1440&&surface==='Careers')await page.screenshot({path:path.join(out,`live-ui-${theme.toLowerCase()}.png`),fullPage:true});
   if(width===390&&theme==='Clarity'&&surface==='Onboarding')await page.screenshot({path:path.join(out,'live-ui-mobile-onboarding.png'),fullPage:true});
  }
 }}
 assert.deepEqual(errors,[]);assert.equal(external.every(origin=>origin==='https://fonts.googleapis.com'),true);
 await fs.writeFile(path.join(out,'LOCAL-BROWSER-VALIDATION.json'),JSON.stringify({productionQa:false,network:'mocked localhost API only',realAccountsCreated:0,realEmailsSent:0,checks,pageErrors:errors,blockedLegacyFontRequests:external},null,2));
 console.log(JSON.stringify({checks:checks.length,pageErrors:errors.length,blockedLegacyFontRequests:external.length,productionQa:false}));
}finally{await browser.close();await new Promise(r=>server.close(r));}
