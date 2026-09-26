/** Run against a local Vite server: NODE_PATH=./node_modules node frontend/scripts/verify-navigation-appearance.cjs
 * All API calls use fictional fixtures. Reports/screenshots go to APPEARANCE_ARTIFACTS or a temp directory.
 */
const { chromium } = require('playwright');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const origin = process.env.APPEARANCE_ORIGIN || 'http://127.0.0.1:5184';
if (!['localhost', '127.0.0.1'].includes(new URL(origin).hostname)) throw Error('Use a local Vite server');
const artifacts = process.env.APPEARANCE_ARTIFACTS || fs.mkdtempSync(path.join(os.tmpdir(), 'appearance-audit-'));
fs.mkdirSync(artifacts, { recursive: true });
console.log("Artifacts:", artifacts);
const assert = (value, message) => { if (!value) throw Error(message); };

(async()=>{
 const browser=await chromium.launch({channel:process.env.PLAYWRIGHT_CHANNEL || 'chrome',headless:true});
 const page=await browser.newPage({viewport:{width:1440,height:1000}});
 page.on('console',m=>{if(m.type()==='error')console.log('CONSOLE',m.text())});
 const errors=[];page.on('pageerror',e=>{errors.push(e.message);console.log('PAGE ERROR',e.message,e.stack)});
 const agency={id:377,name:'The Inner Strength Institute',slug:'tisi',portal_url:'tisi',organization_type:'agency',logo_path:null,logo_url:'/assets/branding/innerstrength-favicon-v2.png',color_palette:{primary:'#255E66',secondary:'#1D2633',accent:'#255E66'},feature_flags:{medicalBillingEnabled:true}};
 const financeOrg={agency_id:377,name:'Sample Mentoring Organization',slug:'tisi',is_demo:true,mode:'sponsored',manager_name:'Plot Twist Co',revision:1,fiscal_start_month:1};
 const user={id:99999,role:'super_admin',first_name:'Preview',last_name:'Admin',email:'preview@example.test',capabilities:{},agencies:[agency]};
 await page.route('**/api/**',async route=>{const url=new URL(route.request().url()),p=url.pathname;let data={};
 if(p==='/api/finance-operations/377/bank')data={enabled:false,accounts:[],entries:[]};
 else if(p==='/api/finance-operations/organizations')data={organizations:[financeOrg]};
 else if(p==='/api/finance-operations/377/workspace')data={role:'manager',organization:financeOrg,programs:[{id:10,name:'Mentor Academy'}],budgets:[{id:20,program_id:10,name:'Mentor training',amount_cents:27500000}],expenses:[{id:30,title:'Sample mentor training materials',program_id:10,amount_cents:200000,status:'submitted',revision:1}],totals:{budget:27500000,paid:200000,committed:100000,available:27200000},documents:[],requests:[],history:[],events:[],splits:[],funds:[],grants:[],allocations:[],partners:[],receipts:[]};
 else if(p==='/api/notifications/catalog')data={types:[],categories:[],agencyPolicies:[]};
 else if(p.includes('platform-branding'))data={organization_name:'PlotTwistHQ',primary_color:'#C69A2B',accent_color:'#3A4C6B',secondary_color:'#1D2633',background_color:'#070b14'};
 else if(p.includes('session-lock-config'))data={session:{phase:'active',serverNow:Date.now(),lastActivityAt:Date.now(),lockAt:Date.now()+600000,expiresAt:Date.now()+1200000,activityVersion:1},pinLength:4};
 else if(p.includes('auth/me'))data={user,agencies:[agency]};
 else if(p==='/api/agencies'||p.includes('users/99999/agencies'))data=[agency];
 else if(p.includes('agencies/377'))data=agency;
 else if(p.includes('portal')||p.includes('by-slug'))data={agency,organization:agency,colorPalette:agency.color_palette,portalUrl:'tisi'};
 else if(p.includes('family-billing/staff/desk'))data={balances:[],links:[],overdue:[],payments:[],tasks:[]};
 else if(p.includes('stripe'))data={connected:false,configured:true,platformConfigured:true,canManageConnection:true};
 else if(p.includes('preferences'))data={high_contrast:false,larger_text:false};

 else if(/documents|payroll\/me\/(periods|time-claims|mileage-claims|pto-requests|reimbursement-claims|company-card-expenses|medcancel-claims|assigned-offices)|payroll\/(other-rate-titles|my-time-categories)|templates|packages|training-focus|on-demand-training|progress|certificates|training-saved|payroll\/periods|intake-links/.test(p))data=[];
 else if(p.includes('medical-billing/workspace'))data={organizations:[],claims:[],queue:[],totals:{}};
 else if(p==='/api/modules')data=[];
 else if(/presence|people|threads|notifications|messages|tickets|tasks|agencies|icons|departments|categories|reviews|programs|users/.test(p))data=[];
 await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(data)});
 });

 await page.goto(origin+'/login');
 await page.evaluate(({user,agency})=>{localStorage.setItem('user',JSON.stringify(user));localStorage.setItem('userAgencies',JSON.stringify([agency]));localStorage.setItem('currentAgency',JSON.stringify(agency));}, {user,agency});

 const report={surfaces:[],navigation:null,themeModes:[],artifacts};
 async function setTheme(mode){await page.locator('select[aria-label="Appearance"]').first().selectOption(mode,{force:true});await page.waitForTimeout(180);}
 async function brightSurfaces(){return page.evaluate(()=>Array.from(document.querySelectorAll('body *')).flatMap(e=>{
  const c=getComputedStyle(e),r=e.getBoundingClientRect(),rgb=c.backgroundColor.match(/[\d.]+/g)?.map(Number)||[];
  if(r.width<70||r.height<22||r.width*r.height<3000||!e.checkVisibility()||rgb.length<3||(rgb[3]??1)<.85||Math.min(...rgb.slice(0,3))<185||e.matches('img,canvas,svg'))return [];
  return [{tag:e.tagName,cls:String(e.className).slice(0,120),bg:c.backgroundColor,text:c.color}];
 }));}
 const paths=['/admin?panel=overview','/tisi/dashboard','/tisi/dashboard?tab=my&my=payroll','/tisi/workforce-operations','/tisi/people-operations','/tisi/school-operations','/tisi/finance-operations',...['overview','budgets','expenses','bank','reports'].map(x=>'/tisi/finance-operations?area='+x),'/tisi/admin/settings','/tisi/admin/family-billing?tab=setup','/tisi/admin/medical-billing','/tisi/admin/clients','/tisi/admin/guardians','/tisi/admin/users','/tisi/admin/documents','/tisi/admin/contacts','/tisi/admin/office-clients','/tisi/messages','/tisi/tasks','/tisi/schedule/staff','/tisi/buildings/schedule','/tisi/admin/communications','/tisi/my-learning','/tisi/admin/payroll','/tisi/admin/credentialing','/tisi/admin/digital-forms'];
 for(const destination of paths){
  const before=errors.length;
  await page.goto(origin+destination);await page.waitForTimeout(1800);
  await setTheme('light');if(['/tisi/admin/settings','/tisi/finance-operations?area=budgets'].includes(destination))await page.screenshot({path:path.join(artifacts,destination.replace(/[^a-z0-9]+/gi,'-')+'-light.png')});assert(await page.locator('html').getAttribute('data-theme')!=='dark','Light mode did not apply');
  await setTheme('dark');assert(await page.locator('html').getAttribute('data-theme')==='dark','Dark mode did not apply');
  const bright=await brightSurfaces();report.surfaces.push({destination,bright,errors:errors.slice(before)});
  await page.screenshot({path:path.join(artifacts,destination.replace(/[^a-z0-9]+/gi,'-')+'.png')});
  console.log('Surface',destination,bright.length,'bright surfaces');
 }
 // A real form dialog with populated, fictional finance records.
 await page.goto(origin+'/tisi/finance-operations?area=expenses');await page.waitForTimeout(1000);await setTheme('dark');
 await page.locator('.finance-page-header button.primary').click();await page.locator('.finance-dialog').waitFor();
 report.dialog={bright:await brightSurfaces()};await page.screenshot({path:path.join(artifacts,'finance-dialog-dark.png')});
 await page.goto(origin+'/tisi/admin/settings');await page.waitForTimeout(1200);
 await page.emulateMedia({colorScheme:'dark'});await setTheme('system');assert(await page.locator('html').getAttribute('data-theme')==='dark','System dark mode failed');
 await page.emulateMedia({colorScheme:'light'});await page.waitForTimeout(150);assert(await page.locator('html').getAttribute('data-theme')!=='dark','System light mode failed');
 await setTheme('dark');await page.reload();await page.waitForTimeout(1200);assert(await page.locator('html').getAttribute('data-theme')==='dark','Theme did not persist');report.themeModes=['light','dark','system dark','system light','dark after reload'];
 for(const mode of ['light','dark']){
  await setTheme(mode);await page.setViewportSize({width:390,height:844});
  await page.evaluate(()=>import('/src/composables/useCommandPalette.js').then(m=>m.useCommandPalette().openPalette('nav')));
  await page.locator('.cp-input').fill('finance');await page.waitForTimeout(150);
  const box=await page.locator('.cp-panel').boundingBox();if(box)assert(box.x>=-1&&box.x+box.width<=391,'Palette overflows mobile viewport');
  await page.screenshot({path:path.join(artifacts,`quick-nav-mobile-${mode}.png`)});
  await page.evaluate(()=>import('/src/composables/useCommandPalette.js').then(m=>m.useCommandPalette().closePalette()));
 }
 await page.setViewportSize({width:1440,height:1000});
 async function search(q){await page.evaluate(()=>import('/src/composables/useCommandPalette.js').then(m=>m.useCommandPalette().openPalette('nav')));await page.locator('.cp-input').fill(q);await page.waitForTimeout(180);}
 for(const [q,label,expected] of [['stripe','Stripe & Payment Setup','/tisi/admin/family-billing?tab=setup'],['payroll','Payroll','/tisi/dashboard?tab=my&my=payroll'],['bank','Bank & Reconciliation','/tisi/finance-operations?area=bank'],['staff schedule compare','Staff Schedule Compare','/tisi/schedule/staff']]){
  await search(q);
  await page.locator('.cp-result').filter({has:page.getByText(label,{exact:true})}).first().click();await page.waitForTimeout(1200);
  const actual=new URL(page.url()).pathname+new URL(page.url()).search;console.log('CLICK',label,actual);if(actual!==expected)throw Error('Expected '+expected+' got '+actual+' '+await page.locator('.cp-navigation-error').allTextContents());
 }
 const history=await page.evaluate(()=>JSON.parse(localStorage.getItem('pt_command_palette_nav_history')));if(!history.some(x=>x.path==='/tisi/dashboard?tab=my&my=payroll'))throw Error('History lost account query');
 await search('payroll');await page.locator('.cp-input').fill('');await page.locator('.cp-chips button').filter({hasText:'Payroll'}).first().click();await page.waitForTimeout(800);if(!page.url().includes('my=payroll'))throw Error('Recent account link lost tab');
 console.log('HISTORY OK');

 await page.evaluate(async()=>{const router=document.querySelector('#app').__vue_app__.config.globalProperties.$router;let attempts=0;const loader=()=>++attempts===1?Promise.reject(new Error('simulated missing chunk')):Promise.resolve({template:'<main>Retry loaded</main>'});for(const record of router.getRoutes().filter(r=>String(r.name).endsWith('UsageAnalytics')))record.components.default=loader;});
 await search('usage analytics');await page.locator('.cp-result').filter({hasText:'Usage Analytics'}).click();await page.locator('.cp-navigation-error').waitFor();if(!await page.locator('.cp-overlay').isVisible())throw Error('Palette closed on failure');
 await page.locator('.cp-result').filter({hasText:'Usage Analytics'}).click();await page.waitForTimeout(500);if(!page.url().endsWith('/admin/usage-analytics'))throw Error('Retry failed');console.log('RETRY OK');
 report.clicks=['Stripe setup','Payroll account tab','Bank & Reconciliation','Staff Schedule Compare','Recent account tab','Failed load and retry'];
 const audit=await page.evaluate(async()=>{
  const router=document.querySelector('#app').__vue_app__.config.globalProperties.$router;
  const {getRegisteredQuickNavEntries,resolveRegisteredQuickNav}=await import('/src/navigation/quickNavRuntime.js');
  const {buildQuickNavContext,getAllQuickNavEntries}=await import('/src/navigation/quickNavCatalog.js');
  const ctx=buildQuickNavContext({user:{role:'super_admin'},showSchedule:true,showPayroll:true,showClaims:true,showSupervision:true,showMySupervision:true,showChats:true,kudosEnabled:true});
  const opts={orgSlug:'tisi',currentPath:'/tisi/admin/settings',agency:{id:377}};
  const candidates=getAllQuickNavEntries(ctx);
  const invalid=candidates.filter(e=>!resolveRegisteredQuickNav(e,router,opts)).map(e=>({label:e.label,path:e.path}));
  const entries=getRegisteredQuickNavEntries(router,ctx,opts);
  const pages=new Map();for(const entry of entries){const r=router.resolve(entry.destination);for(const record of r.matched){for(const c of Object.values(record.components||{})){if(typeof c==='function')pages.set(c,entry.destination)}}}
  const failures=[];let loaded=0;const queue=[...pages];
  async function load(){while(queue.length){const [fn,path]=queue.shift();try{await fn();loaded++;}catch(e){failures.push({path,error:e.message})}}}
  await Promise.all([load(),load(),load()]);
  return {invalid,count:entries.length,loaded,failures,entries:entries.map(e=>({label:e.label,destination:e.destination}))};
 });
 report.navigation=audit;
 fs.writeFileSync(path.join(artifacts,'report.json'),JSON.stringify(report,null,2));
 await browser.close();
 assert(!report.surfaces.some(x=>x.bright.length||x.errors.length),'Surface audit failures; inspect '+artifacts);
 assert(!report.dialog.bright.length,'Bright finance dialog surfaces');
 assert(!audit.invalid.length&&!audit.failures.length,'Navigation audit failed');
 console.log(JSON.stringify({pages:report.surfaces.length,destinations:audit.count,loaded:audit.loaded,themeModes:report.themeModes,artifacts},null,2));
})().catch(error=>{console.error(error);process.exit(1);});
