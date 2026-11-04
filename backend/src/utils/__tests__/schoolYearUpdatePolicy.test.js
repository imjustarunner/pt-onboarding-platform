import { describe,it,expect } from 'vitest';
import { annualSchedule,annualEligibility,annualSchoolYear,dueAnnualReminder,outstandingAnnualInfo,validateAnnualRules,DEFAULT_ANNUAL_RULES,ANNUAL_SECTION_LABELS } from '../schoolYearUpdatePolicy.js';
import { annualCompletionEmail,annualDeadlineEmail,annualSchoolEmail } from '../schoolYearUpdateEmail.js';
const rules={...DEFAULT_ANNUAL_RULES,enabled:1};
const school={id:5,name:'Example School',slug:'example-school',organization_type:'school',is_active:1,is_archived:0,affiliated:1,created_at:'2025-01-01',first_affiliation_at:'2025-01-01'};
describe('annual update calendar and eligibility',()=>{
 it('uses the school year in the agency timezone at the July boundary',()=>{
  expect(annualSchoolYear(new Date('2026-07-01T05:59:59Z'))).toBe('2025-26');
  expect(annualSchoolYear(new Date('2026-07-01T06:00:00Z'))).toBe('2026-27');
 });
 it.each([['2026-08-01T05:59:59Z','scheduled'],['2026-08-01T06:00:00Z','open'],['2026-08-22T05:59:59Z','open'],['2026-08-22T06:00:00Z','followup'],['2026-09-01T05:59:59Z','followup'],['2026-09-01T06:00:00Z','closed']])('has inclusive local deadlines at %s',(date,phase)=>expect(annualSchedule('2026-27',rules,new Date(date)).phase).toBe(phase));
 it('exempts a new school for its first year, including onboarding still in progress',()=>{
  expect(annualEligibility({...school,first_onboarding_at:'2026-08-12'},'2026-27')).toEqual({eligible:false,reason:'first_year_onboarding'});
  expect(annualEligibility({...school,first_onboarding_at:'2026-08-12'},'2027-28').eligible).toBe(true);
 });
 it('does not re-exempt a returning school with earlier onboarding',()=>expect(annualEligibility({...school,first_onboarding_at:'2025-08-12'},'2026-27').eligible).toBe(true));
 it.each([{name:'Fake School Test'},{slug:'hogwarts'},{is_active:0},{affiliated:0},{organization_type:'program'}])('excludes non-participants %j',patch=>expect(annualEligibility({...school,...patch},'2026-27').eligible).toBe(false));
 it('coalesces missed reminders and stops after follow-up closes',()=>{
  expect(dueAnnualReminder(annualSchedule('2026-27',rules,new Date('2026-08-20T18:00:00Z')))).toMatchObject({date:'2026-08-19',kind:'reminder'});
  expect(dueAnnualReminder(annualSchedule('2026-27',rules,new Date('2026-10-22T18:00:00Z')))).toBeNull();
 });
 it('allows a dated extension without reopening every school',()=>{
  const now=new Date('2026-10-22T18:00:00Z');
  expect(annualSchedule('2026-27',rules,now,'2026-10-29').phase).toBe('followup');
  expect(annualSchedule('2026-27',rules,now).phase).toBe('closed');
 });
 it.each([{due_md:'07-31'},{followup_md:'08-23'},{opens_md:'08-35'},{timezone:'invalid-zone'}])('rejects invalid configuration %j',patch=>expect(()=>validateAnnualRules({...rules,...patch})).toThrow());
});
describe('saved information and annual emails',()=>{
 const sections=Object.keys(ANNUAL_SECTION_LABELS).map(section_key=>({section_key,reviewed:1,completed:1,data_json:{}}));
 const questions=[{section_key:'needs_assessment',question_key:'days_per_week_onsite',label:'Days per week onsite',enabled:1,required:1}];
 it('recognizes a missing required answer despite seven completed sections',()=>expect(outstandingAnnualInfo(sections,questions)).toEqual([{sectionKey:'needs_assessment',questionKey:'days_per_week_onsite',kind:'answer',label:'Days per week onsite'}]));
 it('accepts zero and false as actual answers and identifies missing final submit',()=>{
  const filled=sections.map(s=>({...s,data_json:{days_per_week_onsite:0}}));
  expect(outstandingAnnualInfo(filled,questions)[0].kind).toBe('finalize');
  expect(outstandingAnnualInfo(filled,questions,true)).toEqual([]);
 });
 it('does not invent a missing check-in when scheduling is optional',()=>expect(outstandingAnnualInfo(sections,[{section_key:'fall_check_in',question_key:'fall_checkin_slot_id',required:1,enabled:1}])[0].kind).toBe('finalize'));
 it('sends a detailed receipt, escapes answers, and excludes student snapshots',()=>{
  const content=annualCompletionEmail({school,agency:{name:'Example Care'},schoolYear:'2026-27',cycle:{finalized_at:'2026-08-18',finalized_by_display_name:'School staff',snapshot_json:{clients:[{name:'PRIVATE STUDENT'}]}},sections:sections.map(s=>({...s,data_json:{days_per_week_onsite:'<script>bad</script>'}})),questions,portalUrl:'https://school.example/dashboard'});
  expect(content.subject).toContain('annual update received');expect(content.text).toContain('Days per week onsite: <script>bad</script>');expect(content.html).not.toContain('<script>');expect(content.text).not.toContain('PRIVATE STUDENT');expect(content.text).not.toContain('portal is ready');
 });
 it('lists outstanding answers in school reminders and staff reports',()=>{
  const schedule=annualSchedule('2026-27',rules,new Date('2026-08-25T18:00:00Z'));const outstanding=outstandingAnnualInfo(sections,questions);
  const reminder=annualSchoolEmail({kind:'followup',school,agency:{name:'Example'},schoolYear:'2026-27',schedule,outstanding,portalUrl:'https://school.example/dashboard'});
  expect(reminder.text).toContain('Days per week onsite');expect(reminder.text).toContain('2026-08-31');
  const report=annualDeadlineEmail({agency:{name:'Example'},schoolYear:'2026-27',schedule,cohort:[{school,cycle:{status:'in_progress'},eligible:true,outstanding}],final:true,adminUrl:'https://example/admin'});
  expect(report.text).toContain('Example School');expect(report.text).toContain('Days per week onsite');expect(report.text).toContain('No school has been marked complete automatically');
 });
 it('includes submitted staff roles, clinician days, event details, and check-in location',()=>{
  const content=annualCompletionEmail({school,agency:{name:'Example'},schoolYear:'2026-27',cycle:{snapshot_json:{staff:[{name:'School Contact',title:'Principal'}],providers:[{name:'Clinician',assignments:[{dayOfWeek:'Tuesday',startTime:'09:00',endTime:'15:00'}]}],events:{attendableEvents:[{title:'School night',startsAt:'2026-08-14',locationText:'Library'}]},fallCheckInBooking:{startsAt:'2026-08-20',modality:'in_person',locationText:'Main office'}}},sections:[],questions:[{section_key:'fall_check_in',question_key:'fall_checkin_slot_id',enabled:1,label:'Internal slot'}]});
  expect(content.text).toContain('School Contact · Principal');expect(content.text).toContain('Tuesday 09:00–15:00');expect(content.text).toContain('School night · 2026-08-14 · Library');expect(content.text).toContain('Main office');expect(content.text).not.toContain('Internal slot');
 });
 it('includes staffing and event answers collected outside configurable questions',()=>{
  const content=annualCompletionEmail({school,agency:{name:'Example'},schoolYear:'2026-27',cycle:{},sections:[{section_key:'assigned_providers',data_json:{capacity_outlook:'more',notes:'Tuesdays preferred'}},{section_key:'school_events',data_json:{bts_status:'no_event',bts_note:'No fall event'}}],questions:[]});
  expect(content.text).toContain('More clinicians or days may be needed');expect(content.text).toContain('Tuesdays preferred');expect(content.text).toContain('No event planned');expect(content.text).toContain('No fall event');
 });
});
