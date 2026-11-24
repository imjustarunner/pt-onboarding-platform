// Pure planning/state logic. This module neither creates meetings nor sends mail.
// Persist state and deliver returned actions through the authenticated application.
import { createHash } from 'node:crypto';

// A fresh launch namespace keeps retired, previously deployed workers away from
// this sequence. No earlier namespace was activated or sent invitations.
export const SEQUENCE_ID = 'itsco-auricwell-2026-11-30-v2';
export const DEADLINES = Object.freeze({
  notes: '2026-11-29T22:00:00-07:00',
  cutoverStart: '2026-11-30T00:00:00-07:00',
  cutoverEnd: '2026-11-30T05:00:00-07:00',
  sunday: '2026-11-29T08:00:00-07:00'
});
const fail = message => { throw Object.assign(new Error(message), { status:400 }); };
const stamp = value => new Date(value).toISOString();
const validId = id => Number.isSafeInteger(id) && id > 0;
const same = (a,b) => JSON.stringify(a) === JSON.stringify(b);
const dateOnly = value => new Intl.DateTimeFormat('en-CA',{timeZone:'America/Denver',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(value));
const string = (value,max=500) => typeof value==='string' && value.trim() && value.length<=max ? value.trim() : fail('A required configuration field is missing or too long.');
const email = value => /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(string(value,254)) ? value.toLowerCase().trim() : fail('Choose a valid monitored email address.');
const instant = value => typeof value==='string' && /(?:Z|[+-]\d{2}:\d{2})$/.test(value) && Number.isFinite(Date.parse(value)) ? Date.parse(value) : fail('Each meeting needs an explicit start/end with a time zone offset.');

export function prepareTransitionSequence(input, snapshot, now = new Date()) {
  if (input?.agencyId!==2 || snapshot?.agencyId!==2) fail('This meeting sequence belongs to ITSCO.');
  if (!Array.isArray(snapshot.staff) || !Array.isArray(snapshot.ranking)) fail('Load the authorized ITSCO staff and current payroll ranking.');
  const byId=new Map(snapshot.staff.map(p=>[p.id,p]));
  const hostIds=input.hostIds;
  if (!Array.isArray(hostIds) || hostIds.length!==3 || new Set(hostIds).size!==3 || hostIds.some(id=>!validId(id)||!byId.has(id))) fail('Select Megan, Rachel and Michael as three distinct active ITSCO hosts.');
  const kimiId=input.additionalGroupOneUserId;
  const kimiAgency=Number(input.additionalGroupOneAgencyId||2);
  if (!validId(kimiId) || !byId.has(kimiId) || hostIds.includes(kimiId) || ![2,6].includes(kimiAgency) || Number(byId.get(kimiId)?.agencyId||2)!==kimiAgency) fail('Select Kimi’s verified practice staff account for group 1.');
  if(hostIds.some(id=>Number(byId.get(id)?.agencyId||2)!==2))fail('Hosts must be active ITSCO practice staff.');
  if(!hostIds.includes(input.coordinatorUserId))fail('Select Rachel’s active host account for private roster and follow-up reports.');
  if (!Array.isArray(input.sessions) || input.sessions.length!==4) fail('Choose exactly four meetings: two Wednesday and two Friday.');
  const sessions=input.sessions.map((s,i)=>{
    const start=instant(s.startAt),end=instant(s.endAt);
    if (start<=+now || end<=start || end-start>4*3600000 || (i && start<instant(input.sessions[i-1].endAt))) fail('Meetings must be future, in order, non-overlapping, and no longer than four hours.');
    const day=i<2?'2026-11-25':'2026-11-27';
    if (dateOnly(s.startAt)!==day || dateOnly(s.endAt)!==day) fail('Use two meetings Wednesday, November 25, then two Friday, November 27 (Mountain Time).');
    if (!['video','hybrid','in_person'].includes(s.modality)) fail('Select video, hybrid or in-person for each meeting.');
    const location=s.modality==='video'?null:string(s.location,500);
    return {number:i+1,startAt:stamp(start),endAt:stamp(end),modality:s.modality,location,
      initialGroups:i===0?[1,2,3]:i===1?[4,5,6]:i===2?[7,8]:[]};
  });
  const seen=new Set();
  const providers=snapshot.ranking.map(row=>{
    if (!validId(row.providerId)||seen.has(row.providerId)||!byId.has(row.providerId)||Number(byId.get(row.providerId)?.agencyId||2)!==2||!Number.isSafeInteger(row.cohort)||row.cohort<1||row.cohort>8) fail('Review the current provider payroll groups; expected unique active providers in groups 1–8.');
    seen.add(row.providerId);
    return {userId:row.providerId,name:byId.get(row.providerId).name,cellPhone:byId.get(row.providerId).cellPhone||null,payrollAgencyId:2,group:row.cohort,initialMeeting:row.cohort<=3?1:row.cohort<=6?2:3};
  }).filter(p=>!hostIds.includes(p.userId) && p.userId!==kimiId);
  providers.push({userId:kimiId,name:byId.get(kimiId).name,cellPhone:byId.get(kimiId).cellPhone||null,payrollAgencyId:kimiAgency,group:1,initialMeeting:1,explicitAddition:true});
  if (!providers.length) fail('No eligible providers were found.');
  const inbox={senderIdentityId:input.senderIdentityId,replyTo:email(input.replyTo)};
  if (!validId(inbox.senderIdentityId)) fail('Select an approved ITSCO sender identity.');
  const proof=input.readiness || {};
  for (const key of ['senderApproved','replyInboxMonitored','inboundRoutingTested','rsvpEmailAndAppTested','hostCcTested','attendanceFinalizationTested','supportActivity18Tested','automationIdentityScoped'])
    if(proof[key]!==true) fail(`Launch readiness is incomplete: ${key}.`);
  const plan={id:SEQUENCE_ID,agencyId:2,timeZone:'America/Denver',hostIds:[...hostIds],hosts:hostIds.map(id=>({userId:id,name:byId.get(id).name,email:email(byId.get(id).email)})),
    coordinatorUserId:input.coordinatorUserId,providers,sessions,sunday:{startAt:stamp(DEADLINES.sunday),endAt:input.sundayEndAt?stamp(instant(input.sundayEndAt)):null,location:string(input.sundayLocation)},
    inbox,videoUrl:null,deadlines:{...DEADLINES},compensation:{serviceCode:'MEETING',category:'Support Activity',hourlyRate:18,hostIds:[...hostIds]},
    preparedAt:stamp(now)};
  if(plan.sunday.endAt && (Date.parse(plan.sunday.endAt)<=Date.parse(plan.sunday.startAt)||dateOnly(plan.sunday.endAt)!=='2026-11-29'))fail('Sunday fallback needs an end time after 8 a.m. on November 29.');
  if(input.videoUrl){const url=new URL(input.videoUrl);if(url.protocol!=='https:'||url.username||url.password)fail('Use an HTTPS training video link.');plan.videoUrl=url.href;}
  plan.fingerprint=createHash('sha256').update(JSON.stringify(plan)).digest('hex');
  return plan;
}

export function newTransitionSequenceState(plan) {
  return {version:1,planFingerprint:plan.fingerprint,revision:0,issued:{},responses:{},attendance:{},alternatives:{},allUnavailable:{},readiness:{},outbox:{},receipts:{},reconciliation:[],history:[]};
}
function keyFor(plan,kind,uid,meeting='') {return `${plan.id}:${kind}:${uid}:${meeting}`;}
function queue(state,action) { if(!state.outbox[action.key]&&!state.receipts[action.key])state.outbox[action.key]={...action,status:'pending'}; }
function member(plan,id){return plan.providers.find(p=>p.userId===id)||fail('Select a provider in this sequence.');}
function withdrawFutureInvitations(plan,state,uid,fromMeeting,keepOption,now){
  for(const item of Object.values(state.issued).filter(i=>i.userId===uid&&i.meeting>fromMeeting&&!i.withdrawn)){
    const session=item.meeting===5?plan.sunday:plan.sessions[item.meeting-1];
    if(Date.parse(session.startAt)<=+now||String(item.meeting)===(keepOption==='sunday'?'5':keepOption))continue;
    item.withdrawn=true;
    const key=keyFor(plan,'invite',uid,item.meeting),invitation=state.outbox[key];
    if(invitation?.status==='pending')invitation.status='cancelled_alternative';
    if(['created','sent'].includes(state.receipts[key]?.status))queue(state,{key:keyFor(plan,'withdraw',uid,item.meeting),kind:'withdraw_invitation',userId:uid,meeting:item.meeting});
  }
}
function hasAttended(state,id){return Object.values(state.attendance).some(a=>a.finalized===true && Number(a.seconds?.[id])>0);}
function meetingEnded(plan,state,n,now){const s=plan.sessions[n-1];return !!s && +now>=Date.parse(s.endAt) && state.attendance[n]?.finalized===true;}
function hasFutureAlternative(plan,state,uid,now){const selected=state.alternatives[uid];const session=selected?.option==='sunday'?plan.sunday:plan.sessions[Number(selected?.option)-1];return !!session&&Date.parse(session.startAt)>+now;}
export function remainingMeetingOptions(plan,from,now=new Date()) {
  return [...plan.sessions.filter(s=>s.number>from&&Date.parse(s.startAt)>+now).map(s=>({...s,option:String(s.number)})),
    ...(Date.parse(plan.sunday.startAt)>+now?[{...plan.sunday,option:'sunday',number:5,modality:'in_person'}]:[])];
}

// Persist returned state and its outbox atomically, with optimistic revision or
// a row lock. Repeated events and retries do not create repeated dispatch keys.
export function transitionSequenceEvent(plan,previous,event,now=new Date()) {
  if(previous.planFingerprint!==plan.fingerprint)fail('Use the frozen campaign snapshot; payroll changes must not move this audience.');
  const state=structuredClone(previous);
  const person=event.userId===undefined?null:member(plan,event.userId);
  if(event.type==='readiness'){
    const reference=string(event.evidence,1500);
    if(event.clientsAndNextWeekSessionsVerified!==true)fail('Verify every assigned client and next-week session before marking this provider ready.');
    state.readiness[person.userId]={verifiedAt:stamp(now),evidence:reference};
  } else if(event.type==='rsvp'){
    if(!['accepted','declined'].includes(event.response)||!state.issued[`${person.userId}:${event.meeting}`]||state.issued[`${person.userId}:${event.meeting}`].withdrawn)fail('Respond to an invitation issued to this provider.');
    const s=plan.sessions[event.meeting-1];
    if(!s||Date.parse(s.startAt)<=+now)fail('The meeting is no longer open for RSVP.');
    state.responses[`${person.userId}:${event.meeting}`]={response:event.response,at:stamp(now)};
    if(event.response==='declined') queue(state,{key:keyFor(plan,'options',person.userId,event.meeting),kind:'alternatives_email',userId:person.userId,meeting:event.meeting,
      options:remainingMeetingOptions(plan,event.meeting,now)});
  } else if(event.type==='select_alternative'){
    if(!state.issued[`${person.userId}:${event.fromMeeting}`])fail('Use this provider’s existing invitation.');
    const option=remainingMeetingOptions(plan,event.fromMeeting,now).find(s=>s.option===String(event.option));
    if(!option)fail('Choose a remaining meeting or Sunday fallback.');
    if(state.issued[`${person.userId}:${option.number}`]?.withdrawn)fail('Rachel must review reinstating this withdrawn invitation before confirming it.');
    delete state.allUnavailable[person.userId];
    state.alternatives[person.userId]={option:option.option,fromMeeting:event.fromMeeting,at:stamp(now)};
    withdrawFutureInvitations(plan,state,person.userId,event.fromMeeting,option.option,now);
    queue(state,{key:keyFor(plan,'choice',person.userId,`${event.fromMeeting}:${option.option}`),kind:'choice_acknowledgement',userId:person.userId,option:option.option});
    // Selection is acknowledged now. Calendar invitation waits for the earlier
    // meeting to end and attendance to be finalized, including a positive RSVP.
  } else if(event.type==='none_available'){
    if(!Object.keys(state.issued).some(k=>k.startsWith(`${person.userId}:`)))fail('No issued invitation exists for this provider.');
    state.allUnavailable[person.userId]=true;
    withdrawFutureInvitations(plan,state,person.userId,0,null,now);
    queue(state,{key:keyFor(plan,'video',person.userId),kind:'video_followup',userId:person.userId,videoUrl:plan.videoUrl});
  } else if(event.type==='attendance_finalized'){
    const s=event.meeting===5?plan.sunday:plan.sessions[event.meeting-1];
    if(!s||!s.endAt||+now<Date.parse(s.endAt)||event.allAttendanceSourcesReviewed!==true)fail('Finalize all attendance sources, including in-person attendance, after the meeting ends.');
    const evidence=string(event.evidence,1500),seconds={...event.seconds};
    if(!event.seconds||Array.isArray(event.seconds)||typeof event.seconds!=='object')fail('Provide reviewed attendance seconds, including explicit zero for absent invitees.');
    for(const [uid,value] of Object.entries(seconds)){
      if(!plan.providers.some(p=>p.userId===Number(uid))&&!plan.hostIds.includes(Number(uid)))fail('Attendance belongs to a different audience.');
      if(!Number.isSafeInteger(value)||value<0||value>(Date.parse(s.endAt)-Date.parse(s.startAt))/1000)fail('Use actual attended seconds within the meeting interval.');
      if(!plan.hostIds.includes(Number(uid))&&!state.issued[`${uid}:${event.meeting}`])fail('Review uninvited attendance before adding it to this sequence.');
    }
    for(const issued of Object.values(state.issued).filter(i=>i.meeting===event.meeting&&!i.withdrawn))if(!Object.hasOwn(seconds,issued.userId))fail('Record attendance or explicit absence for every invited provider.');
    const existing=state.attendance[event.meeting];
    if(existing?.finalized && !same(existing.seconds,seconds))fail('Use an attendance correction and reconcile affected invitations/claims; do not overwrite final evidence.');
    state.attendance[event.meeting] ||= {finalized:true,seconds,evidence,at:stamp(now)};
    for(const [uid,secondsPresent] of Object.entries(seconds))if(secondsPresent>0&&!plan.hostIds.includes(Number(uid)))queue(state,{
      key:keyFor(plan,'claim',Number(uid),event.meeting),kind:'submit_time_claim',userId:Number(uid),agencyId:member(plan,Number(uid)).payrollAgencyId||2,meeting:event.meeting,seconds:secondsPresent,
      minutes:secondsPresent/60,hourlyRate:18,serviceCode:'MEETING',category:'Support Activity',claimStatus:'submitted',
      // Approval/payment is a separate payroll operation. An adapter must reuse
      // the existing meeting claim identity rather than create a second claim.
      estimatedAmount:Math.round(secondsPresent*18/3600*100)/100});
    const missed=Object.values(state.issued).filter(i=>i.meeting===event.meeting&&!i.withdrawn&&!hasAttended(state,i.userId)&&!hasFutureAlternative(plan,state,i.userId,now))
      .map(i=>({...member(plan,i.userId),rsvp:state.responses[`${i.userId}:${event.meeting}`]?.response||'no_response',declinedAll:!!state.allUnavailable[i.userId]}));
    if(missed.length)queue(state,{key:keyFor(plan,'rachel_missed',plan.coordinatorUserId,event.meeting),kind:'rachel_missed_report',userId:plan.coordinatorUserId,meeting:event.meeting,people:missed});
  } else if(event.type==='invitations_batch_finalized'){
    const selected=Object.values(state.issued).filter(i=>i.meeting===event.meeting&&!i.withdrawn);
    if(!selected.length)fail('No invitations have been issued for this meeting.');
    for(const i of selected){const receipt=state.receipts[keyFor(plan,'invite',i.userId,event.meeting)];if(!['sent','created'].includes(receipt?.status))fail('Reconcile every actual app invitation before emailing Rachel’s roster.');}
    const ids=selected.map(i=>i.userId).sort((a,b)=>a-b),hash=createHash('sha256').update(JSON.stringify(ids)).digest('hex').slice(0,16);
    queue(state,{key:keyFor(plan,'rachel_roster',plan.coordinatorUserId,`${event.meeting}:${hash}`),kind:'rachel_roster_report',userId:plan.coordinatorUserId,meeting:event.meeting,people:ids.map(uid=>member(plan,uid))});
  } else if(event.type==='delivery_receipt'){
    const item=state.outbox[event.key];
    if(!item||!['sent','created','submitted','review','failed','skipped'].includes(event.status))fail('Record a result for an existing outbox item.');
    if(['sent','created','submitted'].includes(item.status))fail('A completed dispatch receipt is immutable.');
    const reference=string(event.reference,500);
    item.status=event.status;item.reference=reference;item.completedAt=stamp(now);
    state.receipts[event.key]={status:event.status,reference,at:stamp(now)};
  } else if(event.type!=='tick')fail('Choose a supported sequence event.');
  // A provider may choose an alternate after the post-meeting report was queued.
  // Refresh unsent report contents before delivery; preserve sent evidence.
  for(const item of Object.values(state.outbox))if(item.kind==='rachel_missed_report'&&item.status==='pending'){
    item.people=item.people.filter(p=>!hasAttended(state,p.userId)&&!hasFutureAlternative(plan,state,p.userId,now));
    if(!item.people.length)item.status='cancelled_resolved';
  }
  if(['tick','attendance_finalized','select_alternative','readiness'].includes(event.type)){
    for(const provider of plan.providers){
      const uid=provider.userId;
      if(hasAttended(state,uid)){
        for(const item of Object.values(state.outbox))if(item.userId===uid&&['meeting_invitation','final_missed_email','video_followup','alternatives_email'].includes(item.kind)&&item.status==='pending')item.status='cancelled_attended';
        continue;
      }
      if(state.allUnavailable[uid])continue;
      const issued=Object.values(state.issued).filter(i=>i.userId===uid&&!i.withdrawn).sort((a,b)=>a.meeting-b.meeting);
      const last=issued.at(-1);
      const priorDone=last&&meetingEnded(plan,state,last.meeting,now);
      if(last&&!priorDone)continue;
      if(meetingEnded(plan,state,4,now)){
        queue(state,{key:keyFor(plan,'final',uid),kind:'final_missed_email',userId:uid,sunday:plan.sunday,videoUrl:plan.videoUrl});
        const choice=state.alternatives[uid];
        if(choice?.option==='sunday' && plan.sunday.endAt && +now<Date.parse(plan.sunday.startAt) && !state.issued[`${uid}:5`]){
          queue(state,{key:keyFor(plan,'invite',uid,5),kind:'meeting_invitation',userId:uid,meeting:5,initial:false});
          state.issued[`${uid}:5`]={userId:uid,meeting:5,at:stamp(now)};
        }
        continue;
      }
      if(last?.meeting===5)continue;
      const nextNumber=last?last.meeting+1:provider.initialMeeting;
      // Cohort 4–6/7–8 get their own initial notice in advance. Earlier cohorts
      // never receive another invitation before their previous slot closes.
      const chosen=state.alternatives[uid];
      const chosenNumber=chosen?.option==='sunday'?5:Number(chosen?.option||0);
      const target=chosenNumber>=nextNumber?chosenNumber:nextNumber;
      if(target===5)continue; // Sunday invitation follows the fourth opportunity.
      const session=plan.sessions.find(s=>s.number>=target && Date.parse(s.startAt)>+now);
      if(!session)continue;
      if(last && !priorDone)continue;
      queue(state,{key:keyFor(plan,'invite',uid,session.number),kind:'meeting_invitation',userId:uid,meeting:session.number,initial:!last});
      state.issued[`${uid}:${session.number}`]={userId:uid,meeting:session.number,at:stamp(now)};
    }
  }
  state.revision++;
  state.history.push({type:event.type,userId:event.userId??null,meeting:event.meeting??null,at:stamp(now)});
  return state;
}

export function meetingCreationManifest(plan) {
  return plan.sessions.map(session=>({externalKey:`${plan.id}:meeting:${session.number}`,agencyId:2,title:`ITSCO → AuricWell transition · opportunity ${session.number}`,
    ...session,hostIds:plan.hostIds,participants:plan.hostIds,providerInvitations:'managed_by_sequence',recurrenceSeriesId:null,
    attendanceRequired:true,attendanceTracking:true,reminderAudience:'actually_invited_only',
    senderIdentityId:plan.inbox.senderIdentityId,replyTo:plan.inbox.replyTo,cc:plan.hosts.map(p=>p.email),
    participantCompensation:{category:'Support Activity',hourlyRate:18,excludeUserIds:plan.hostIds,actualSecondsOnly:true},
    scopeNote:'Create four independent events once. Add providers only through their sequence invitation; never bulk-invite all groups to all four events.'}));
}
