import {itscoSuggestedTopicEdits} from './itscoOctober2026SuggestedEdits.js';
import {escapeHtml as e} from './itscoOctober2026Drafts.js';
const p = text => `<p>${text}</p>`;
const link=(url,label)=>`<a href="${url}">${label}</a>`;
const app='https://app.itsco.health';

/** Staff-facing copy, kept separate from compensation and private editor evidence. */
export function octoberAdminTopics({staff=[],schools=[]}={}) {
 const afterMarch = value => value && String(value).slice(0,10)>='2026-04-01' && String(value).slice(0,10)<='2026-10-07';
 const active = staff.filter(s=>s.status==='ACTIVE_EMPLOYEE' && Number(s.agency_active)===1 && !s.terminated_at);
 const arrivals=active.filter(s=>afterMarch(s.provider_start_date || s.hired_at));
 const departures=staff.filter(s=>afterMarch(s.termination_date || s.terminated_at));
 const names = rows => rows.map(s=>e(`${s.first_name} ${s.last_name}`)).join(', ');
 const realSchools=schools.filter(s=>afterMarch(s.linked_at) && ![410,411,412,413,414,415,416].includes(Number(s.id)) && !/test|fake|demo|self serve/i.test(`${s.name} ${s.district_name}`));
 // School affiliations prove onboarding, not the first clinical service date.
 const springs=realSchools.filter(s=>s.district_name==='D11');
 const denver=realSchools.filter(s=>s.district_name==='DPS');
 const schoolNames=rows=>rows.map(s=>e(s.name)).join('; ');
 return [
  {key:'welcome_october',title:'A new season, a clearer place to work',icon:'heart',body:p('A lot has changed since our March update. This issue brings the practical steps together: your provider review, clearer compensation documents, school coordination, clinical tools and the next stages of our technology transition. Some tools are ready to use; planned releases are labeled below.')+p('This Admin Update is part of your personal Provider Update invitation. Continue through the remaining steps here. Review your information, availability, communication preferences, supervision hours and assigned documents.')},
  {key:'people_since_march',title:'People since March',icon:'people',body:p(`Please welcome the colleagues whose active records show a start or hire date since March: ${names(arrivals) || 'the new colleagues listed in the final release'}. Thank you for bringing your work and care to the team.`)+p(`Our records also show departures since March: ${names(departures) || 'none listed in this draft'}. We appreciate their contributions. Please route questions about coverage or reassigned work to support; use the current app assignments when contacting a care team.`)},
  {key:'schools_since_march',title:'School partnerships and onboarding',icon:'cap',body:p(`Colorado Springs school records added since March include ${schoolNames(springs) || 'the schools listed in the final release'}.`)+p(`Denver school records added since March include ${schoolNames(denver) || 'the schools listed in the final release'}. Additional new school records include Denver Green Southeast, Steele Elementary and Tesla Educational Opportunity School; their regional details are being completed.`)+p('These are school onboarding additions, not a statement that clinical services have started at every site. Check your assigned school, day, room and roster in the app. Confirm actual school availability and identify missing enrollment steps. School-based reminders will ask families to tell us about absences or problems rather than requiring a “yes” confirmation.')},
  {key:'compensation_october',enabled:false,title:'Your compensation amendment · October 10',icon:'chart',body:p('Your individual amendment identifies your category, level and service-credit, H-code, indirect and support activity rates. Review it in this Provider Update with the dated Colorado Billing & Compensation Appendix. Your service rate pays for clinical credit services; H-code work follows its separately stated direct and indirect calculation. Review the new-hire probation rules and the 60-day minimum-workload transition waiver in your personal schedule.')},
  {key:'tasks_my_work',icon:'policy',...itscoSuggestedTopicEdits.tasks_my_work},
  {key:'notes_workspace',icon:'document',...itscoSuggestedTopicEdits.notes_workspace},
  {key:'supervision',icon:'cap',...itscoSuggestedTopicEdits.supervision},
  {key:'availability_profiles',icon:'calendar',...itscoSuggestedTopicEdits.availability_profiles},
  {key:'communication_rollout',icon:'chat',...itscoSuggestedTopicEdits.communication_rollout},
  {key:'private_virtual_rooms',enabled:false,icon:'spark',...itscoSuggestedTopicEdits.private_virtual_rooms},
  {key:'therapynotes_transition',icon:'target',...itscoSuggestedTopicEdits.therapynotes_transition},
  {key:'google_transition',icon:'gear',...itscoSuggestedTopicEdits.google_transition},
  {key:'quick_view',icon:'lightbulb',...itscoSuggestedTopicEdits.quick_view},
  {key:'terms_links',title:'Terms, privacy and messaging information',icon:'policy',body:'<ul>'+[
   [app+'/itsco/terms','ITSCO terms, including messaging'],[app+'/itsco/privacypolicy','ITSCO privacy policy'],[app+'/itsco/platformhipaa','ITSCO privacy practices notice'],
   [app+'/sms-programs/2/polling/terms','ITSCO staff notifications and polling terms']
  ].map(([u,l])=>`<li>${link(u,l)}</li>`).join('')+'</ul>'+p('Please read the terms for the workspace you use. A terms acknowledgment is not a substitute for choosing SMS preferences or signing your individual compensation amendment. Ask support about a link that does not open or a policy that does not match your agency.')}
 ];
}
