// Compile the real workspace and rehearse with fictional data and an in-memory API.
// Never use a real account, application API or email delivery in this rehearsal.
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {parseArgs} from 'node:util';
import {build} from 'vite';
import vue from '@vitejs/plugin-vue';
import {chromium} from 'playwright';
import {TRANSITION_PRACTICES,transitionTaskCatalog,transitionVideoCatalog,emptyTransitionState} from '../../backend/src/content/transitionWeek.js';
const {values}=parseArgs({options:{out:{type:'string'}}});
if(!values.out)throw Error('Specify --out for the fictional verification artifacts.');
const out=path.resolve(values.out),root=fileURLToPath(new URL('..',import.meta.url));
const scratch=await fs.mkdtemp(path.join(os.tmpdir(),'transition-workspace-browser-'));
let server,browser;
try{
 await fs.mkdir(out,{recursive:true});
 const people=['Alex Example','Blair Example','Casey Example','Drew Example','Emery Example','Finley Example','Gray Example','Harper Example','Indigo Example','Jules Example','Kai Example'].map((name,i)=>({id:i+1,name,providerId:i+1,rank:i+1,cohort:Math.floor(i/5)+1,directCreditHours:(i+1)*3.25,totalCreditHours:(i+1)*4,currentTierCredits:(i+1)*3.25,serviceEntries:i+1,payrollUnits:(i+1)*2}));
 const boards=Object.fromEntries([2,6,377].map(id=>[id,{revision:0,week:'2026-11-16',practice:TRANSITION_PRACTICES.find(p=>p.id===id),catalog:transitionTaskCatalog(id),videoCatalog:transitionVideoCatalog(id),removedVideos:[],state:{...emptyTransitionState(),...(id===2?{ranking:{sourceType:'payroll-last-three-v1',key:'fictional-payroll',rows:people}}:{})}}]));
 const fixture=`import {validateTransitionState} from ${JSON.stringify(fileURLToPath(new URL('../../backend/src/utils/transitionWeekPolicy.js',import.meta.url)))};
 const boards=${JSON.stringify(boards)},people=${JSON.stringify(people)},practices=${JSON.stringify([TRANSITION_PRACTICES[1],TRANSITION_PRACTICES[0],TRANSITION_PRACTICES[2]])};
 let events=[];const copy=v=>JSON.parse(JSON.stringify(v));window.__calls=[];
 export default {
 async get(url,options={}){window.__calls.push({method:'get',url});const id=options.params?.agencyId||2;
  if(url.endsWith('/practices'))return {data:{practices}};
  if(url.endsWith('/roster'))return {data:{people,staff:[...people,{id:99,name:'Example Coordinator'}],payroll:{description:'Fictional payroll: September 26–October 9, October 10–23, October 24–November 6',periods:[{id:3},{id:2},{id:1}],excludedWithoutActivity:2}}};
  if(url.endsWith('/clients'))return {data:{clients:[{id:81,name:'Fictional client A',status:'ACTIVE',nextAppointmentAt:'2026-11-23T18:00:00Z'},{id:82,name:'Fictional client B',status:'DISCHARGED',nextAppointmentAt:null}]}};
  if(url.endsWith('/meetings'))return {data:{events}};
  if(url.endsWith('/participants'))return {data:{participants:people.slice(0,5).map((p,i)=>({...p,rsvp:i===0?'accepted':'pending'}))}};
  if(url.endsWith('/transition-week'))return {data:copy(boards[id])};
  throw Error('Unexpected fictional read: '+url);
 },
 async put(url,input){window.__calls.push({method:'put',action:input.action});let b=boards[input.agencyId];if(input.revision!==b.revision)throw Error('Stale revision');
  if(input.action==='save')b.state=validateTransitionState(input.state,b.state,input.agencyId,1);
  if(input.action==='workspace_item'){const old=b.state.workspace[input.kind][input.key]||{},patch=input.patch; b.state.workspace[input.kind][input.key]={...old,...patch,checks:{...old.checks,...Object.fromEntries(Object.entries(patch.checks||{}).map(([k,done])=>[k,{done,at:new Date().toISOString(),by:1}]))}};}
  if(input.action==='link_meeting'){const bucket=b.state.workspace[input.kind];bucket[input.key]={...bucket[input.key],meetingIds:[input.eventId]};}
  if(input.action==='video'){
    if(input.operation==='remove'){const v=b.videoCatalog.find(v=>v.id===input.id);b.removedVideos.push(v);b.videoCatalog=b.videoCatalog.filter(v=>v.id!==input.id);}
    if(input.operation==='restore'){b.videoCatalog.push(b.removedVideos.find(v=>v.id===input.id));b.removedVideos=b.removedVideos.filter(v=>v.id!==input.id);}
    if(input.operation==='add'){const v={id:'custom_example',title:input.title,outcome:input.outcome,dueDate:input.dueDate};b.videoCatalog.push(v);b.state.videos[v.id]={status:'not_started',owner:'',reviewer:'',url:'',evidence:'',nextAction:'',dueDate:input.dueDate};}
  }
  b.revision++;return {data:copy(b)};
 },
 async post(url,input){window.__calls.push({method:'post',url});if(url==='/team-meetings/training'){events=[{id:900,title:input.title,start_at:input.sessions[0].startAt}];return {data:{events,delivery:{failed:0}}};}throw Error('Unexpected fictional write');}
 };`;
 const entry=path.join(scratch,'entry.js');
 await fs.writeFile(entry,`import {createApp} from 'vue';import {createRouter,createMemoryHistory} from 'vue-router';import View from ${JSON.stringify(path.join(root,'src/views/PracticeTransitionView.vue'))};const router=createRouter({history:createMemoryHistory(),routes:[{path:'/practice-transition',component:View},{path:'/auricwell-operations',component:{template:'<p>Practice operations</p>'}}]});await router.push('/practice-transition');createApp(View).use(router).mount('#app');`);
 const bundle=path.join(scratch,'bundle');
 await build({root,configFile:false,logLevel:'error',plugins:[vue(),{name:'fictional-transition-workspace',enforce:'pre',resolveId(id){if(/services\/api(?:\.js)?$/.test(id))return '\0fictional-api';if(/store\/auth(?:\.js)?$/.test(id))return '\0fictional-auth';if(id.endsWith('/AuricWellTransitionWorkbench.vue'))return '\0fictional-tools';if(id.endsWith('/EmailComposerView.vue'))return '\0fictional-email';},load(id){if(id==='\0fictional-api')return fixture;if(id==='\0fictional-auth')return 'export const useAuthStore=()=>({user:{id:1,role:"admin"}})';if(id==='\0fictional-tools')return 'export default {template:"<p>Existing records and scheduling tools (not exercised in this fixture).</p>"}';if(id==='\0fictional-email')return 'export default {template:"<p>Email draft (no delivery in this fixture).</p>"}';}}],resolve:{alias:[{find:'vue',replacement:path.join(root,'node_modules/vue/dist/vue.runtime.esm-bundler.js')},{find:'vue-router',replacement:path.join(root,'node_modules/vue-router/dist/vue-router.mjs')}]},define:{'process.env.NODE_ENV':'"production"',__VUE_OPTIONS_API__:true,__VUE_PROD_DEVTOOLS__:false,__VUE_PROD_HYDRATION_MISMATCH_DETAILS__:false},build:{target:'esnext',outDir:bundle,emptyOutDir:true,copyPublicDir:false,cssCodeSplit:false,rollupOptions:{input:entry,output:{entryFileNames:'app.js',format:'es'}}}});
 const assets=await fs.readdir(path.join(bundle,'assets'));const css=assets.filter(f=>f.endsWith('.css')).map(f=>`<link rel="stylesheet" href="/assets/${f}">`).join('');
 const html=`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Fictional transition workspace</title>${css}<style>body{margin:0;font-family:system-ui,sans-serif}#fixture{padding:8px 20px;background:#fff3cf;color:#634a18;font-size:12px;text-align:center}</style><div id="fixture">Fictional review · synthetic names only · no real API requests or emails</div><div id="app"></div><script type="module" src="/app.js"></script></html>`;
 const requests=[];
 server=http.createServer(async(req,res)=>{try{const pathname=new URL(req.url,'http://localhost').pathname;requests.push(pathname);if(pathname==='/'){res.setHeader('Content-Type','text/html');res.end(html);return;}if(!/^\/(?:app\.js|assets\/[a-zA-Z0-9_.-]+\.(?:css|js))$/.test(pathname)){res.statusCode=404;res.end();return;}res.setHeader('Content-Type',pathname.endsWith('.css')?'text/css':'application/javascript');res.end(await fs.readFile(path.join(bundle,pathname)));}catch{res.statusCode=500;res.end();}});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const origin=`http://127.0.0.1:${server.address().port}`;
 browser=await chromium.launch({channel:'chrome',headless:true});const page=await browser.newPage({viewport:{width:1440,height:1050}}),errors=[],blocked=[];
 page.on('pageerror',e=>errors.push(e.message));await page.route('**/*',route=>{if(new URL(route.request().url()).origin!==origin){blocked.push(route.request().url());return route.abort();}return route.continue();});
 await page.goto(origin);await page.getByRole('heading',{name:'Move together, five at a time.'}).waitFor();await page.locator('.tw-person-open strong').getByText('Alex Example',{exact:true}).waitFor();
 assert.equal(await page.locator('.tw-practices [aria-current=page]').innerText(),'ITSCO');assert.equal(await page.locator('.tw-person').count(),5);assert.equal(await page.locator('.tw-group-nav button').count(),3);
 await page.screenshot({path:path.join(out,'workspace-desktop.png')});
 await page.locator('.tw-ranking summary').click();assert.ok((await page.locator('.tw-ranking').innerText()).includes('2 providers with no activity excluded'));assert.equal(await page.locator('.tw-ranking input').count(),0);await page.locator('.tw-ranking summary').click();
 const firstCard=page.getByRole('article',{name:'Alex Example',exact:true}),secondCard=page.getByRole('article',{name:'Blair Example',exact:true});
 const person=firstCard.getByRole('form',{name:'Transition checklist for Alex Example'});
 assert.equal(await person.getByRole('checkbox').count(),9);assert.ok(await person.getByLabel('Responsible person').isVisible());
 await person.getByLabel('Responsible person').selectOption('99');await person.getByLabel('Due date').fill('2026-11-24');await person.getByLabel('All client records transferred and checked').check();await person.getByLabel('Google access shut off and verified').check();await person.getByRole('button',{name:'Save provider checklist'}).click();await person.getByText('Checklist saved').waitFor();
 const second=secondCard.getByRole('form',{name:'Transition checklist for Blair Example'});await second.getByLabel('Responsible person').selectOption('2');await second.getByRole('button',{name:'Save provider checklist'}).click();await second.getByText('Checklist saved').waitFor();
 assert.ok(await person.getByLabel('Google access shut off and verified').isChecked());assert.equal(await second.getByLabel('Google access shut off and verified').isChecked(),false);
 await page.getByRole('button',{name:'Refresh',exact:true}).click();await firstCard.getByText('2/9 steps done',{exact:false}).waitFor();assert.equal(await person.getByLabel('Responsible person').inputValue(),'99');assert.equal(await second.getByLabel('Responsible person').inputValue(),'2');
 await firstCard.scrollIntoViewIfNeeded();await page.screenshot({path:path.join(out,'provider-controls-desktop.png')});
 await firstCard.getByRole('button',{name:'View clients',exact:true}).click();await firstCard.getByText('Fictional client A',{exact:false}).waitFor();
 await page.locator('.tw-client-list details').first().locator('summary').click();const client=page.locator('.tw-client-list details').first();await client.getByLabel('Bring records up to date',{exact:true}).selectOption('1');await client.getByLabel('Schedule sessions',{exact:true}).selectOption('2');await client.getByLabel('Client information and care plan up to date').check();await client.getByRole('button',{name:'Save checklist'}).click();await client.getByText('Checklist saved').waitFor();
 await page.getByRole('button',{name:'Schedule / invite this group'}).click();await page.getByRole('dialog').getByLabel('Date',{exact:true}).fill('2026-11-24');await page.getByRole('button',{name:'Create meeting & email invitations'}).click();await page.getByText('Meeting saved and linked.',{exact:false}).waitFor();await page.getByRole('button',{name:'Done',exact:true}).click();
 await page.locator('.tw-group-checks > summary').click();await page.getByText('Attending',{exact:true}).waitFor();await page.locator('.tw-group-checks > summary').click();
 await page.getByRole('button',{name:/Training videos/}).click();await page.getByRole('heading',{name:'Show people how to do it'}).waitFor();await page.getByRole('button',{name:'+ Add a video'}).click();await page.locator('.tw-video-form').getByLabel('Title',{exact:true}).fill('Example: bring clients up to date');await page.getByRole('button',{name:'Add to the list'}).click();await page.getByRole('heading',{name:'Example: bring clients up to date'}).waitFor();
 const last=page.locator('.tw-video-row').last();await last.locator('summary').click();await last.getByRole('button',{name:'Remove from this practice’s list'}).click();assert.equal(await page.getByRole('heading',{name:'Example: bring clients up to date'}).count(),0);
 await page.evaluate(()=>window.scrollTo(0,0));await page.screenshot({path:path.join(out,'training-desktop.png')});
 await page.getByRole('button',{name:/Groups & clients/}).click();await page.setViewportSize({width:390,height:844});await firstCard.getByRole('button',{name:'Hide clients',exact:true}).click();await firstCard.scrollIntoViewIfNeeded();assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));await page.screenshot({path:path.join(out,'workspace-phone.png')});
 await page.getByRole('button',{name:'Inner Strength',exact:true}).click();await page.getByRole('heading',{name:'Get everyone ready for the move.'}).waitFor();assert.equal(await page.locator('.tw-practices [aria-current=page]').innerText(),'Inner Strength');assert.equal(await page.locator('.tw-person-detail').count(),0);
 assert.deepEqual(errors,[]);assert.deepEqual(blocked,[]);assert.equal(requests.some(p=>p.startsWith('/api')),false);
 await fs.writeFile(path.join(out,'browser-verification.json'),JSON.stringify({fictionalDataOnly:true,realApiRequests:0,realEmails:0,pageErrors:errors,checks:['ITSCO default','three-practice scope','named five/five/one groups','automatic payroll provider ranking without manual counts','visible per-provider owner and all nine checkboxes','independent provider saves and reload','client details inside the provider card','separate client records and schedule owners','saved client checkbox','reviewed invitation creation','group RSVP display','video add/remove','390px no overflow','practice switch clears prior client'],requests},null,2)+'\n');
 console.log('Workspace desktop/phone rehearsal passed. No real API requests, emails or account use.');
}catch(error){if(browser){const pages=browser.contexts().flatMap(c=>c.pages());if(pages[0]){await pages[0].screenshot({path:path.join(out,'failure.png'),fullPage:false});console.error((await pages[0].locator('body').innerText()).slice(0,1800));}}throw error;}
finally{if(browser)await browser.close();if(server)await new Promise(resolve=>server.close(resolve));await fs.rm(scratch,{recursive:true,force:true});}
