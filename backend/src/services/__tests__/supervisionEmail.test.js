import {describe,it,expect} from 'vitest';
import {supervisionEmailBody} from '../../utils/supervisionEmailBody.js';
import {supervisionReplyIntent} from '../../utils/supervisionReplyIntent.js';
import {interviewCalendar} from '../../utils/interviewCalendar.js';
const calendar=interviewCalendar({startsAt:'2026-09-22T18:30:00Z',endsAt:'2026-09-22T19:30:00Z',title:'Supervision',publicJoinUrl:'https://tenant.test/join/invitation/token'});
const args={recipient:{is_compensable_snapshot:1},session:{id:1,session_type:'group'},recipientName:'Ada',hostNames:['Haley'],people:[{name:'Alex',status:'SIGNED_UP',participant_role:'supervisee'},{name:'Pat',status:'INVITED',participant_role:'supervisee',isPresenter:true}],calendar,joinUrl:'https://tenant.test/join/invitation/personal',rsvpUrl:'https://tenant.test/rsvp',detailsUrl:'https://tenant.test/details',presentationUrl:'https://tenant.test/presentation'};
describe('supervision email variants',()=>{
 it.each([true,false])('shows attendance classification in subject, HTML and plain text for a presenter (required=%s)',isRequired=>{
  const content=supervisionEmailBody({...args,isPresenter:true,isRequired});
  const label='Mandatory · Compensated';
  expect(content.html).toContain(label);expect(content.text).toContain(label);
  expect(content.subject).toContain('[Mandatory]');
  expect(content.html).toContain('Edit Your Presentation');expect(content.html).toContain('RSVP · Attending or not attending');
 });
 it('includes an RSVP action for hosts in HTML and plain text',()=>{
  const content=supervisionEmailBody({...args,isHost:true,isRequired:true});
  expect(content.html).toContain('href="https://tenant.test/rsvp"');expect(content.text).toContain('RSVP: https://tenant.test/rsvp');
  expect(content.html).toContain('Mandatory · Compensated');
 });
 it('uses the correct local time, calendar buttons, and counts only confirmed RSVPs',()=>{const {html}=supervisionEmailBody(args);expect(html).toContain('12:30 PM MDT');expect(html).toContain('1 confirmed attendee');expect(html).not.toContain('2 confirmed');expect(html).toContain('Optional session');expect(html).toContain('Google Calendar');expect(html).toContain('Apple Calendar / iCal');expect(html).toContain('Case conceptualization presenter');});
 it('gives the presenter an edit action and mandatory invitees a required label',()=>{expect(supervisionEmailBody({...args,isPresenter:true}).html).toContain('Edit Your Presentation');expect(supervisionEmailBody({...args,isRequired:true}).html).toContain('Your attendance is required');expect(supervisionEmailBody(args).html).not.toContain('Edit Your Presentation');});
 it('renders individual supervision and respects in-person location',()=>{const {html}=supervisionEmailBody({...args,session:{session_type:'individual',modality:'IN_PERSON',location_text:'Office 10'}});expect(html).toContain('Individual supervision');expect(html).toContain('Office 10');expect(html).not.toContain('Join Group Supervision');});
 it('shows the actual signup requirement rather than an invented sample minimum',()=>{const {html}=supervisionEmailBody({...args,session:{session_type:'group',enrollment_mode:'signup_only',auto_cancel_if_empty:1}});expect(html).toContain('at least one participant');expect(html).not.toContain('minimum: 5');});
 it('escapes participant content and keeps presentation links personal',()=>{expect(supervisionEmailBody({...args,recipientName:'<script>'}).html).toContain('&lt;script&gt;');expect(supervisionEmailBody({...args,isPresenter:true}).html).toContain('href="https://tenant.test/presentation"');});
});
describe('attendance interpretation',()=>{
 it.each(["I can't attend today.","I'm unable to make it.","I have a dentist appointment at the same time.","I'm home sick today.","Please reschedule my supervision.","I have a family emergency.","Could we reschedule?","I am not feeling well.","I have a client session at that time."] )('infers nonattendance from %s',text=>expect(supervisionReplyIntent(text)).toBe('declined'));
 it.each(['Can we talk about scheduling?','I might have a conflict.',"I'm running late.","I have a dentist appointment but I will attend.","She can't attend.","I have no conflict.","I can't attend next week.",'Thanks!\nOn Tuesday Supervisor wrote:\n> I cannot attend'])('does not turn %s into a cancellation',text=>expect(supervisionReplyIntent(text)).not.toBe('declined'));
});

it('stops preparation prompts after completion and includes both presentations and discussion for this date',()=>{
 const content=supervisionEmailBody({...args,isPresenter:true,preparationComplete:true,people:[...args.people,{name:'Second Presenter',isPresenter:true}]});
 expect(content.html).toContain('preparation is marked complete');expect(content.html).not.toContain('add your slides');expect(content.html).not.toContain('Edit Your Presentation');
 expect(content.text).toContain('Presentation — Pat');expect(content.text).toContain('Presentation — Second Presenter');expect(content.text).toContain('Open group processing');
});

it.each(['intern','provider'])('uses unpaid indirect-hour language for interns with role %s',role=>{
 const content=supervisionEmailBody({...args,isRequired:true,recipient:{role,title:'Counseling Intern',credential:'BA'}});
 expect(content.html).toContain('Unpaid internship time');expect(content.text).toContain('master’s internship requirements');
 expect(content.text).not.toContain('Mandatory · Compensated');expect(content.html).not.toContain('mandatory and compensated');
 expect(content.text).toContain('Include a reason');expect(content.text).not.toContain('Reply to this email');
});
it('shows optional attendees an attending-only action with no explanation required',()=>{
 const content=supervisionEmailBody({...args,isRequired:false,recipient:{role:'intern'}});
 expect(content.html).toContain('RSVP · I’m attending');expect(content.html).not.toContain('Attending or not attending');
 expect(content.text).toContain('No response or reason is needed');
});


it.each([['WEEKLY','Weekly'],['BIWEEKLY','Every two weeks']])('states the saved %s frequency in HTML and plain text',(frequency,label)=>{
 const content=supervisionEmailBody({...args,session:{...args.session,recurrence_series_id:'series',recurrence_frequency:frequency}});
 expect(content.html).toContain('Frequency');expect(content.html).toContain(label);
 expect(content.text).toContain(`Frequency: ${label}`);
 expect(content.html).not.toContain('AuricWell');
});
it('keeps a one-time invitation explicitly one-time',()=>{
 expect(supervisionEmailBody(args).text).toContain('Frequency: One-time');
});
it('shows the mandatory LPCC recipient unpaid while retaining the saved cadence',()=>{
 const content=supervisionEmailBody({...args,isRequired:true,session:{...args.session,session_type:'individual',recurrence_series_id:'series',recurrence_frequency:'BIWEEKLY'},recipient:{credential:'MEd, LPCC, NCC',supervision_individual_hours:31.12,supervision_group_hours:7.84,is_compensable_snapshot:0}});
 expect(content.html).toContain('Mandatory · Not compensated');expect(content.text).toContain('Frequency: Every two weeks');
 expect(content.html).not.toContain('Mandatory · Compensated');
});

it('names both people in individual supervision reminders for the supervisor',()=>{
 const content=supervisionEmailBody({...args,isHost:true,isRequired:true,kind:'join:1440',session:{id:1,session_type:'individual',supervisee_user_id:8},hostNames:['Rachel Finch'],people:[{id:7,name:'Rachel Finch',participant_role:'host'},{id:8,name:'Grace Terrones',participant_role:'supervisee'}]});
 expect(content.subject).toContain('Grace Terrones');expect(content.subject).toContain('Rachel Finch');
 expect(content.html).toContain('Supervisee');expect(content.html).toContain('Grace Terrones');
 expect(content.text).toContain('Supervisee: Grace Terrones');
});
