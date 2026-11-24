// Offline/synthetic email preview only. This script has no live app, email,
// Workspace, payroll, or provisioning adapter.
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {parseArgs} from 'node:util';
import {prepareTransitionSequence,meetingCreationManifest,remainingMeetingOptions} from '../../backend/src/services/transitionMeetingSequencePolicy.js';
import {transitionSequenceEmail} from '../../backend/src/content/transitionMeetingSequenceEmail.js';
const {values}=parseArgs({options:{out:{type:'string'},screenshots:{type:'boolean'}}});
if(!values.out)throw Error('Specify --out for synthetic preview artifacts.');
const out=path.resolve(values.out);await fs.mkdir(out,{recursive:true});
const draft=JSON.parse(await fs.readFile(new URL('../../docs/operations/transition-meetings-2026-11-24/launch-request.json',import.meta.url),'utf8'));
const staff=Array.from({length:40},(_,i)=>({id:i+1,name:`Example Provider ${i+1}`,email:`provider${i+1}@example.test`,cellPhone:i===0?null:`+1303555${String(i+1).padStart(4,'0')}`}));
staff.push(...[91,92,93].map((id,i)=>({id,name:['Megan Example','Rachel Example','Michael Example'][i],email:`host${i}@example.test`})),{id:99,name:'Kimi Example',email:'kimi@example.test',cellPhone:null});
const input={...draft,hostIds:[91,92,93],coordinatorUserId:92,additionalGroupOneUserId:99,senderIdentityId:8,sundayLocation:'Windchime office (address verification pending)',readiness:Object.fromEntries(Object.keys(draft.readiness).map(k=>[k,true]))};
// Proof booleans above exist only in a synthetic fixture; do not write them back.
const plan=prepareTransitionSequence(input,{agencyId:2,staff,ranking:staff.filter(p=>p.id<=40).map((p,i)=>({providerId:p.id,cohort:Math.floor(i/5)+1}))},new Date('2026-11-24T07:00:00-07:00'));
const links={acceptedUrl:'https://example.invalid/preview-only/yes',declinedUrl:'https://example.invalid/preview-only/no',noneUrl:'https://example.invalid/preview-only/none',options:Object.fromEntries(['2','3','4','sunday'].map(v=>[v,`https://example.invalid/preview-only/option/${v}`]))};
const samples=[
 ['01-first-groups-1-3',{kind:'meeting_invitation',userId:1,meeting:1,initial:true}],
 ['02-first-groups-4-6',{kind:'meeting_invitation',userId:16,meeting:2,initial:true}],
 ['03-first-groups-7-8',{kind:'meeting_invitation',userId:31,meeting:3,initial:true}],
 ['04-makeup-second',{kind:'meeting_invitation',userId:1,meeting:2,initial:false}],
 ['05-makeup-third',{kind:'meeting_invitation',userId:1,meeting:3,initial:false}],
 ['06-final-fourth',{kind:'meeting_invitation',userId:1,meeting:4,initial:false}],
 ['07-cannot-make-it',{kind:'alternatives_email',userId:1,meeting:1,options:remainingMeetingOptions(plan,1,new Date('2026-11-24T07:00:00-07:00'))}],
 ['08-preference-recorded',{kind:'choice_acknowledgement',userId:1,option:'3'}],
 ['09-after-fourth',{kind:'final_missed_email',userId:1}],
 ['10-video-route',{kind:'video_followup',userId:1}],
 ['11-rachel-roster',{kind:'rachel_roster_report',userId:92,meeting:1,people:plan.providers.filter(p=>p.initialMeeting===1)}],
 ['12-rachel-missed',{kind:'rachel_missed_report',userId:92,meeting:1,people:plan.providers.slice(0,2).map(p=>({...p,rsvp:'declined'}))}]
];
for(const [name,action] of samples){const m=transitionSequenceEmail(plan,action,links);await fs.writeFile(path.join(out,`${name}.html`),m.html.replace('<body ', '<body data-preview="synthetic-not-sent" '));await fs.writeFile(path.join(out,`${name}.txt`),`SYNTHETIC PREVIEW — NOT SENT — LINKS ARE INACTIVE\nSubject: ${m.subject}\nTo: ${m.to||m.toUserId}\nCC: ${m.cc.join(', ')}\nReply-To: ${m.replyTo}\n\n${m.text}\n`);}
await fs.writeFile(path.join(out,'meeting-manifest.synthetic.json'),JSON.stringify({syntheticOnly:true,actualInvitationsCreated:0,meetings:meetingCreationManifest(plan)},null,2)+'\n');
if(values.screenshots){
 const {chromium}=await import('playwright');const browser=await chromium.launch({channel:'chrome',headless:true});
 try{const page=await browser.newPage({viewport:{width:1000,height:1150}}),errors=[],external=[];page.on('pageerror',e=>errors.push(e.message));
  const logo=fileURLToPath(new URL('../public/auricwell/logo.png',import.meta.url));
  await page.route('**/*',async route=>{if(route.request().url()==='https://auricwell.com/auricwell/logo.png')return route.fulfill({path:logo});external.push(route.request().url());await route.abort();});
  await page.setContent(await fs.readFile(path.join(out,'01-first-groups-1-3.html'),'utf8'));await page.locator('img').evaluate(i=>i.decode());
  for(const label of ['I will be there','I can’t make it'])if(!await page.getByRole('link',{name:label}).isVisible())throw Error('RSVP link not visible.');
  await page.screenshot({path:path.join(out,'email-desktop.png'),fullPage:true});await page.setViewportSize({width:390,height:844});
  if(!await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1))throw Error('Email overflows the phone viewport.');
  await page.screenshot({path:path.join(out,'email-phone.png'),fullPage:true});
  await fs.writeFile(path.join(out,'browser-verification.json'),JSON.stringify({syntheticOnly:true,realRequests:0,emailsSent:0,external,errors,desktopAnd390px:'passed'},null,2)+'\n');
  if(errors.length||external.length)throw Error('Unexpected browser errors or external requests.');
 }finally{await browser.close();}
}
console.log('Generated synthetic email previews. Zero real invitations, messages, claims or inboxes created.');
