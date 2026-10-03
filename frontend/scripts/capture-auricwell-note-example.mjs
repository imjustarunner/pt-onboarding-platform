import { chromium } from '../../node_modules/playwright/index.mjs';
import assert from 'node:assert/strict';
const browser=await chromium.launch({headless:true,channel:'chrome'});
const page=await browser.newPage({viewport:{width:1440,height:1000}});
await page.route('**/*', route => new URL(route.request().url()).origin === 'http://127.0.0.1:5181' ? route.continue() : route.abort());
const errors=[];page.on('pageerror',e=>errors.push(e.message));
const practice={id:7,name:'Example Therapy Practice',slug:'tisi',organization_type:'agency',feature_flags:{noteAidEnabled:true,clinicalNoteGeneratorEnabled:true,medicalBillingEnabled:true}};
const actor={id:9,role:'super_admin',first_name:'Example',last_name:'Administrator'};
const requests=[];
await page.route('**/api/**',async r=>{
 const req=r.request(),u=new URL(req.url()),p=u.pathname.replace('/api','');requests.push({path:p,headers:req.headers(),query:u.search});
 let data={};
 if(p==='/auricwell-preview/context')data={actor,practice,preview:true};
 else if(p==='/auricwell-preview')data={actor,practices:[practice]};
 else if(p==='/clients')data={clients:[{id:71,agency_id:7,full_name:'Synthetic Client',initials:'S.C.',status:'ACTIVE'}]};
 else if(p==='/clients/71')data={id:71,agency_id:7,full_name:'Synthetic Client',initials:'S.C.'};
 else if(p==='/auricwell-preview/providers')data={providers:[{id:81,first_name:'Sample',last_name:'Clinician',credential:'LPC',is_active:1}]};
 else if(p==='/appointments')data={appointments:[{id:91,agencyId:7,startAt:'2026-09-30T16:00:00Z',serviceCode:'90834',status:'scheduled'}]};
 else if(p==='/clinical-notes/context')data={providerCredentialText:'LPC',derivedTier:'intern_plus',eligibleServiceCodes:['90834'],serviceCodeCatalog:[],audioAgreementTemplates:[]};
 else if(p==='/clinical-notes/programs')data={programs:[]};
 else if(p==='/clinical-notes/work-queue')data={items:[]};
 else if(p==='/clinical-notes/recent')data={drafts:[{id:201,client_id:71,client_full_name:'Example Client',initials:'E.C.',note_type:'PROGRESS_NOTE',service_code:'90834',status:'draft',date_of_service:'2026-10-02',updated_at:'2026-10-02T16:00:00Z',title:'Individual therapy progress note'}],signedSessions:[]};
 else if(p==='/note-aid/catalog')data={aids:[]};
 else if(p==='/medical-billing/workspace')data={organizations:[{id:7,name:practice.name,counts:{draft:2},connection:{configured:false},enrollments:[]}],claims:[],total:0,capabilities:{claims:true},updatedAt:new Date().toISOString()};
 else if(p.includes('/chart'))data={notes:[{id:33,title:'Existing progress note',note_type:'progress',provider_signed_at:'2026-09-20T10:00:00Z'}],sessions:[],diagnoses:[],objectiveRatings:[]};
 else if(p.endsWith('/guardians'))data=[];
 else if(p==='/medical-billing/service-locations')data={choices:[]};
 else if(p==='/clinical-notes/termination-outcomes')data={outcomes:[]};
 if (p==='/auricwell-preview/context' && u.searchParams.get('slug')==='second-practice') data={actor,practice:{...practice,id:8,name:'Second Practice',slug:'second-practice'},preview:true};
 if (p==='/clients' && req.headers()['x-auricwell-practice']==='8') data={clients:[{id:82,agency_id:8,full_name:'Second Practice Client',status:'ACTIVE'}]};
 await r.fulfill({status:200,contentType:'application/json',body:JSON.stringify(data)});
});
try {
 await page.goto('http://127.0.0.1:5181/auricwell/app/example-practice/documentation');
 await page.locator('.na-app').waitFor({timeout:60000});
 await page.waitForTimeout(1200);

 await page.locator('.clinical-workspace').screenshot({path:'frontend/public/auricwell/examples/practice-notes.png'});
 await page.getByRole('button',{name:'Create New Note Start a new note',exact:false}).click();
 await page.waitForTimeout(300);

 await page.getByText('Progress Documentation Hub (Individual Psychotherapy)',{exact:true}).click();
 await page.waitForTimeout(300);
 await page.locator('#na-attach-initials').fill('E.C.');
 const continueButton = page.getByRole('button',{name:'Continue to write',exact:false}).first();
 if (await continueButton.isVisible()) await continueButton.click();
 await page.waitForTimeout(250);
 await page.locator('.clinical-workspace').screenshot({path:'frontend/public/auricwell/examples/note-editor.png'});
 assert.equal(errors.length,0,JSON.stringify(errors));
 console.log(JSON.stringify({errors,requests:requests.map(r=>r.path)}));
} finally {await browser.close();}
