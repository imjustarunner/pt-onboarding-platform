// Local synthetic fixtures only. Every API request is intercepted.
const {chromium}=require('playwright');
const fs=require('node:fs');
const assert=require('node:assert/strict');
const artifacts='/tmp/ehr-overview';fs.mkdirSync(artifacts,{recursive:true});
const day=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Denver',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
const names=Array.from({length:60},(_,i)=>`Example Client ${i+1}`);
const errors=[],results=[];
(async()=>{
 const browser=await chromium.launch({channel:'chrome',headless:true});
 try {
  for(const standalone of process.env.EHR_MODE==='standalone'?[true]:[false,true]){
   const page=await browser.newPage({viewport:{width:1672,height:1000}});page.setDefaultTimeout(20000);page.on('pageerror',e=>{errors.push(e.stack);console.error(e.stack);});
   page.on('console',message=>{if(message.type()==='error')console.error(message.text());});
   page.on('requestfailed',request=>console.error('Request failed',request.url(),request.failure()?.errorText));
   const kind=standalone?'standalone':'preview';
   let role='provider';
   const practice={id:standalone?'practice-1':450,slug:'example',name:'Example Mental Health',timezone:'America/Denver',actorType:'staff',permissions:['clinical','schedule','agreements'],capabilities:{schedule:true,clients:true,documentation:true,messages:true,portal:true,billing:false}};
   const account={id:'account-1',name:'Example Provider'};
   await page.route('**/api/**',async route=>{
    const p=new URL(route.request().url()).pathname;let data={};
    if(standalone){
     if(p.endsWith('/bootstrap'))data={account,practices:[practice]};
     else if(p.endsWith('/workspace'))data={practice,patients:names.map((name,i)=>({id:`p${i}`,data:{name,status:'active',careTeam:[account.id]}})),notes:names.map((name,i)=>({id:`n${i}`,patientId:`p${i}`,data:{status:'draft',title:'Example progress note',serviceDate:day,authorAccountId:i===1?'another-clinician':account.id,diagnoses:[]}})),appointments:names.map((name,i)=>({id:`a${i}`,patientId:`p${i}`,data:{start:`${day}T15:${String(i).padStart(2,'0')}:00Z`,end:`${day}T17:00:00Z`,status:'scheduled',providerAccountId:account.id}})),providers:[],messages:[],appointmentRequests:[],ledger:[],claims:[],agreements:[]};
     else if(p.endsWith('/notifications'))data=[{id:'u1',title:'Review new message',section:'messages'}];
     else if(/toasts|templates|preferences|notices/.test(p))data=[];
    }else{
     if(p.endsWith('/auricwell-preview/context'))data={practice,actor:{id:1433,role,first_name:'Example',last_name:'Provider',timezone:'America/Denver'},qaWorkspace:true};
     else if(p.endsWith('/notifications'))data={items:[],unreadCount:0};
     else if(p.endsWith('/tasks'))data={tasks:names.slice(0,50).map((name,i)=>({id:i,title:`Follow up with ${name}`,status:'pending',due_date:day})),total:60};
     else if(p.endsWith('/clients'))data={items:names.slice(0,50).map((name,i)=>({id:i+1,full_name:name,status:'ACTIVE'})),total:60};
     else if(p.endsWith('/appointments'))data={appointments:names.map((name,i)=>({id:i+1,startAt:`${day}T15:${String(i).padStart(2,'0')}:00Z`,endAt:`${day}T17:00:00Z`,title:name,status:'scheduled'}))};
     else if(p.endsWith('/clinical-notes/recent'))data={drafts:names.map((name,i)=>({id:i+1,client_id:i+1,client_full_name:name,title:'Example progress note',status:'draft',date_of_service:day}))};
     else if(/toasts/.test(p))data=[];
    }
    await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(data)});
   });
   const home=standalone?'http://127.0.0.1:5186/app/example':'http://127.0.0.1:5185/auricwell/app/example';
   await page.goto(home);await page.getByRole('button',{name:'Collapse Pending Notes & Documentation to a summary card',exact:true}).waitFor({timeout:60000}).catch(async e=>{await page.screenshot({path:`${artifacts}/${kind}-failed.png`,fullPage:true});console.error(await page.locator('body').innerText());throw e;});
   const notes=page.locator('[data-tour="dash-section-ehr-notes"]');
   const scroll=notes.getByRole('region',{name:'Pending Notes & Documentation',exact:true});
   const scrollMetrics=await scroll.evaluate(el=>({client:el.clientHeight,scroll:el.scrollHeight,rows:el.children.length}));
   assert(scrollMetrics.scroll>scrollMetrics.client&&scrollMetrics.client<=320&&scrollMetrics.rows===60,`${kind}: 60 notes scroll in a bounded card`);
   await page.getByRole('button',{name:'Collapse Pending Notes & Documentation to a summary card',exact:true}).click();await notes.waitFor({state:'hidden'});
   await page.reload();await page.getByLabel('Expand Pending Notes & Documentation',{exact:true}).waitFor();
   const before=page.url();await page.getByLabel('Expand Pending Notes & Documentation',{exact:true}).click();await notes.waitFor({state:'visible'});assert.equal(page.url(),before,'Restore stays on overview');
   await page.getByRole('button',{name:'Customize dashboard',exact:true}).click();
   await page.getByRole('button',{name:'Move Your Clients up',exact:true}).click();
   const hiddenName=standalone?'Practice Follow-ups':'Tasks & Follow-ups';await page.getByRole('checkbox',{name:hiddenName,exact:true}).uncheck();
   const hiddenId=standalone?'followups':'tasks';assert.equal(await page.locator(`[data-tour="dash-section-ehr-${hiddenId}"]`).count(),0);
   await page.reload();await page.getByRole('button',{name:'Customize dashboard',exact:true}).waitFor();assert.equal(await page.locator(`[data-tour="dash-section-ehr-${hiddenId}"]`).count(),0);
   assert.equal(await page.locator('[data-tour="dash-section-ehr-clients"]').evaluate(el=>el.style.order),'1');
   await page.getByRole('button',{name:'Customize dashboard',exact:true}).click();await page.getByRole('button',{name:'Reset layout',exact:true}).click();await page.getByRole('button',{name:'Customize dashboard',exact:true}).click();
   await page.getByRole('button',{name:'Collapse sidebar',exact:true}).click();await page.reload();await page.getByRole('button',{name:'Expand sidebar',exact:true}).waitFor();await page.getByRole('button',{name:'Expand sidebar',exact:true}).click();
   const widths=[];
   for(const width of [1672,1100,900,390]){
    await page.setViewportSize({width,height:1000});await page.waitForTimeout(200);
    const metrics=await page.evaluate(()=>{const a=document.querySelector('[data-tour="dash-section-ehr-schedule"]').getBoundingClientRect(),b=document.querySelector('[data-tour="dash-section-ehr-notes"]').getBoundingClientRect();return {width:innerWidth,documentWidth:document.documentElement.scrollWidth,twoColumns:b.x>a.x+20};});
    assert(metrics.documentWidth<=width+2,`${kind}: no horizontal overflow at ${width}`);if(width>=900)assert(metrics.twoColumns,`${kind}: two columns at ${width}`);
    widths.push(metrics);await page.screenshot({path:`${artifacts}/${kind}-${width}.png`,fullPage:true});
   }
   if(!standalone){
    role='support';await page.goto(home);await page.getByRole('button',{name:'Customize dashboard',exact:true}).waitFor();await page.getByRole('button',{name:'Customize dashboard',exact:true}).click();
    assert.equal(await page.getByRole('checkbox',{name:'Pending Notes & Documentation',exact:true}).count(),0);
    assert.equal(await page.getByText('My Payroll',{exact:true}).count(),0);
   }else{
    await page.setViewportSize({width:1100,height:1000});await page.goto(home);await notes.getByRole('button').first().waitFor();
    await notes.locator('.ehr-row').first().click();await page.getByRole('heading',{name:'Update record',exact:true}).waitFor();
    assert.equal(await page.getByLabel('Title',{exact:true}).inputValue(),'Example progress note','A dashboard note opens the selected draft');
    await page.goto(home);await notes.locator('.ehr-row').nth(1).click();await page.getByRole('button',{name:'Close note',exact:true}).waitFor();
    assert.equal(await page.getByRole('heading',{name:'Update record',exact:true}).count(),0,'Another clinician’s draft opens for viewing');
    assert.equal(await page.getByRole('button',{name:'Edit draft',exact:true}).count(),0,'Overview does not bypass draft ownership');
    practice.permissions=['schedule'];await page.goto(home);await page.getByRole('button',{name:'Customize dashboard',exact:true}).waitFor();
    assert.equal(await page.locator('[data-tour="dash-section-ehr-notes"]').count(),0,'Nonclinical staff get no clinical drafts card');
    practice.actorType='patient';await page.goto(home);await page.getByText('Your charts',{exact:true}).waitFor();
    assert.equal(await page.locator('.ehr-overview').count(),0,'Patient portal retains its own overview');
   }
   results.push({kind,scrollMetrics,widths});await page.close();
  }
  assert.deepEqual(errors,[]);fs.writeFileSync(`${artifacts}/report.json`,JSON.stringify({results,errors},null,2));console.log(JSON.stringify({results,errors},null,2));
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
