import { DEADLINES } from '../services/transitionMeetingSequencePolicy.js';
import { renderTransitionMeetingEmail } from './transitionMeetingEmailDesign.js';

export const TRANSITION_EXPECTATIONS = [
  'Before your meeting, we plan to have all of your clients and their scheduled sessions for the week beginning Monday, November 30 in AuricWell. If you choose a different meeting, we will do everything we can to have you set up by your new meeting time.',
  'Review every client and confirm that next week’s dates, times, recurrence, locations and meeting links in the app are accurate. Report anything missing or incorrect to the transition team.',
  'Complete all outstanding notes by 10 p.m. Mountain Time on Sunday, November 29, including any required corrections and supervision/signature follow-up.',
  'Save any Google files, email or other work records you will need before access ends. Keep client records in approved organization storage. Set and save your app password and six-digit code, verify your personal recovery email, and test signing in and resetting your password without Google.',
  'After the app schedule has been checked, remove the duplicate future TherapyNotes sessions from November 30 onward through the approved cancellation workflow. Preserve past visits, notes and records. A transition/termination note is suggested, not required; where appropriate, each section may simply say “Transitioned to AuricWell.” This administrative move does not itself end clinical care.',
  'TherapyNotes and Google Workspace access are scheduled to end between midnight and 5 a.m. Mountain Time on Monday, November 30. Be prepared to work entirely in AuricWell on Monday morning. The team must verify records, schedules and sign-in before shutting off access.',
  'Tell families where to find their next appointment, confirm their contact information and access, and use the app’s approved communication channels. Raise unresolved care or access issues immediately.'
];
export const TRANSITION_TRAINING_AGENDA = [
  'Sign in without Google: password, six-digit code, personal recovery email and reset test',
  'Review the full caseload; confirm intakes, forms, consents and authorized guardian access',
  'Complete treatment plans; check dates, baseline information, signatures and supervisor routing',
  'Confirm all sessions for November 30 onward, recurring exceptions, school closures, locations and telehealth links',
  'Manage clients, contact families, send secure messages and email, and check the recipient before sending',
  'Schedule, reschedule and cancel one session versus a series; avoid duplicate reminders',
  'Write, save, reopen and sign notes in the correct appointment; handle corrections and supervision',
  'Verify records and schedules before canceling duplicate future TherapyNotes sessions; optional transition-note wording',
  'Use tasks, notifications and the help route; practice a full visit with synthetic examples',
  'Questions, individual readiness check and instructions for the updated example video'
];
const when = value=>new Intl.DateTimeFormat('en-US',{timeZone:'America/Denver',weekday:'long',month:'long',day:'numeric',hour:'numeric',minute:'2-digit'}).format(new Date(value))+' Mountain Time';
function link(value){const u=new URL(value);if(u.protocol!=='https:'||u.username||u.password)throw Error('Use the app-generated HTTPS personal action link.');return u.href;}

export function transitionSequenceEmail(plan,action,links={}) {
  if(['rachel_roster_report','rachel_missed_report'].includes(action.kind)){
    if(action.userId!==plan.coordinatorUserId)throw Error('Phone rosters may only go to Rachel’s selected account.');
    const rachel=plan.hosts.find(p=>p.userId===plan.coordinatorUserId),session=action.meeting===5?plan.sunday:plan.sessions[action.meeting-1];
    const missed=action.kind==='rachel_missed_report';
    const subject=`ITSCO transition · ${missed?'follow-up needed':'invited-provider roster'} · meeting ${action.meeting}`;
    const paragraphs=[`Hello ${rachel.name},`,`${when(session.startAt)}. ${missed?'Attendance is finalized. These providers did not attend and have no remaining alternative time selected.':'These providers have actual app invitations for this meeting. Please confirm their meeting options personally.'}`,
      ...action.people.map(p=>`${p.name} · Cell: ${p.cellPhone||'Not on file — please verify'} · Group ${p.group}${missed?` · RSVP: ${p.rsvp}${p.declinedAll?' · No available meeting works':''}`:''}`),
      'This contact roster is for your coordination work only. Check the latest app status before calling; do not forward it to the provider group.'];
    return {subject,to:rachel.email,toUserId:rachel.userId,cc:[],replyTo:plan.inbox.replyTo,senderIdentityId:plan.inbox.senderIdentityId,text:paragraphs.join('\n\n'),html:renderTransitionMeetingEmail({subject,paragraphs,buttons:[]}),buttons:[]};
  }
  const person=plan.providers.find(p=>p.userId===action.userId);
  if(!person)throw Error('Select a provider in the frozen sequence.');
  const session=action.meeting===5?plan.sunday:plan.sessions[action.meeting-1];
  let subject,paragraphs=[],buttons=[];
  if(action.kind==='meeting_invitation'){
    const initial=action.initial;
    const intro=action.meeting===5?'This is your in-person fallback at the Windchime office.':initial
      ?`${action.meeting===1?'You are in the first set of provider groups invited to transition training.':action.meeting===2?'Your provider group is invited to the second transition-training opportunity.':'Your provider group is invited to the Friday transition-training opportunity.'} This meeting is for you and your assigned group${person.explicitAddition?' (you have been added to group 1)':''}. We plan to have your clients and next-week sessions in AuricWell by this meeting.`
      :action.meeting===4?'We have not recorded attendance at an earlier transition meeting. You are invited to the fourth and final scheduled opportunity. We will do everything we can to have your clients and next-week sessions ready by this meeting.'
      :'We have not recorded attendance at your earlier transition meeting. Here is your next available opportunity. We will do everything we can to have your clients and next-week sessions ready by this meeting.';
    subject=action.meeting===5?'ITSCO: Sunday in-person transition help':initial?`ITSCO: your AuricWell transition meeting — group ${person.group}`:`ITSCO: your next AuricWell transition opportunity (${action.meeting})`;
    paragraphs=[`Hello ${person.name},`,intro,`${when(session.startAt)}${session.endAt?' – '+new Intl.DateTimeFormat('en-US',{timeZone:'America/Denver',hour:'numeric',minute:'2-digit'}).format(new Date(session.endAt)):''}. ${session.modality==='video'?'Join through your personal meeting link in the app.':session.location||plan.sunday.location}`,
      'Megan, Rachel and Michael are hosting. Rachel will personally confirm your invitation and help with the other options.',
      'Please let us know as soon as possible if you cannot attend: choose “I can’t make it.” You can also RSVP Yes or No on your app schedule.',
      ...(action.meeting<4?['If you cannot attend, we will offer a later opportunity after this meeting ends. Later meetings may include additional groups.']:[]),
      'We will demonstrate intake confirmation, treatment plans, client management, communication, scheduling, email, notes and sign-in, and answer your questions.',...TRANSITION_EXPECTATIONS];
    buttons=[{label:'I will be there',href:link(links.acceptedUrl)},{label:'I can’t make it',href:link(links.declinedUrl)}];
  } else if(action.kind==='alternatives_email'){
    subject='ITSCO: choose another transition meeting';
    paragraphs=[`Hello ${person.name},`,'Thank you for letting us know. We will do everything we can to make sure you are set up by your new meeting time.',
      'Here are the remaining options. Reply with the option you want, or use its personal selection link. Selecting an option now does not send a second calendar invitation before your earlier meeting ends.',
      ...action.options.map(s=>`${s.option==='sunday'?'SUNDAY':`OPTION ${s.option}`}: ${when(s.startAt)}${s.option==='sunday'?` · in person at ${s.location}`:''}`),
      'If none of these—including Sunday—works, reply NONE. We will send an example video to help you transition. The same Sunday 10 p.m. notes deadline and Monday-morning readiness expectation still apply.'];
    buttons=action.options.filter(s=>links.options?.[s.option]).map(s=>({label:s.option==='sunday'?'Choose Sunday':`Choose option ${s.option}`,href:link(links.options[s.option])}));
    if(links.noneUrl)buttons.push({label:'None of these works',href:link(links.noneUrl)});
  } else if(action.kind==='choice_acknowledgement'){
    const s=action.option==='sunday'?plan.sunday:plan.sessions[Number(action.option)-1];
    subject='ITSCO: your alternate meeting preference is recorded';
    paragraphs=[`Hello ${person.name},`,`We recorded your preference for ${when(s.startAt)}. We will do everything we can to have your clients and sessions ready by your new meeting time.`,
      'Your calendar invitation and Yes/No RSVP will follow after your earlier meeting ends and attendance is checked. If your plans change, reply to this message.',...TRANSITION_EXPECTATIONS];
  } else if(action.kind==='final_missed_email'){
    subject='ITSCO: final transition follow-up and Sunday help';
    paragraphs=[`Hello ${person.name},`,'The four scheduled transition meetings have finished, and we have not recorded your attendance.',
      `Michael will be available in person at ${plan.sunday.location} at 8 a.m. Mountain Time on Sunday, November 29. Reply SUNDAY if you can attend, or NONE if no remaining option works.`,
      'If you cannot attend, we will send an example video to help you transition. Watch it, complete the readiness steps, and contact us promptly with questions. You are still expected to be ready by Monday morning, as is everyone else.',...TRANSITION_EXPECTATIONS];
    if(links.options?.sunday)buttons.push({label:'I can attend Sunday',href:link(links.options.sunday)});
    if(links.noneUrl)buttons.push({label:'I can’t attend Sunday',href:link(links.noneUrl)});
  } else if(action.kind==='video_followup'){
    subject='ITSCO: video transition route and Monday readiness';
    paragraphs=[`Hello ${person.name},`,'We have recorded that none of the available meetings, including Sunday, works for you.',
      plan.videoUrl?'Use the example video below, complete the readiness checklist, and contact the team about anything you cannot finish.':'We will send you the updated example video as soon as it is ready. Rachel will follow up on your readiness and questions.',
      'All notes are still due Sunday, November 29 by 10 p.m. Mountain Time. Everyone is expected to be ready to work in AuricWell on Monday morning.',...TRANSITION_EXPECTATIONS];
    if(plan.videoUrl)buttons=[{label:'Watch the example video',href:link(plan.videoUrl)}];
  } else throw Error('This action is not an email.');
  return {subject,toUserId:person.userId,cc:plan.hosts.map(p=>p.email),replyTo:plan.inbox.replyTo,senderIdentityId:plan.inbox.senderIdentityId,
    text:paragraphs.join('\n\n')+'\n\n'+buttons.map(b=>`${b.label}: ${b.href}`).join('\n'),
    html:renderTransitionMeetingEmail({subject,paragraphs,buttons,invitation:action.kind==='meeting_invitation'}),buttons};
}

// Do not infer a scheduling command from quoted invitations, auto-replies,
// unauthenticated mail or a sender address alone. The inbound adapter must bind
// the authenticated sender AND original RFC thread to one campaign recipient.
export function parseTransitionReply({bodyText,verifiedThreadRecipient,automated,authenticatedSender}) {
  if(!verifiedThreadRecipient||automated||!authenticatedSender)return {kind:'ignore'};
  const line=String(bodyText||'').split(/\r?\n/).map(s=>s.trim()).find(Boolean)||'';
  const match=/^(?:OPTION\s+)?([1-4])\s*[.!]?$/i.exec(line);
  if(match)return {kind:'select',option:match[1]};
  if(/^SUNDAY[.!]?$/i.test(line))return {kind:'select',option:'sunday'};
  if(/^(?:NONE|CAN['’]?T MAKE ANY|CANNOT ATTEND ANY)[.!]?$/i.test(line))return {kind:'none'};
  if(/^(?:NO|CAN['’]?T MAKE IT|CANNOT ATTEND)[.!]?$/i.test(line))return {kind:'decline_current'};
  return {kind:'review',reason:'Rachel must review this reply; no scheduling choice inferred.'};
}

export function transitionReadinessReport(plan,state,now=new Date()) {
  return plan.providers.map(p=>{
    const meeting=Object.values(state.issued).filter(i=>i.userId===p.userId).sort((a,b)=>b.meeting-a.meeting)[0]?.meeting||p.initialMeeting;
    const deadline=meeting===5?plan.sunday.startAt:plan.sessions[meeting-1].startAt;
    return {userId:p.userId,name:p.name,meeting,clientsAndSessionsVerified:!!state.readiness[p.userId],
      dueAt:deadline,overdue:!state.readiness[p.userId]&&+now>=Date.parse(deadline),notesDue:DEADLINES.notes};
  });
}
