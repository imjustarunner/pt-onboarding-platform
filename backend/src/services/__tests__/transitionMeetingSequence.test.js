import {describe,expect,it} from 'vitest';
import {prepareTransitionSequence,newTransitionSequenceState,transitionSequenceEvent,meetingCreationManifest,remainingMeetingOptions,DEADLINES} from '../transitionMeetingSequencePolicy.js';
import {transitionSequenceEmail,parseTransitionReply,transitionReadinessReport,TRANSITION_TRAINING_AGENDA} from '../../content/transitionMeetingSequenceEmail.js';
const now=new Date('2026-11-24T15:00:00-07:00');
const hostIds=[91,92,93];
const staff=[...Array.from({length:40},(_,i)=>({id:i+1,name:`Example Provider ${i+1}`,email:`provider${i+1}@example.test`})),
 ...hostIds.map((id,i)=>({id,name:['Megan Example','Rachel Example','Michael Example'][i],email:`host${i}@example.test`})),{id:99,name:'Kimi Example',email:'kimi@example.test'}];
const snapshot={agencyId:2,staff,ranking:staff.filter(p=>p.id<=40).map((p,i)=>({providerId:p.id,cohort:Math.floor(i/5)+1}))};
const input=()=>({agencyId:2,hostIds,coordinatorUserId:92,additionalGroupOneUserId:99,senderIdentityId:8,replyTo:'transition@example.test',sundayLocation:'Windchime office — verified address',sundayEndAt:'2026-11-29T09:30:00-07:00',
 sessions:[['2026-11-25T09:00:00-07:00','2026-11-25T10:30:00-07:00'],['2026-11-25T14:00:00-07:00','2026-11-25T15:30:00-07:00'],['2026-11-27T09:00:00-07:00','2026-11-27T10:30:00-07:00'],['2026-11-27T14:00:00-07:00','2026-11-27T15:30:00-07:00']].map(([startAt,endAt])=>({startAt,endAt,modality:'video'})),
 readiness:Object.fromEntries(['senderApproved','replyInboxMonitored','inboundRoutingTested','rsvpEmailAndAppTested','hostCcTested','attendanceFinalizationTested','supportActivity18Tested','automationIdentityScoped'].map(k=>[k,true]))});
const plan=()=>prepareTransitionSequence(input(),snapshot,now);
const tick=(p,s,at=now)=>transitionSequenceEvent(p,s,{type:'tick'},new Date(at));
const invites=s=>Object.values(s.outbox).filter(a=>a.kind==='meeting_invitation');
const initial=p=>tick(p,newTransitionSequenceState(p));
function finalize(p,s,n,seconds={},at=p.sessions[n-1]?.endAt||p.sunday.endAt){
 const all=Object.fromEntries(Object.values(s.issued).filter(i=>i.meeting===n).map(i=>[i.userId,0]));
 return transitionSequenceEvent(p,s,{type:'attendance_finalized',meeting:n,allAttendanceSourcesReviewed:true,evidence:'Synthetic attendance and in-person register verified',seconds:{...all,...seconds}},new Date(at));
}
describe('launch preparation',()=>{
 it('freezes provider groups, adds Kimi to group 1, and creates four independent host-only meeting manifests',()=>{
  const p=plan(),m=meetingCreationManifest(p);expect(p.providers).toHaveLength(41);expect(p.providers.find(p=>p.userId===99)).toMatchObject({group:1,initialMeeting:1,explicitAddition:true});
  expect(m).toHaveLength(4);for(const e of m){expect(e.participants).toEqual(hostIds);expect(e.recurrenceSeriesId).toBeNull();expect(e.cc).toHaveLength(3);expect(e.participantCompensation.hourlyRate).toBe(18);}
 });
 it('moves Kimi out of an existing lower group without duplication or changing the payroll snapshot',()=>{
  const original=structuredClone(snapshot);original.ranking.push({providerId:99,cohort:8});const p=prepareTransitionSequence(input(),original,now);
  expect(p.providers.filter(p=>p.userId===99)).toHaveLength(1);expect(original.ranking.at(-1).cohort).toBe(8);
 });
 it.each(['senderApproved','replyInboxMonitored','inboundRoutingTested','rsvpEmailAndAppTested','hostCcTested','attendanceFinalizationTested','supportActivity18Tested','automationIdentityScoped'])('blocks launch without %s',key=>{
  const i=input();i.readiness[key]=false;expect(()=>prepareTransitionSequence(i,snapshot,now)).toThrow(key);
 });
 it('rejects missing times, wrong days, overlaps, past sessions, invalid host/Kimi and other practices',()=>{
  for(const edit of [i=>i.sessions[0].startAt=null,i=>i.sessions[0].startAt='2026-11-26T09:00:00-07:00',i=>i.sessions[1].startAt='2026-11-25T10:00:00-07:00',i=>i.hostIds=[91,92,999],i=>i.additionalGroupOneUserId=1000,i=>i.agencyId=6]){const i=input();edit(i);expect(()=>prepareTransitionSequence(i,snapshot,now)).toThrow();}
  expect(()=>prepareTransitionSequence(input(),snapshot,new Date('2026-11-26T00:00:00Z'))).toThrow('future');
 });
 it('binds every participant to the active practice snapshot and rejects duplicate ranks',()=>{
  expect(()=>prepareTransitionSequence(input(),{...snapshot,ranking:[...snapshot.ranking,{providerId:1,cohort:1}]},now)).toThrow('unique');
  expect(()=>prepareTransitionSequence(input(),{...snapshot,ranking:[{providerId:800,cohort:1}]},now)).toThrow('active');
 });
 it('uses the correct Sunday deadline and Monday cutover in Mountain time',()=>{
  expect(new Date(DEADLINES.notes).toISOString()).toBe('2026-11-30T05:00:00.000Z');expect(new Date(DEADLINES.cutoverStart).toISOString()).toBe('2026-11-30T07:00:00.000Z');expect(new Date(DEADLINES.cutoverEnd).toISOString()).toBe('2026-11-30T12:00:00.000Z');
 });
});
describe('conditional invitations',()=>{
 it('issues one first invitation to each assigned cohort and never invites everyone to all meetings',()=>{
  const p=plan(),s=initial(p);expect(invites(s).filter(i=>i.meeting===1)).toHaveLength(16);expect(invites(s).filter(i=>i.meeting===2)).toHaveLength(15);expect(invites(s).filter(i=>i.meeting===3)).toHaveLength(10);expect(invites(s).filter(i=>i.meeting===4)).toHaveLength(0);
  expect(invites(tick(p,s))).toHaveLength(41);expect(newTransitionSequenceState(p).outbox).toEqual({});
 });
 it('sends remaining choices immediately on No but waits until attendance is finalized to invite again',()=>{
  const p=plan();let s=initial(p);s=transitionSequenceEvent(p,s,{type:'rsvp',userId:1,meeting:1,response:'declined'},now);
  const options=Object.values(s.outbox).find(a=>a.kind==='alternatives_email');expect(options.options.map(o=>o.option)).toEqual(['2','3','4','sunday']);expect(invites(s).filter(i=>i.userId===1)).toHaveLength(1);
  s=tick(p,s,new Date(p.sessions[0].endAt));expect(invites(s).filter(i=>i.userId===1)).toHaveLength(1);
  s=finalize(p,s,1,{2:3600});expect(invites(s).filter(i=>i.userId===1).map(i=>i.meeting)).toEqual([1,2]);expect(invites(s).some(i=>i.userId===2&&i.meeting===2)).toBe(false);
 });
 it('does not issue early makeup invitations to nonresponders or accepted RSVPs',()=>{
  const p=plan();let s=initial(p);s=transitionSequenceEvent(p,s,{type:'rsvp',userId:1,meeting:1,response:'accepted'},now);
  expect(invites(tick(p,s,new Date(p.sessions[0].endAt))).filter(i=>i.meeting===2&&i.userId<=15)).toHaveLength(0);
  s=finalize(p,s,1,{});expect(invites(s).find(i=>i.userId===1&&i.meeting===2)).toBeDefined();
 });
 it('respects a selected later slot and acknowledges it before creating a new app invitation',()=>{
  const p=plan();let s=initial(p);s=transitionSequenceEvent(p,s,{type:'select_alternative',userId:1,fromMeeting:1,option:'3'},now);
  expect(Object.values(s.outbox).some(i=>i.kind==='choice_acknowledgement')).toBe(true);expect(invites(s).filter(i=>i.userId===1)).toHaveLength(1);
  s=finalize(p,s,1,{});expect(invites(s).filter(i=>i.userId===1).map(i=>i.meeting)).toEqual([1,3]);
 });
 it('replaces an unsent makeup invitation when a provider picks a different future slot',()=>{
  const p=plan();let s=finalize(p,initial(p),1,{});const old=invites(s).find(a=>a.userId===1&&a.meeting===2);
  s=transitionSequenceEvent(p,s,{type:'select_alternative',userId:1,fromMeeting:1,option:'3'},new Date(p.sessions[0].endAt));
  expect(s.outbox[old.key].status).toBe('cancelled_alternative');expect(s.issued['1:2'].withdrawn).toBe(true);expect(s.issued['1:3']).toBeDefined();
 });
 it('withdraws an already-created makeup appointment when an alternative changes, preserving the original delivery receipt',()=>{
  const p=plan();let s=finalize(p,initial(p),1,{});const old=invites(s).find(a=>a.userId===1&&a.meeting===2);
  s=transitionSequenceEvent(p,s,{type:'delivery_receipt',key:old.key,status:'created',reference:'Synthetic event invite'},new Date(p.sessions[0].endAt));
  s=transitionSequenceEvent(p,s,{type:'select_alternative',userId:1,fromMeeting:1,option:'3'},new Date(p.sessions[0].endAt));
  expect(Object.values(s.outbox).some(a=>a.kind==='withdraw_invitation'&&a.userId===1&&a.meeting===2)).toBe(true);expect(s.receipts[old.key].reference).toBe('Synthetic event invite');
 });
 it('skips a slot that passed while attendance was being reviewed and offers the next future slot',()=>{
  const p=plan();let s=finalize(p,initial(p),1,{},'2026-11-26T12:00:00-07:00');expect(invites(s).filter(i=>i.userId===1).map(i=>i.meeting)).toEqual([1,3]);
 });
 it('does not send a final email before the fourth meeting ends and all sources are checked',()=>{
  const p=plan();let s=initial(p);for(const n of [1,2,3])s=finalize(p,s,n,n===1?{1:60}:{});
  expect(Object.values(s.outbox).some(i=>i.kind==='final_missed_email')).toBe(false);
  s=finalize(p,s,4,{});expect(Object.values(s.outbox).some(i=>i.kind==='final_missed_email'&&i.userId===1)).toBe(false);expect(Object.values(s.outbox).some(i=>i.kind==='final_missed_email'&&i.userId===2)).toBe(true);
 });
 it('offers Sunday after the four meetings, keeps its invitation conditional, and preserves Monday readiness',()=>{
  const p=plan();let s=initial(p);s=transitionSequenceEvent(p,s,{type:'select_alternative',userId:1,fromMeeting:1,option:'sunday'},now);
  for(const n of [1,2,3,4])s=finalize(p,s,n,{});
  expect(invites(s).filter(i=>i.userId===1).map(i=>i.meeting)).toEqual([1,5]);
  const final=Object.values(s.outbox).find(i=>i.userId===1&&i.kind==='final_missed_email');expect(final.sunday.startAt).toBe('2026-11-29T15:00:00.000Z');
 });
 it('queues the video route and stops further meeting invitations when every option is declined',()=>{
  const p=plan();let s=transitionSequenceEvent(p,initial(p),{type:'none_available',userId:1},now);s=finalize(p,s,1,{});
  expect(invites(s).filter(i=>i.userId===1)).toHaveLength(1);expect(Object.values(s.outbox).filter(i=>i.userId===1&&i.kind==='video_followup')).toHaveLength(1);
 });
 it('cancels unsent follow-ups when late attendance is finalized positively',()=>{
  const p=plan();let s=initial(p);s=transitionSequenceEvent(p,s,{type:'rsvp',userId:1,meeting:1,response:'declined'},now);s=finalize(p,s,1,{1:600});
  expect(Object.values(s.outbox).find(i=>i.kind==='alternatives_email'&&i.userId===1).status).toBe('cancelled_attended');
 });
});
describe('attendance, claims and persistence',()=>{
 it('requires explicit reviewed absence including in-person attendees, rather than guessing from video logs',()=>{
  const p=plan(),s=initial(p);for(const patch of [{allAttendanceSourcesReviewed:false},{seconds:{}},{seconds:{1:999999}}])expect(()=>transitionSequenceEvent(p,s,{type:'attendance_finalized',meeting:1,allAttendanceSourcesReviewed:true,evidence:'Reviewed register',seconds:Object.fromEntries(Array.from({length:15},(_,i)=>[i+1,0])),...patch},new Date(p.sessions[0].endAt))).toThrow();
 });
 it('submits exact actual attendance at $18, excludes all three hosts, never fabricates scheduled hours or paid status',()=>{
  const p=plan();const s=finalize(p,initial(p),1,{1:1800,2:900,91:5400,92:5400,93:5400});
  const claims=Object.values(s.outbox).filter(a=>a.kind==='submit_time_claim');expect(claims).toHaveLength(2);expect(claims.find(c=>c.userId===1)).toMatchObject({minutes:30,hourlyRate:18,estimatedAmount:9,status:'pending'});expect(claims.find(c=>c.userId===2).estimatedAmount).toBe(4.5);
  expect(claims.some(c=>hostIds.includes(c.userId))).toBe(false);expect(claims[0]).not.toHaveProperty('submittedByUserId');
 });
 it('deduplicates restart ticks and repeated attendance, preserving the original state and claims',()=>{
  const p=plan(),old=initial(p);const s=finalize(p,old,1,{1:1800});const restored=JSON.parse(JSON.stringify(s));const again=finalize(p,restored,1,{1:1800});
  expect(Object.keys(again.outbox)).toEqual(Object.keys(s.outbox));expect(old.attendance).toEqual({});
  expect(()=>finalize(p,s,1,{1:60})).toThrow('correction');
 });
 it('rejects cross-recipient RSVP, past choices and changes to the frozen plan',()=>{
  const p=plan(),s=initial(p);expect(()=>transitionSequenceEvent(p,s,{type:'rsvp',userId:31,meeting:1,response:'accepted'},now)).toThrow('issued');
  expect(()=>transitionSequenceEvent(p,s,{type:'select_alternative',userId:1,fromMeeting:1,option:'2'},new Date('2026-11-26T00:00:00-07:00'))).toThrow('remaining');
  expect(()=>tick({...p,fingerprint:'changed'},s)).toThrow('frozen');
 });
 it('keeps uncertain/failed delivery for review and cannot overwrite a successful receipt',()=>{
  const p=plan();let s=initial(p);const key=invites(s)[0].key;s=transitionSequenceEvent(p,s,{type:'delivery_receipt',key,status:'review',reference:'Uncertain network result'},now);expect(s.outbox[key].status).toBe('review');
  s=transitionSequenceEvent(p,s,{type:'delivery_receipt',key,status:'created',reference:'Existing app event and invitation verified'},now);expect(()=>transitionSequenceEvent(p,s,{type:'delivery_receipt',key,status:'sent',reference:'Again'},now)).toThrow('immutable');
 });
 it('tracks client and next-week-session readiness for each actual appointment',()=>{
  const p=plan();let s=initial(p);expect(transitionReadinessReport(p,s,new Date(p.sessions[0].startAt)).find(r=>r.userId===1).overdue).toBe(true);
  s=transitionSequenceEvent(p,s,{type:'readiness',userId:1,clientsAndNextWeekSessionsVerified:true,evidence:'Existing caseload and next week reconciled'},now);expect(transitionReadinessReport(p,s).find(r=>r.userId===1).clientsAndSessionsVerified).toBe(true);
 });
});
describe('provider-facing emails and inbound choices',()=>{
 const links={acceptedUrl:'https://example.test/personal/yes',declinedUrl:'https://example.test/personal/no',options:{sunday:'https://example.test/personal/sunday'},noneUrl:'https://example.test/personal/none'};
 it('personalizes initial invitations, shows two RSVP choices, CCs the hosts and omits future times and pay',()=>{
  const p=plan(),s=initial(p);for(const action of invites(s)){
   const msg=transitionSequenceEmail(p,action,links);expect(msg.subject).toMatch(/^PLEASE READ THIS ENTIRE EMAIL — RSVP REQUIRED/);expect(msg.html).toContain('PLEASE READ THIS ENTIRE EMAIL — RSVP REQUIRED');expect(msg.buttons.map(b=>b.label)).toEqual(['I will be there','I can’t make it']);expect(msg.cc).toHaveLength(3);expect(msg.replyTo).toBe('transition@example.test');expect(msg.text).toContain('10 p.m.');expect(msg.text).toContain('Transitioned to AuricWell');expect(msg.text).not.toMatch(/\$18|payroll|Support Activity|Sunday.*8 a.m./);expect(msg.text).toContain('as soon as possible');
  }
 });
 it('uses different wording for makeup and final invitations and retains expectations',()=>{
  const p=plan();const initial=transitionSequenceEmail(p,{kind:'meeting_invitation',userId:1,meeting:1,initial:true},links);const makeup=transitionSequenceEmail(p,{kind:'meeting_invitation',userId:1,meeting:2,initial:false},links);const last=transitionSequenceEmail(p,{kind:'meeting_invitation',userId:1,meeting:4,initial:false},links);
  expect(initial.subject).not.toBe(makeup.subject);expect(last.text).toContain('fourth and final');for(const m of [makeup,last])expect(m.text).toContain('10 p.m.');
 });
 it('offers only remaining options, including Sunday, and never claims an unavailable video was sent',()=>{
  const p=plan(),msg=transitionSequenceEmail(p,{kind:'alternatives_email',userId:1,options:remainingMeetingOptions(p,2,now)},links);expect(msg.text).toContain('OPTION 3');expect(msg.text).not.toContain('OPTION 1');expect(msg.text).toContain('SUNDAY');expect(msg.text).toContain('everything we can');
  const video=transitionSequenceEmail(p,{kind:'video_followup',userId:1},links);expect(video.text).toContain('as soon as it is ready');expect(video.buttons).toHaveLength(0);
 });
 it('escapes personal text and rejects non-HTTPS personal action links',()=>{
  const p=plan();p.providers[0].name='<script>bad</script>';const a={kind:'meeting_invitation',userId:1,meeting:1,initial:true};expect(transitionSequenceEmail(p,a,links).html).not.toContain('<script>');expect(()=>transitionSequenceEmail(p,a,{...links,acceptedUrl:'javascript:bad'})).toThrow();
 });
 it('requires verified sender, exact original thread and a deliberate short reply; never infers quoted email content',()=>{
  const input={verifiedThreadRecipient:true,authenticatedSender:true,automated:false};expect(parseTransitionReply({...input,bodyText:'OPTION 3\n\n> OPTION 2'})).toEqual({kind:'select',option:'3'});expect(parseTransitionReply({...input,bodyText:'SUNDAY'})).toEqual({kind:'select',option:'sunday'});expect(parseTransitionReply({...input,bodyText:'NONE'})).toEqual({kind:'none'});expect(parseTransitionReply({...input,bodyText:'can’t make it'})).toEqual({kind:'decline_current'});
  expect(parseTransitionReply({...input,bodyText:'Can Rachel call me?\n> OPTION 3'}).kind).toBe('review');for(const patch of [{authenticatedSender:false},{verifiedThreadRecipient:false},{automated:true}])expect(parseTransitionReply({...input,...patch,bodyText:'3'}).kind).toBe('ignore');
 });
 it('includes the added access, family privacy and clinical workflow topics',()=>{expect(TRANSITION_TRAINING_AGENDA.join(' ')).toMatch(/recovery/);expect(TRANSITION_TRAINING_AGENDA.join(' ')).toMatch(/guardian/);expect(TRANSITION_TRAINING_AGENDA.join(' ')).toMatch(/supervisor/);});
});
describe('Rachel’s private coordination reports',()=>{
 it('waits for confirmed actual app invitations, emails names/cells only to Rachel, and deduplicates the roster',()=>{
  const p=plan();p.providers[0].cellPhone='+13035550101';let s=initial(p);
  expect(()=>transitionSequenceEvent(p,s,{type:'invitations_batch_finalized',meeting:1},now)).toThrow('Reconcile');
  for(const a of invites(s).filter(a=>a.meeting===1))s=transitionSequenceEvent(p,s,{type:'delivery_receipt',key:a.key,status:'created',reference:`Synthetic app invitation ${a.userId}`},now);
  s=transitionSequenceEvent(p,s,{type:'invitations_batch_finalized',meeting:1},now);
  const report=Object.values(s.outbox).find(a=>a.kind==='rachel_roster_report');expect(report.people).toHaveLength(16);expect(report.userId).toBe(92);
  const mail=transitionSequenceEmail(p,report);expect(mail.to).toBe('host1@example.test');expect(mail.cc).toEqual([]);expect(mail.text).toContain('+13035550101');expect(mail.text).toContain('Not on file');
  s=transitionSequenceEvent(p,s,{type:'invitations_batch_finalized',meeting:1},now);expect(Object.values(s.outbox).filter(a=>a.kind==='rachel_roster_report')).toHaveLength(1);
 });
 it('reports missed/unselected providers after finalization, including No without another selection, but excludes attendees and selected alternatives',()=>{
  const p=plan();let s=initial(p);for(const userId of [1,2])s=transitionSequenceEvent(p,s,{type:'rsvp',userId,meeting:1,response:'declined'},now);
  s=transitionSequenceEvent(p,s,{type:'select_alternative',userId:2,fromMeeting:1,option:'3'},now);
  expect(Object.values(s.outbox).some(a=>a.kind==='rachel_missed_report')).toBe(false);
  s=finalize(p,s,1,{3:900});const report=Object.values(s.outbox).find(a=>a.kind==='rachel_missed_report');
  expect(report.people.some(p=>p.userId===1&&p.rsvp==='declined')).toBe(true);expect(report.people.some(p=>[2,3].includes(p.userId))).toBe(false);expect(report.people.some(p=>p.userId===4&&p.rsvp==='no_response')).toBe(true);
 });
 it('removes a late alternative selection from an unsent missed report without rewriting already sent email evidence',()=>{
  const p=plan();let s=finalize(p,initial(p),1,{});const report=Object.values(s.outbox).find(a=>a.kind==='rachel_missed_report');
  expect(report.people.some(p=>p.userId===1)).toBe(true);s=transitionSequenceEvent(p,s,{type:'select_alternative',userId:1,fromMeeting:1,option:'3'},new Date(p.sessions[0].endAt));
  expect(s.outbox[report.key].people.some(p=>p.userId===1)).toBe(false);
  s=transitionSequenceEvent(p,s,{type:'delivery_receipt',key:report.key,status:'sent',reference:'Synthetic email receipt'},new Date(p.sessions[0].endAt));
  s=transitionSequenceEvent(p,s,{type:'select_alternative',userId:2,fromMeeting:1,option:'3'},new Date(p.sessions[0].endAt));expect(s.outbox[report.key].people.some(p=>p.userId===2)).toBe(true);
 });
 it('does not leak the contact roster in provider-facing email or permit another recipient',()=>{
  const p=plan();p.providers[0].cellPhone='+13035550101';const report={kind:'rachel_roster_report',userId:91,meeting:1,people:p.providers};expect(()=>transitionSequenceEmail(p,report)).toThrow('Rachel');
  const mail=transitionSequenceEmail(p,{kind:'meeting_invitation',userId:1,meeting:1,initial:true},{acceptedUrl:'https://example.test/yes',declinedUrl:'https://example.test/no'});expect(mail.text).not.toContain('+13035550101');
 });
 it('uses navy/gold live HTML with a responsive layout and accessible Yes/No links',()=>{
  const p=plan(),mail=transitionSequenceEmail(p,{kind:'meeting_invitation',userId:1,meeting:1,initial:true},{acceptedUrl:'https://example.test/yes',declinedUrl:'https://example.test/no'});
  expect(mail.html).toContain('#082e6c');expect(mail.html).toContain('#ffd052');expect(mail.html).toContain('@media');expect(mail.html).toContain('alt="AuricWell"');expect(mail.html).toContain('href="https://example.test/no"');expect(mail.html).not.toContain('January 28');expect(mail.html).not.toContain(' (ET)');
 });
});
