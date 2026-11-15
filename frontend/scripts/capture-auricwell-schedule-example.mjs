import { chromium } from '../../node_modules/playwright/index.mjs';
import { writeFile, unlink, mkdir } from 'node:fs/promises';
import assert from 'node:assert/strict';
const base = process.env.AURICWELL_PREVIEW_URL || 'http://127.0.0.1:5198';
const entry = 'frontend/auricwell-capture.html';
const output = 'frontend/public/auricwell/examples';
const agency = {id:7,name:'Example Therapy Practice',slug:'example-practice',organization_type:'agency',feature_flags:{clinicalNoteGeneratorEnabled:true}};
const actor = {id:901,role:'provider',first_name:'Avery',last_name:'Lane',agencyIds:[7],agencies:[agency]};
const scheduleEvents = [];
for (let day=16;day<=20;day++) for (const [index,hour] of [9,11,14].entries()) {
  scheduleEvents.push({id:day*100+hour,userId:901,agencyId:7,kind:'PERSONAL_EVENT',clientId:71+index,appointmentStatus:index===0?'client_confirmed':'scheduled',reasonCode:'CLIENT_SESSION',title:`${['E.C.','M.R.','J.S.'][index]} · Individual therapy`,startAt:`2026-11-${String(day).padStart(2,'0')}T${String(hour).padStart(2,'0')}:00:00-07:00`,endAt:`2026-11-${String(day).padStart(2,'0')}T${String(hour).padStart(2,'0')}:50:00-07:00`,status:'scheduled',modality:day%2?'VIRTUAL':'IN_PERSON'});
}
scheduleEvents.push({id:8899,userId:901,agencyId:7,kind:'PERSONAL_EVENT',clientId:71,appointmentStatus:'canceled_by_provider',reasonCode:'CLIENT_SESSION',title:'E.C. · Individual therapy',startAt:'2026-11-19T16:00:00-07:00',endAt:'2026-11-19T17:00:00-07:00',status:'canceled',modality:'IN_PERSON'});
const summary = {weekStart:'2026-11-16',agencyId:7,scheduleAgencyIds:[7],scheduleEvents,officeEvents:[],schoolAssignments:[],schoolRequests:[],officeRequests:[],supervisionSessions:[],googleBusy:[],googleEvents:[],externalBusy:[],virtualWorkingHours:[]};
const browser = await chromium.launch({headless:true,channel:'chrome'});
const page = await browser.newPage({viewport:{width:1440,height:1050},timezoneId:'America/Denver'});
const errors=[],requests=[];
page.on('pageerror',error=>errors.push(error.message));
await page.route('**/*',async route=>{
 const request=route.request(),url=new URL(request.url());
 if(!url.pathname.startsWith('/api/'))return url.origin===base ? route.continue() : route.abort();
 requests.push(url.pathname);
 // Read-only local fixtures only. Nothing reaches the backend.
 if(request.method()!=='GET')return route.fulfill({status:403,contentType:'application/json',body:'{"error":{"message":"Capture only: writes disabled"}}'});
 const path=url.pathname.slice(4);
 let data={};
 if(path.endsWith('/booking-access'))data={enabled:true};
 else if(path==='/weather/me')data={status:'ok',location:{label:'Colorado Springs, CO',source:'home'},forecastDays:Array.from({length:7},(_,i)=>({date:`2026-11-${16+i}`,tempMaxF:[48,34,31,42,46,50,51][i],tempMinF:25,snowfallInches:[0,2.4,0.6,0,0,0,0][i],weatherCode:[0,73,85,2,1,0,2][i],precipitationProbability:i===1?80:10}))};
 else if(path.endsWith('/schedule-summary'))data=summary;
 else if(path.endsWith('/virtual-session-clients'))data={clients:[{id:71,displayName:'Example Client',initials:'E.C.'},{id:72,displayName:'Sample Client',initials:'M.R.'}],guardians:[]};
 else if(path==='/office-schedule/booking-metadata')data={serviceCodes:[{code:'90834',label:'Individual psychotherapy',durationMinutes:50}],serviceLocations:[{id:11,name:'Telehealth',placeOfService:'10'}],appointmentTypes:[],appointmentSubtypes:[]};
 else if(path==='/auth/me')data={user:actor,agencies:[agency]};
 else if(path==='/users/901')data=actor;
 else if(path.includes('/agencies'))data=[agency];
 else if(path.includes('/users')||path.includes('/providers'))data=[];
 else if(path.includes('locations')||path.includes('offices')||path.includes('calendar-connections'))data=[];
 else if(path.includes('clients'))data={clients:[{id:71,initials:'E.C.',full_name:'Example Client',agency_id:7}]};
 await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(data)});
});
try {
 await mkdir(output,{recursive:true});
 await writeFile(entry,`<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="margin:0;padding:24px;background:#fff"><div id="capture"></div><script type="module">
 import {createApp,h} from 'vue';import {createPinia} from 'pinia';import {createRouter,createMemoryHistory} from 'vue-router';
 import {useAuthStore} from '/src/store/auth.js';import {useAgencyStore} from '/src/store/agency.js';
 import Schedule from '/src/components/schedule/ScheduleAvailabilityGrid.vue';import '/src/style.css';import '/src/styles/data-surfaces.css';import '/src/styles/application-appearance.css';
 sessionStorage.setItem('sched_office_reminder_seen','1');localStorage.setItem('schedule.overlayPrefs.v2:901:7',JSON.stringify({rowHeightMode:'normal',hideWeekend:false,spanMode:'week'}));const pinia=createPinia();const router=createRouter({history:createMemoryHistory(),routes:[{path:'/:organizationSlug/my-schedule',component:{template:'<div/>'}}]});
 await router.push('/example-practice/my-schedule');
 const app=createApp({render:()=>h(Schedule,{userId:901,agencyId:7,weekStartYmd:'2026-11-16',compactPageChrome:true,scheduleTitle:'My Schedule',showCompanyEventsCalendarButton:false,showSkillBuildersProgramsButton:false})});
 app.use(pinia);app.use(router);useAuthStore().user=${JSON.stringify(actor)};useAgencyStore().currentAgency=${JSON.stringify(agency)};useAgencyStore().agencies=[${JSON.stringify(agency)}];app.mount('#capture');
 </script></body></html>`);
 await page.goto(`${base}/auricwell-capture.html`);
 await page.locator('.sched-wrap').waitFor({timeout:60000});
 await page.getByText('E.C. · Individual therapy',{exact:false}).first().waitFor({timeout:30000});
 await page.evaluate(()=>document.fonts.ready);
 await page.locator('.schedule-day-weather').filter({hasText:'Snow 2.4'}).first().waitFor();
 assert.equal(await page.locator('.sched-head-cell-day .schedule-day-weather').count(),7);
 assert((await page.locator('.sched-head-cell-day .schedule-day-weather').allTextContents()).join(' ').includes('Snow 2.4'));
 await page.locator('.sched-wrap').screenshot({path:`${output}/schedule-week-20261114.png`});
 await page.setViewportSize({width:1440,height:1550});
 await page.getByRole('button',{name:'Book session',exact:true}).click();
 await page.waitForTimeout(500);
 const dialogs=page.getByRole('dialog');
 assert(await dialogs.count()>0,'The actual booking dialog should open');
 const dialog=dialogs.last();
 await dialog.getByLabel('Appointment date',{exact:true}).fill('2026-11-17');
 await dialog.locator('input[type=time]').nth(0).fill('10:00');
 await dialog.locator('input[type=time]').nth(1).fill('10:50');
 const service=dialog.locator('select').filter({has:page.locator('option[value="90834"]')}).first();
 const client=dialog.locator('select').filter({has:page.locator('option[value="71"]')}).first();
 if(await service.count())await service.selectOption('90834');
 if(await client.count())await client.selectOption('71');
 await dialog.locator('.nr-title').click();
 await dialog.getByLabel('Appointment date',{exact:true}).scrollIntoViewIfNeeded();
 await dialog.screenshot({path:`${output}/session-booking-20261114.png`});


 assert.deepEqual(errors,[]);
 console.log(JSON.stringify({ok:true,interceptedRequests:[...new Set(requests)]}));
} catch(error) {
 console.error(JSON.stringify({errors,requests:[...new Set(requests)],text:(await page.locator('body').innerText()).slice(0,5000)}));
 throw error;
} finally { await browser.close(); await unlink(entry).catch(()=>{}); }
