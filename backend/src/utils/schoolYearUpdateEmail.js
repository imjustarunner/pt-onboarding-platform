import { ANNUAL_SECTION_LABELS } from './schoolYearUpdatePolicy.js';
const e=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const json=value=>{if(typeof value!=='string')return value||{};try{return JSON.parse(value);}catch{return {};}};
const valueLabel=value=>value===true?'Yes':value===false?'No':Array.isArray(value)?value.map(valueLabel).join(', '):value&&typeof value==='object'?Object.values(value).filter(v=>typeof v!=='object').join(' · '):String(value??'Not provided');
function email(subject,paragraphs,linkUrl,linkLabel='Open your school portal') {
  return {subject,text:paragraphs.join('\n\n')+(linkUrl?`\n\n${linkLabel}: ${linkUrl}`:''),html:`<div style="font-family:Arial,sans-serif;line-height:1.6;color:#20332f"><h1 style="font-size:24px">${e(subject)}</h1>${paragraphs.map(p=>`<p>${e(p).replace(/\n/g,'<br>')}</p>`).join('')}${linkUrl?`<p><a href="${e(linkUrl)}" style="display:inline-block;padding:12px 20px;background:#17634b;color:white;border-radius:6px;text-decoration:none">${e(linkLabel)}</a></p>`:''}</div>`,linkUrl};
}
export function annualSchoolEmail({kind,school,agency,schoolYear,schedule,outstanding,portalUrl}) {
  const isFollowup=kind==='followup';
  const subject=kind==='invitation'?`${school.name}: ${schoolYear} annual school update`:`${school.name}: ${isFollowup?'outstanding school information':'annual update reminder'}`;
  return email(subject,[`Hello ${school.name} team,`,
    isFollowup?`The annual update deadline was ${schedule.dueOn}. Your saved answers are preserved. Please complete the outstanding information below by ${schedule.closesOn} (${schedule.timezone}).`:`Please review your school's information with ${agency.name} and submit your annual update by ${schedule.dueOn} (${schedule.timezone}). The update helps us plan school staffing, materials, events, and support.`,
    `Still needed:\n${outstanding.map(x=>`• ${x.label}`).join('\n')}`,
    'Saving each section does not submit the update. When the remaining items are complete, choose Finalize to send your completed summary to our Schools team.',
    `Need help or more time? Reply to this email. Our Schools team can help collect missing information or arrange a short extension. Your portal and student services remain available.`,
    `Thank you,\n${agency.name} Schools team`],portalUrl);
}
export function annualCompletionEmail({school,agency,schoolYear,cycle,sections,questions,portalUrl}) {
  const snapshot=json(cycle.snapshot_json);
  const detail=[];
  const extraLabels={school_events:{bts_status:'Back-to-school event status',bts_event_date:'Back-to-school event date',bts_event_title:'Back-to-school event title',bts_note:'Event notes'},assigned_providers:{capacity_outlook:'Staffing outlook',notes:'Clinician and scheduling notes',preferred_service_days:'Preferred service days',providers_confirmed:'Clinician roster confirmed'},school_staff:{staff_accurate:'School staff roster confirmed'}};
  const choices={has_event:'Event scheduled',no_event:'No event planned',partner_not_invited:'Agency not invited',partner_unable:'Agency unable to attend',same:'Same clinicians and days',more:'More clinicians or days may be needed',less:'Fewer clinicians or days may be needed'};
  for(const [key,label]of Object.entries(ANNUAL_SECTION_LABELS)) {
    const section=sections.find(s=>(s.section_key||s.sectionKey)===key);const data=json(section?.data_json||section?.data);
    const answers=questions.filter(q=>q.section_key===key&&Number(q.enabled)&&q.question_key!=='fall_checkin_slot_id').map(q=>{
      const value=data[q.question_key];const options=json(q.options_json);
      const option=Array.isArray(options)?options.find(o=>String(o.value)===String(value)):null;
      return `${String(q.label).replaceAll('{agencyName}',agency.name)}: ${value===undefined||value===null||value===''?'Not provided':option?.label||valueLabel(value)}`;
    });
    for(const [field,fieldLabel]of Object.entries(extraLabels[key]||{})) {
      if(data[field]===undefined||data[field]===null||data[field]===''||questions.some(q=>q.section_key===key&&q.question_key===field&&Number(q.enabled)))continue;
      answers.push(`${fieldLabel}: ${choices[data[field]]||valueLabel(data[field])}`);
    }
    detail.push(`${label}\n${answers.length?answers.join('\n'):'Reviewed by the school.'}`);
  }
  const people=items=>(Array.isArray(items)?items:[]).map(p=>{
    const assignments=(p.assignments||[]).map(a=>[a.dayOfWeek||a.day_of_week,[a.startTime,a.endTime].filter(Boolean).join('–')].filter(Boolean).join(' ')).join(', ');
    return [p.name||p.display_name||[p.first_name,p.last_name].filter(Boolean).join(' '),p.email,p.title||p.role_title,assignments||p.day_of_week].filter(Boolean).join(' · ');
  }).filter(Boolean).join('\n');
  const staff=people(snapshot.staff);const providers=people(snapshot.providers);
  if(staff)detail.push(`School staff on the submitted summary\n${staff}`);
  if(providers)detail.push(`Assigned clinicians on the submitted summary\n${providers}`);
  const events=[snapshot.events?.firstDay,snapshot.events?.backToSchool,...(snapshot.events?.attendableEvents||[])].filter(Boolean);
  const eventLines=[...new Set(events.map(event=>[event.title,event.startsAt,event.endsAt?`until ${event.endsAt}`:null,event.locationText||event.location].filter(Boolean).join(' · ')))];
  if(eventLines.length)detail.push(`School events on the submitted summary\n${eventLines.join('\n')}`);
  const booking=snapshot.fallCheckInBooking;
  if(booking?.startsAt)detail.push(`Booked check-in: ${[booking.startsAt,booking.modality,booking.locationText,booking.meetLink].filter(Boolean).join(' · ')}`);
  const subject=`${school.name}: ${schoolYear} annual update received`;
  return email(subject,[`Hello ${school.name} team,`,`Thank you. We received your annual school update. This is your completion receipt; no further annual-update reminders will be sent for this submission.`,
    `Submitted by: ${cycle.finalized_by_display_name||'School staff'}\nRecorded at: ${cycle.finalized_at instanceof Date?cycle.finalized_at.toISOString():cycle.finalized_at} (UTC)`,...detail,
    `The ${agency.name} Schools team is copied on this detailed receipt. Reply here for corrections or follow-up. Student-specific information and documents belong in the secure portal.`],portalUrl);
}
export function annualDeadlineEmail({agency,schoolYear,schedule,cohort,final,adminUrl}) {
  const eligible=cohort.filter(r=>r.eligible),done=eligible.filter(r=>r.cycle?.status==='finalized'),open=eligible.filter(r=>r.cycle?.status!=='finalized');
  const subject=`${agency.name}: ${schoolYear} annual update ${final?'closeout':'deadline'} report`;
  const rows=open.map(r=>`${r.school.name}${r.followup?.status==='waived'?' — follow-up waived by staff':''}${r.followup?.extension_until?` — extension: ${r.followup.extension_until instanceof Date?r.followup.extension_until.toISOString().slice(0,10):r.followup.extension_until}`:''}\n${r.outstanding.map(x=>`• ${x.label}`).join('\n')}${r.followup?.resolution_note?`\nStaff note: ${r.followup.resolution_note}`:''}${!r.school.group_email?'\n• School group email is missing; contact the school directly.':''}`);
  return email(subject,[`Annual update window: ${schedule.opensOn}–${schedule.dueOn}. Follow-up deadline: ${schedule.followupEndsOn} (${schedule.timezone}).`,
    `${eligible.length} returning schools in scope; ${done.length} submitted; ${open.length} without a final submission. ${cohort.filter(r=>r.reason==='first_year_onboarding').length} first-year schools are exempt. Test and inactive schools are excluded.`,
    final?'School reminders have ended. Saved answers remain available. Schools and Support own the outstanding follow-up list: contact each school for the specific missing items, grant a dated extension when useful, or record a waiver and reason. No school has been marked complete automatically.':'Schools with unfinished updates now have a short follow-up window. Reminders list their missing items. Please help schools that need support.',
    ...rows.length?rows:['All eligible schools have submitted.'],
    `Each completion receipt is sent through the Schools mailbox with the submitted details. Review saved records and follow-up decisions in the annual-update report.`],adminUrl,'Review annual updates');
}
