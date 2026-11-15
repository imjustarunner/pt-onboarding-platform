import { chromium } from '../../node_modules/playwright/index.mjs';
import { writeFile, unlink, mkdir } from 'node:fs/promises';
import assert from 'node:assert/strict';
const base=process.env.AURICWELL_PREVIEW_URL||'http://127.0.0.1:5198';
const entry='frontend/auricwell-schedule-updates-capture.html',output='frontend/public/auricwell/examples';
const rules=[{id:'72h',channels:['email'],offsetMinutes:4320,message:'',askConfirmation:true},{id:'24h',channels:['email','sms'],offsetMinutes:1440,message:'',askConfirmation:true},{id:'2h',channels:['email','sms'],offsetMinutes:120,message:'',askConfirmation:true}];
const agency={id:7,name:'Example Therapy Practice',slug:'example-practice',organization_type:'agency'};
const actor={id:901,role:'admin',first_name:'Avery',last_name:'Lane',agencyIds:[7],agencies:[agency]};
const settings={reminderRules:rules,platform:{channels:{email:'available',sms:'consent_required',in_app:'available'}},channelsEnabled:{email:true,sms:true,in_app:true}};
const job={id:'example-26-session-series',status:'processing',phase:'saving',completed:7,total:26};
const plan={id:17,documentKey:'attendance-verification',version:1,currentVersion:1,clientId:71,agencyId:7,contentHash:'a'.repeat(64),branding:{name:agency.name},template:{key:'attendance-verification',title:'Appointment letter',sections:[]},data:{personLabel:'Morgan Example',letterType:'Scheduled appointment',appointmentDate:'2026-11-29',startTime:'11:00',endTime:'12:00',timezone:'America/Denver',location:'Example Springs office · Office #10',issuerName:'Avery Lane',issuerTitle:'Licensed provider',contactPhone:'(303) 555-0100'},signers:[{id:9,kind:'clinician',userId:901,name:'Avery Lane',signedAt:'2026-11-14T20:00:00Z',evidence:{name:'Avery Lane'}}]};
const browser=await chromium.launch({channel:'chrome',headless:true});const page=await browser.newPage({viewport:{width:1100,height:1300},timezoneId:'America/Denver'}),errors=[],writes=[];
page.on('pageerror',error=>errors.push(error.message));
await page.route('**/*',async route=>{
 const request=route.request(),url=new URL(request.url());
 if(!url.pathname.startsWith('/api/'))return url.origin===base?route.continue():route.abort();
 if(request.method()!=='GET'){writes.push(url.pathname);return route.fulfill({status:403,contentType:'application/json',body:'{"error":{"message":"Example capture: writes disabled"}}'});}
 const path=url.pathname.slice(4);let data={};
 if(path==='/clients/71/guardians')data=[{guardian_user_id:902,access_enabled:1,relationship_type:'parent',first_name:'Jordan',last_name:'Example'}];
 else if(path==='/clients/71/agency-affiliations')data=[{agency_id:7,agency_name:agency.name}];
 else if(path.endsWith('/session-notifications/my-default'))data={rules:null};
 else if(path.endsWith('/session-notifications'))data={settings};
 else if(path.endsWith('/timeline'))data={timeline:[
  {id:'reply-1',direction:'inbound',category:'replies',channel:'email',kind:'notification_reply',bodyPreview:'Thank you. We will arrive a few minutes early.',createdAt:'2026-11-14T19:15:00Z',metadata:{deliveryStatus:'received',actionStatus:'review'}},
  {id:'manual-1',direction:'outbound',category:'notifications',channel:'sms',kind:'Manual reminder',createdAt:'2026-11-14T19:10:00Z',metadata:{deliveryStatus:'skipped',reason:'The recipient opted out of this channel.'}},
  {id:'email-1',direction:'outbound',category:'notifications',channel:'email',kind:'Scheduled reminder',bodyPreview:'Your upcoming appointment is scheduled for Sunday at 11 AM. Please confirm your attendance.',createdAt:'2026-11-14T19:00:00Z',metadata:{deliveryStatus:'sent',sentAt:'2026-11-14T19:00:00Z',recipient:'jordan@example.test'}}]};
 else if(path.startsWith('/secure-session-comments/'))data={comments:[{id:41,body:'Please review the practice worksheet before the next visit.',text:'Please review the practice worksheet before the next visit.',createdAt:'2026-11-14T19:20:00Z',authorName:'Avery Lane',authorLabel:'Avery Lane'}],hasMore:false};
 else if(path==='/office-schedule/booking-jobs')data={jobs:[job]};
 else if(path.startsWith('/office-schedule/booking-jobs/'))data={job};
 else if(path==='/clinical-forms/template')data={template:plan.template,branding:plan.branding,client:{id:71,agencyId:7,name:'Morgan Example'},prefill:plan.data};
 else if(path==='/clinical-forms')data={plans:[{id:17,documentKey:'attendance-verification',appointment:{eventType:'provider',eventId:88}}]};
 else if(path==='/clinical-forms/17')data=plan;
 else if(path==='/clinical-forms/17/attendance-delivery')data={recipients:[{key:'user:902',kind:'guardian',name:'Jordan Example',email:'jordan@example.test',phone:'+13035550101',channels:{email:true,portal:true,sms:true},reasons:{}}],deliveries:[],sender:{from:'+13035550100'}};
 await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(data)});
});
try{
 plan.signers[0].evidence.signature=await page.evaluate(()=>{const canvas=document.createElement('canvas');canvas.width=320;canvas.height=70;const ctx=canvas.getContext('2d');ctx.font='italic 30px Georgia';ctx.fillStyle='#234155';ctx.fillText('Example signature',10,45);return canvas.toDataURL('image/png');});
 await mkdir(output,{recursive:true});
 await writeFile(entry,`<!doctype html><html lang="en"><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="margin:0;background:#f5f8fb"><div id="capture"></div><script type="module">
 import {createApp,h,ref} from 'vue';import {createPinia} from 'pinia';import {createRouter,createMemoryHistory} from 'vue-router';
 import {useAuthStore} from '/src/store/auth.js';import {useAgencyStore} from '/src/store/agency.js';
 import Info from '/src/components/schedule/AppointmentInfoPanel.vue';import Reminders from '/src/components/schedule/AppointmentReminderSettings.vue';import Communications from '/src/components/schedule/AppointmentCommunicationsPanel.vue';import Jobs from '/src/components/schedule/ScheduleBookingJobs.vue';import Letter from '/src/components/schedule/AppointmentAttendanceLetter.vue';import '/src/style.css';import '/src/styles/data-surfaces.css';
 const pinia=createPinia(),router=createRouter({history:createMemoryHistory(),routes:[{path:'/:organizationSlug/my-schedule',component:{template:'<div/>'}}]});await router.push('/example-practice/my-schedule');const showLetter=ref(false),rules=ref(${JSON.stringify(rules)});
 const section=(id,title,child)=>h('section',{id,style:'padding:22px;margin:20px;background:rgba(255,255,255,.94);border:1px solid #e1eaf1;border-radius:20px'},[h('h2',{style:'margin:0 0 16px;font-size:19px;color:#24445b'},title),child]);
 const app=createApp({render:()=>h('main',{},[
 section('info','Clinical session · Morgan Example',h(Info,{whenDateLabel:'Sunday, November 29, 2026',whenTimeLabel:'11 AM–12 PM · Mountain Time (MT)',statusLabel:'scheduled',modalityLabel:'In-person',agencyId:7,tenantLabel:'Example Therapy Practice',providerName:'Avery Lane',providerUserId:901,canOpenProvider:true,clientId:71,clientName:'Morgan Example',canOpenClient:true,serviceLabel:'90837 + 99051 · Individual psychotherapy (60 min)',locationLabel:'Example Springs office',roomLabel:'Office #10'})),
 section('reminders','Reminder choices',h(Reminders,{mode:'customizable',rules:rules.value,agencyId:7,showSave:true,'onUpdate:rules':value=>rules.value=value})),
 section('communications','Session communication history',h(Communications,{appointmentId:104,clientId:71})),
 section('progress','My schedule',h('div',{},[h(Jobs,{actorUserId:901}),h('p',{style:'color:#647b8b;font-size:13px;padding:8px 12px'},'Your calendar remains available while the accepted series is saved.')])),
 h('button',{id:'show-letter',onClick:()=>showLetter.value=true},'Open appointment letter'),showLetter.value?h(Letter,{eventType:'provider',eventId:88,onClose:()=>showLetter.value=false}):null
 ])});app.use(pinia);app.use(router);useAuthStore().user=${JSON.stringify(actor)};useAgencyStore().currentAgency=${JSON.stringify(agency)};useAgencyStore().agencies=[${JSON.stringify(agency)}];app.mount('#capture');
 </script></body></html>`);
 await page.goto(`${base}/auricwell-schedule-updates-capture.html`);
 await page.locator('#info .aip-link').filter({hasText:'Jordan Example'}).waitFor();
 await page.locator('#reminders .reminder-rule').nth(2).waitFor();
 await page.locator('#communications ol>li').nth(3).waitFor();
 await page.locator('#progress progress').waitFor();
 await page.evaluate(()=>document.fonts.ready);
 for(const [id,file] of [['info','session-info'],['reminders','session-reminders'],['communications','session-communications'],['progress','session-booking-progress']])await page.locator(`#${id}`).screenshot({path:`${output}/${file}-20261114.png`});
 await page.getByRole('button',{name:'Open appointment letter',exact:true}).click();
 await page.getByRole('button',{name:'Send selected copies',exact:true}).waitFor();
 await page.locator('.letter-channels input[value="email"]').check();await page.locator('.letter-channels input[value="sms"]').check();await page.locator('.letter-check input').check();
 await page.locator('.attendance-letter-dialog').screenshot({path:`${output}/session-letter-20261114.png`});
 assert.deepEqual(errors,[]);assert.deepEqual(writes,[]);console.log(JSON.stringify({ok:true,captures:5,pageErrors:errors,backendWrites:writes}));
}catch(error){console.error(JSON.stringify({pageErrors:errors,backendWrites:writes,letter:await page.locator('.attendance-letter-dialog').innerText().catch(()=>null)}));throw error;}finally{await browser.close();await unlink(entry).catch(()=>{});}
