// Local visual and interaction verification with explicitly synthetic API fixtures.
// This does not claim production delivery or end-to-end clinical workflow coverage.
import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../../../',import.meta.url));
const directory=root+'deliverables/auricwell-provider-workspace';fs.mkdirSync(directory,{recursive:true});
const browser=await chromium.launch({headless:true,channel:'chrome'});
const context=await browser.newContext({viewport:{width:1672,height:1050}});
const page=await context.newPage();const errors=[],requests=[];page.on('pageerror',e=>errors.push(e.message));
const practice={id:450,slug:'auricwell-qa-demo',name:'AuricWell QA Mental Health — DEMO',timezone:'America/Denver'};
let role='provider',failAppointments=false;
const actor={id:1433,first_name:'Avery',last_name:'Morgan',credential:'LCSW',timezone:'America/Denver'};
const clients=['Alex Carter','Maria Lopez','James Park','Taylor Kim','Riley Thompson'].map((name,i)=>({id:8001+i,full_name:name,status:'ACTIVE'}));
const day=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Denver',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
await page.route('**/api/**',async route=>{
 const url=new URL(route.request().url()),path=url.pathname.replace('/api','');requests.push({path,query:url.search,headers:route.request().headers()});let data={};
 if(path==='/auricwell-preview/context')data={practice,actor:{...actor,role},qaWorkspace:true};
 else if(path==='/auricwell-preview/toasts/active')data=[];
 else if(path==='/auricwell-preview/notifications')data={items:[{id:71,title:'New client assigned',message:'A fictional client is ready for your review.',is_read:false}],unreadCount:1};
 else if(path==='/auricwell-preview/tasks')data={tasks:[{id:91,title:'Follow up with Alex Carter',task_type:'follow_up',due_date:day,status:'pending'},{id:92,title:'Complete treatment plan',task_type:'clinical',status:'in_progress',due_date:day},{id:93,title:'Review referral',status:'pending',task_type:'review'}],total:3};
 else if(path==='/clients'){const q=(url.searchParams.get('search')||'').toLowerCase();data={items:clients.filter(c=>c.full_name.toLowerCase().includes(q)),total:q?1:28};}
 else if(path==='/appointments'){
  if(failAppointments)return route.fulfill({status:503,contentType:'application/json',body:'{}'});
  data={appointments:clients.map((c,i)=>({id:100+i,providerUserId:1433,title:c.full_name,serviceCode:'90834',modality:'IN_PERSON',status:'scheduled',startAt:`${day}T${String(15+i).padStart(2,'0')}:00:00Z`,endAt:`${day}T${String(15+i).padStart(2,'0')}:50:00Z`}))};
 }else if(path==='/clinical-notes/recent')data={drafts:clients.map((c,i)=>({id:200+i,client_id:c.id,client_full_name:c.full_name,title:'Therapy Session',status:'draft',date_of_service:day})),signedSessions:[]};
 else if(path==='/auricwell-preview/providers')data={providers:[actor]};
 await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(data)});
});
try{
 const base=process.env.AURICWELL_WORKSPACE_URL||'http://127.0.0.1:5187';
 await page.goto(`${base}/auricwell/app/${practice.slug}`,{waitUntil:'networkidle',timeout:90000});
 await page.getByText('Updated ',{exact:false}).waitFor();
 assert.equal(await page.locator('.aw-summary-card').count(),4);
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
 await page.screenshot({path:directory+'/desktop.png',fullPage:true});
 await page.locator('.aw-notification-button').click();await page.getByRole('heading',{name:'Notifications',exact:true}).waitFor();await page.getByText('New client assigned',{exact:true}).waitFor();
 await page.locator('.aw-account-toggle').click();await page.locator('#aw-account-menu').getByText('My Account',{exact:true}).click();await page.getByRole('heading',{name:'My Account',exact:true}).waitFor();
 await page.getByRole('navigation',{name:'Practice navigation'}).getByText('My Payroll',{exact:true}).click();
 assert.equal(await page.getByRole('link',{name:/Payroll & submissions/}).getAttribute('href'),`/${practice.slug}/dashboard?tab=my&my=payroll`);
 await page.screenshot({path:directory+'/payroll.png',fullPage:true});
 await page.getByRole('searchbox',{name:'Search clients'}).fill('Maria');await page.locator('form[role=search]').evaluate(el=>el.requestSubmit());await page.getByText('Maria Lopez',{exact:true}).waitFor();
 assert.match(page.url(),/search=Maria/);
 await page.goto(`${base}/auricwell/app/${practice.slug}`,{waitUntil:'networkidle'});
 await page.setViewportSize({width:390,height:844});await page.reload({waitUntil:'networkidle'});
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
 await page.screenshot({path:directory+'/mobile.png',fullPage:true});
 await page.getByRole('button',{name:'Open navigation'}).click();await page.getByRole('navigation',{name:'Practice navigation'}).getByText('Settings',{exact:true}).click();await page.getByRole('heading',{name:'Settings',exact:true}).waitFor();assert.equal(await page.locator('.aw-menu-open').count(),0);
 role='support';await page.goto(`${base}/auricwell/app/${practice.slug}`,{waitUntil:'networkidle'});await page.getByRole('button',{name:'Open navigation'}).click();
 assert.doesNotMatch(await page.getByRole('navigation',{name:'Practice navigation'}).innerText(),/Notes & Documentation|Billing|My Payroll/);
 await page.goto(`${base}/auricwell/app/${practice.slug}/documentation`,{waitUntil:'networkidle'});await page.getByRole('heading',{name:'Access restricted'}).waitFor();
 role='provider';failAppointments=true;await page.goto(`${base}/auricwell/app/${practice.slug}`,{waitUntil:'networkidle'});await page.getByText('Could not load appointments. Try refreshing.',{exact:true}).waitFor();assert.equal(await page.getByText('No appointments scheduled',{exact:true}).count(),0);
 assert.deepEqual(errors,[]);
 const scoped=requests.filter(r=>r.path!=='/auricwell-preview/context');assert(scoped.every(r=>r.headers['x-auricwell-practice']==='450'));
 const report={mode:'Local synthetic API fixtures',checks:['desktop layout','mobile no horizontal overflow','mobile menu','client search','notifications','My Account','payroll destination','support restrictions','partial-error state','practice header'],passed:true,at:new Date().toISOString(),screenshots:['desktop.png','mobile.png','payroll.png']};
 fs.writeFileSync(directory+'/local-verification.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));
}finally{await browser.close();}
