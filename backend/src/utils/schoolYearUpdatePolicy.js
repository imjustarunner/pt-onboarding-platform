export const ANNUAL_SECTION_LABELS = {
  school_events: 'School events', assigned_providers: 'Assigned clinicians', school_staff: 'School staff',
  materials: 'Materials', needs_assessment: 'Service needs', fall_check_in: 'Fall check-in', growth_feedback: 'Feedback'
};
export const DEFAULT_ANNUAL_RULES = { enabled: 0, timezone: 'America/Denver', opens_md: '08-01', due_md: '08-21', followup_md: '08-31' };
export function localDate(now = new Date(), timezone = 'America/Denver') {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now).map(p => [p.type,p.value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}
export function annualSchoolYear(now = new Date(), timezone = 'America/Denver') {
  const date = localDate(now, timezone); const y = Number(date.slice(0,4)) - (date.slice(5,7) < '07' ? 1 : 0);
  return `${y}-${String(y+1).slice(-2)}`;
}
export function addDays(date, days) { return new Date(Date.parse(`${date}T12:00:00Z`) + days * 86400000).toISOString().slice(0,10); }
export function validateAnnualRules(input) {
  const rules = { ...DEFAULT_ANNUAL_RULES, ...input, enabled: [true,1,'1'].includes(input.enabled) ? 1 : 0 };
  try { new Intl.DateTimeFormat('en-US', { timeZone: rules.timezone }).format(); } catch { throw Object.assign(new Error('Choose a valid time zone.'), { status: 400 }); }
  for (const key of ['opens_md','due_md','followup_md']) {
    const md = String(rules[key]); const date = new Date(`2027-${md}T12:00:00Z`);
    if (!/^\d{2}-\d{2}$/.test(md) || Number.isNaN(date.getTime()) || date.toISOString().slice(5,10) !== md || md < '07-01') throw Object.assign(new Error('Use valid dates from July through December.'), { status: 400 });
  }
  if (rules.opens_md >= rules.due_md || rules.due_md >= rules.followup_md || addDays(`2027-${rules.opens_md}`,14) > `2027-${rules.due_md}` || addDays(`2027-${rules.due_md}`,7) > `2027-${rules.followup_md}`) throw Object.assign(new Error('Allow at least 14 days for the update and 7 days for follow-up.'), { status: 400 });
  return rules;
}
export function annualSchedule(schoolYear, rules = DEFAULT_ANNUAL_RULES, now = new Date(), extensionUntil = null) {
  if (!/^\d{4}-\d{2}$/.test(schoolYear)) throw Object.assign(new Error('Invalid school year.'), { status: 400 });
  const year = schoolYear.slice(0,4), today = localDate(now, rules.timezone);
  const opensOn = `${year}-${rules.opens_md}`, dueOn = `${year}-${rules.due_md}`, followupEndsOn = `${year}-${rules.followup_md}`;
  const extension = extensionUntil ? String(extensionUntil).slice(0,10) : null;
  const closesOn = extension && extension > followupEndsOn ? extension : followupEndsOn;
  const phase = today < opensOn ? 'scheduled' : today <= dueOn ? 'open' : today <= closesOn ? 'followup' : 'closed';
  return { opensOn,dueOn,followupEndsOn,closesOn,timezone:rules.timezone,today,phase,
    remindersOn: [...new Set([addDays(opensOn,7),addDays(opensOn,14),addDays(dueOn,-2)])].filter(d=>d<dueOn).sort(),
    followupRemindersOn: [addDays(dueOn,4),addDays(followupEndsOn,-3)].filter(d=>d>dueOn&&d<=followupEndsOn).sort() };
}
export function annualEligibility(school, schoolYear) {
  if (!school || !Number(school.is_active) || Number(school.is_archived) || school.organization_type !== 'school' || !Number(school.affiliated)) return { eligible:false,reason:'inactive_or_unaffiliated' };
  if (/(\btest\b|\bdemo\b|fake|hogwarts|durmstrang|detention.academy|analytical.engine|onboarding.test|qr.self.serve)/i.test(`${school.name} ${school.slug}`)) return {eligible:false,reason:'test_school'};
  const started = school.first_onboarding_at || school.first_affiliation_at || school.created_at;
  const startDate = started instanceof Date ? started.toISOString().slice(0,10) : String(started || '').slice(0,10);
  if (startDate && startDate >= `${schoolYear.slice(0,4)}-07-01`) return { eligible:false,reason:'first_year_onboarding' };
  return { eligible:true,reason:null };
}
export function outstandingAnnualInfo(sections = [], questions = [], finalized = false) {
  if (finalized) return [];
  const outstanding = [];
  for (const [key,label] of Object.entries(ANNUAL_SECTION_LABELS)) {
    const section = sections.find(s=>(s.section_key || s.sectionKey)===key);
    if (!section?.reviewed && !section?.completed) outstanding.push({ sectionKey:key,kind:'review',label:`Review ${label.toLowerCase()}` });
  }
  for (const q of questions) {
    if (!Number(q.enabled) || !Number(q.required) || ['first_day_of_school','fall_checkin_slot_id','fall_checkin_modality'].includes(q.question_key)) continue;
    const section = sections.find(s=>(s.section_key||s.sectionKey)===q.section_key);
    let data = section?.data || section?.data_json || {}; if(typeof data==='string') { try { data=JSON.parse(data); } catch { data={}; } }
    if(data[q.question_key]===undefined || data[q.question_key]===null || data[q.question_key]==='') outstanding.push({sectionKey:q.section_key,questionKey:q.question_key,kind:'answer',label:q.label});
  }
  if (!outstanding.length) outstanding.push({sectionKey:null,kind:'finalize',label:'Submit the completed update'});
  return outstanding;
}
// Choose only the current reminder stage after downtime; never replay a backlog.
export function dueAnnualReminder(schedule) {
  if (!['open','followup'].includes(schedule.phase)) return null;
  const stages = schedule.phase==='open' ? [schedule.opensOn,...schedule.remindersOn] : schedule.followupRemindersOn;
  const date = stages.filter(d=>d<=schedule.today).at(-1);
  return date ? { key:`${schedule.phase}:${date}`,date,kind:date===schedule.opensOn?'invitation':schedule.phase==='followup'?'followup':'reminder' } : null;
}
