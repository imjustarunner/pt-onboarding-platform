// Synthetic browser checks; no real tenant, signature or payment is created.
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
const base=process.env.SCB_VERIFY_BASE||'http://127.0.0.1:5179';
const browser=await chromium.launch({headless:true,...(process.env.SCB_BROWSER_EXECUTABLE?{executablePath:process.env.SCB_BROWSER_EXECUTABLE}:{})});
const page=await browser.newPage({viewport:{width:1440,height:1050}}),errors=[],writes=[];
page.on('pageerror',e=>errors.push(e.message));
let signedIn=false,role='admin';
const partner={id:2,name:'ITSCO',slug:'itsco',logoUrl:'/assets/itsco/logo.png',workspaceMode:'connected',publicListed:true,settings:{},supportEmail:''};
const school={id:12,name:'Ashley Elementary',slug:'ashley'};
let agreement={id:4,status:'draft',revision:1,terms:{trialStart:'2026-10-01',trialEnd:'2027-03-31',monthlyRateCents:null,cancellationNoticeDays:30},html:'<h1>SchoolCareBridge Partner Agreement</h1><p>2026-10-01 through 2027-03-31. Program fee: $0. No automatic paid conversion.</p>',reviewHash:'synthetic-review-hash'};
const agency={id:2,name:'ITSCO',slug:'itsco',organization_type:'agency',is_active:1};
await page.route('https://schoolcarebridge.org/**',async route=>{const url=new URL(route.request().url());const response=await route.fetch({url:base+url.pathname+url.search});await route.fulfill({response});});
await page.route('**/api/**',async route=>{
 const req=route.request(),path=new URL(req.url()).pathname,method=req.method(),body=req.postDataJSON()||{};let data={},status=200;
 if(method!=='GET')writes.push({path,body});
 if(path.endsWith('/users/me')){status=signedIn?200:401;data=signedIn?{id:20,role,email:'test@example.test',status:'ACTIVE_EMPLOYEE'}:{error:{message:'Sign in'}};}
 else if(path.endsWith('/auth/session-lock-config')||path.endsWith('/auth/session-activity'))data={effectiveTimeoutMinutes:30,session:{serverNow:Date.now(),lastActivityAt:Date.now(),lockAt:Date.now()+25*60000,expiresAt:Date.now()+30*60000,phase:'active'}};
 else if(path.endsWith('/auth/identify'))data={matched:true,normalizedUsername:body.username,resolvedOrg:agency,login:{method:'password'}};
 else if(path.endsWith('/auth/login')){signedIn=true;data={token:'synthetic-browser-token',sessionId:'synthetic-session',user:{id:20,role,email:body.username,status:'ACTIVE_EMPLOYEE'},agencies:[agency]};}
 else if(path.endsWith('/auth/logout')){signedIn=false;data={ok:true};}
 else if(path.endsWith('/tasks/201')){status=404;data={error:{message:'Synthetic signing task unavailable'}};}
 else if(path.endsWith('/schoolcarebridge/partners')||path.endsWith('/schoolcarebridge/admin/partners')||path.endsWith('/schoolcarebridge/my-partners'))data={partners:[partner]};
 else if(path.includes('/schoolcarebridge/partner-brand/'))data={partner};
 else if(path.endsWith('/schoolcarebridge/admin/administrators'))data={users:[{id:20,first_name:'Agency',last_name:'Admin',email:'test@example.test'}]};
 else if(path.endsWith('/schoolcarebridge/admin/partners/2/signers'))data={agency:[{id:20,first_name:'Agency',last_name:'Admin'}],operator:[{id:30,first_name:'MH4Kidz',last_name:'Admin'}]};
 else if(path.endsWith('/schoolcarebridge/admin/agreements/4/issue')){assert.equal(body.reviewHash,'synthetic-review-hash');agreement={...agreement,status:'issued',agency_signer_user_id:20,operator_signer_user_id:30,agency_task_id:201,operator_task_id:202};data={id:4,status:'issued'};}
 else if(path.endsWith('/agreement')){if(method==='PUT')agreement={...agreement,revision:agreement.revision+1,terms:body.terms};data={agreement};}
 else if(path.endsWith('/schoolcarebridge/tenants/itsco/settings'))data={settings:body};
 else if(path.endsWith('/schoolcarebridge/tenants/itsco/schools')){status=201;data={school:{id:14,name:body.name,slug:body.slug}};}
 else if(path.endsWith('/schoolcarebridge/tenants/itsco'))data={partner,schools:[school],providers:[{id:45,first_name:'Alex',last_name:'Care',credential:'LPC'}],canManage:role!=='provider'};
 else if(path.endsWith('/schoolcarebridge/admin/tenants')){status=201;data={agencyId:50,slug:body.slug};}
 else if(path.includes('/public/marketing-pages/'))data={page:{slug:'schoolcarebridge',title:'SchoolCareBridge',branding:{}}};
 else if(path.endsWith('/agencies/resolve'))data={portalUrl:null};
 else if(path.includes('/branding'))data={organization_name:'Plot Twist Co'};
 else if(path.includes('/agencies'))data=[agency];
 await route.fulfill({status,contentType:'application/json',body:JSON.stringify(data)});
});
const visit=path=>page.goto(base+path,{waitUntil:'networkidle'});
try{
 await visit('/schoolcarebridge/partners');await page.getByRole('link',{name:'ITSCO SchoolCareBridge workspace'}).first().click();await page.getByRole('heading',{name:'ITSCO SchoolCareBridge'}).waitFor();
 await page.getByRole('link',{name:'Sign in with your email →'}).click();await page.locator('#username').fill('agency@example.test');await page.locator('#username').press('Tab');await page.locator('#password').fill('Synthetic!123');await page.locator('.login-form button[type=submit]').click();await page.waitForURL('**/schoolcarebridge/app/partners/itsco');
 await visit('/schoolcarebridge/app/partners/itsco');await page.getByRole('heading',{name:'Connected to your schools.'}).waitFor();await page.screenshot({path:'/tmp/scb-partner-workspace.png',fullPage:true});
 await page.getByRole('link',{name:'Clients',exact:true}).click();await page.getByRole('heading',{name:'Client rosters'}).waitFor();assert.match(await page.getByRole('link',{name:/Ashley Elementary/}).getAttribute('href'),/sp=roster/);
 await page.getByRole('link',{name:'Providers',exact:true}).click();await page.getByRole('heading',{name:'Alex Care'}).waitFor();assert.match(await page.getByRole('link',{name:/Ashley Elementary/}).getAttribute('href'),/sp=providers/);
 await page.getByRole('link',{name:'Settings',exact:true}).click();await page.getByLabel('Support email').fill('support@example.test');await page.getByRole('button',{name:'Save settings'}).click();await page.getByText('Settings saved.',{exact:true}).waitFor();assert.deepEqual(Object.keys(writes.at(-1).body).sort(),['description','supportEmail','welcomeMessage']);
 await page.getByRole('link',{name:'School portals',exact:true}).click();await page.getByRole('button',{name:'Add a school',exact:true}).click();await page.getByLabel('School name').fill('Synthetic Elementary');await page.getByLabel('Portal address').fill('synthetic-school');await page.getByRole('button',{name:'Create school portal'}).click();await page.getByText('School portal created.',{exact:true}).waitFor();
 await page.getByRole('link',{name:'Agreement',exact:true}).click();await page.getByText('Draft — not yet issued for signature',{exact:false}).waitFor();
 await page.setViewportSize({width:390,height:844});await visit('/schoolcarebridge/app/partners/itsco');assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));assert.ok(await page.locator('.scb-workspace-main').evaluate(el=>el.getBoundingClientRect().right<=innerWidth));await page.screenshot({path:'/tmp/scb-partner-mobile.png',fullPage:true});
 role='provider';await page.evaluate(()=>{localStorage.clear();sessionStorage.clear();});await visit('/schoolcarebridge/app/partners/itsco');assert.equal(await page.getByRole('link',{name:'Settings',exact:true}).count(),0);assert.equal(await page.getByRole('link',{name:'Agreement',exact:true}).count(),0);
 await page.getByRole('button',{name:'Sign out',exact:true}).click();await page.getByRole('heading',{name:'ITSCO SchoolCareBridge'}).waitFor();assert.ok(page.url().endsWith('/schoolcarebridge/app/partners/itsco'));signedIn=true;
 role='super_admin';await page.evaluate(()=>{localStorage.clear();sessionStorage.clear();});await page.setViewportSize({width:1440,height:1050});await visit('/admin/schoolcarebridge');await page.getByRole('button',{name:'Agreement',exact:true}).click();await page.getByLabel('Complimentary service ends').waitFor();assert.equal(await page.getByLabel('Complimentary service ends').inputValue(),'2027-03-31');assert.equal(await page.getByLabel('Proposed monthly rate per school (USD)').inputValue(),'');
 await page.getByRole('button',{name:'Save new draft revision'}).click();await page.getByText('Draft saved. No signatures or charges were created.',{exact:true}).waitFor();
 await page.getByLabel('ITSCO representative').selectOption('20');await page.getByLabel('MH4Kidz representative').selectOption('30');await page.getByLabel(/I reviewed this saved revision/).check();await page.screenshot({path:'/tmp/scb-agreement-admin.png',fullPage:true});await page.getByRole('button',{name:'Lock revision and assign signatures'}).click();await page.getByText('Issued — awaiting signatures',{exact:false}).waitFor();assert.equal(await page.getByRole('button',{name:'Save new draft revision'}).count(),0);
 await page.getByRole('button',{name:'Add a partner',exact:true}).click();await page.getByLabel('Agency name',{exact:true}).fill('Synthetic Agency');await page.getByLabel('Portal address',{exact:true}).fill('synthetic-agency');await page.getByLabel('Account administrator').selectOption('20');await page.getByRole('button',{name:'Create scoped tenant'}).click();await page.getByText('SchoolCareBridge tenant created. Public listing remains off until reviewed.',{exact:true}).waitFor();
 await visit('/schoolcarebridge/app/partners/itsco/agreement');await page.getByRole('link',{name:'Review and sign →'}).click();await page.waitForURL(url=>url.pathname==='/schoolcarebridge/app/partners/itsco/tasks/documents/201/sign');assert.equal(new URL(page.url()).searchParams.get('returnTo'),'/schoolcarebridge/app/partners/itsco/agreement');await page.getByText('Synthetic signing task unavailable',{exact:true}).waitFor();
 signedIn=false;await page.goto('https://schoolcarebridge.org/app/partners/itsco/tasks/documents/201/sign',{waitUntil:'networkidle'});await page.getByRole('heading',{name:'ITSCO SchoolCareBridge'}).waitFor();const signInLink=await page.getByRole('link',{name:'Sign in with your email →'}).getAttribute('href');assert.ok(decodeURIComponent(signInLink).includes('/partners/itsco/tasks/documents/201/sign'));
 await page.goto('https://schoolcarebridge.org/partners',{waitUntil:'networkidle'});await page.getByRole('link',{name:'ITSCO SchoolCareBridge workspace'}).click();await page.waitForURL('https://schoolcarebridge.org/app/partners/itsco');await page.getByRole('heading',{name:'ITSCO SchoolCareBridge'}).waitFor();
 assert.ok(!writes.some(w=>/invoice|payment|checkout/.test(w.path)));assert.deepEqual(errors,[]);
 console.log('Passed: partner directory/logo entry, branded workspace, rosters/provider links, school creation, concise settings, mobile, provider restrictions, draft review, exact-revision signature assignment and scoped tenant setup; no payment requests or page errors.');
}catch(error){console.error({url:page.url(),body:(await page.locator('body').innerText()).slice(0,5000),errors});await page.screenshot({path:'/tmp/scb-partners-failure.png',fullPage:true});throw error;}finally{await browser.close();}
