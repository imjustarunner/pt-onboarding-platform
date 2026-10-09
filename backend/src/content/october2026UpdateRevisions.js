import {itscoSuggestedTopicEdits} from './itscoOctober2026SuggestedEdits.js';
import {escapeHtml as e} from './itscoOctober2026Drafts.js';
const p=t=>`<p>${t}</p>`;
const list=items=>`<ul>${items.map(t=>`<li>${t}</li>`).join('')}</ul>`;
const app='https://app.itsco.health';
export const UPDATE_PALETTE=['#326b57','#315f8c','#7352a0','#a05528','#287d86','#96506d','#56682f','#6655a0'];
// Shared updater/handbook copy must not direct another agency to ITSCO.
export const spanishIntakeProcedure=itscoSuggestedTopicEdits.spanish_intake.body.replace(/ For ITSCO, use .*?both reach the same team\./,'');
export const businessCards=p('You can print your own business-card fronts at the office. Card stock will be available with the QR-code backs already printed; follow the printer and alignment instructions kept with the cards. Use the current app-generated card and check your name, credential and public contact details before printing a batch.')+p('Open your public provider profile from the Provider Update to check the information and your shareable link. Use the current template and leave the preprinted QR side intact. Ask support about a missing or outdated profile; do not add a private care-texting number to the public card.');
export const kioskTopic={key:'office_kiosk',icon:'spark',...itscoSuggestedTopicEdits.office_kiosk};
const milestones=[['Megan Geil-Crader',1],['Gio',2],['Dayana',3],['Michael',4],['Aneta',2],['Pauli',3],['Tatainya',2],['Hannah',4],['Destiny',2],['Rachel',4],['Lindsey',1],['Haley Inyart',3],['Mia',1],['Gini',3],['Jacque',2],['Mariela',2],['Caitlyn',2],['Bobby',1],['Jade',2],['Liz',4]];
export const schoolPartnershipUpdate = p('We are adding new school partnerships in both Colorado Springs and Denver.')
 + '<h3>Colorado Springs / D11</h3>' + list(['Colorado Springs School of Technology','Doherty High School','Keller Elementary','Steele Elementary','Tesla Educational Opportunity School'])
 + '<h3>Denver</h3>' + list(['Lake Middle School','Manual MS','Summit at Castro','Bradley International Elementary School','CTD at Greenlee','Denver Green Southeast'])
 + p('These schools have been added as part of our ongoing onboarding and partnership work. Your assigned school roster is the source of truth for your actual schedule. Review your school assignments, days, hours, and any open client actions in the Provider Update.')
 + '<h3>School Visit Reminders</h3>' + p('Families who have school-appointment reminders enabled will receive a message identifying the visit as a school visit and explaining how to report an absence or scheduling concern.')
 + p('“ITSCO: A school visit is planned today. If your child will be absent or there is a scheduling concern, please let us know. No confirmation is needed. Reply STOP to opt out.”');
export function itscoRevisionTopics(staff,schoolTopics){
 const byId=id=>staff.find(s=>Number(s.id)===id);
 const name=id=>{const s=byId(id);return s?e(`${s.first_name} ${s.last_name}`):null;};
 const portrait=id=>`{{staff:${id}:photo}}`;
 const person=id=>`${portrait(id)} <strong>${name(id)}</strong>`;
 const hires=[785,791,776,979,1147,1157,1185,1249].filter(id=>byId(id)).map(id=>`<tr><td style="width:132px;padding:18px 12px 18px 0;vertical-align:middle">${portrait(id)}</td><td style="padding:18px 0;vertical-align:middle"><p style="color:#4b7144;font-size:16px;letter-spacing:1px;margin:0 0 8px">{{staff:${id}:startDate}}</p><h3 style="color:#123c3c;font-size:26px;line-height:1.2;margin:0">${name(id)}</h3><p>{{staff:${id}:position}} · {{staff:${id}:base}}</p>${id===1147?p('Welcome, and congratulations on your recent SWC licensure! Thank you for taking this step to join our team.'):''}</td></tr>`);
 const departures=[...new Set([461,183,825,762,...staff.filter(s=>s.departureDate>='2026-04-01'&&s.departureDate<='2026-10-09'&&/intern/i.test(s.title||s.agency_position||'')).map(s=>Number(s.id))])].map(name).filter(Boolean);
 const emmi=staff.filter(s=>s.first_name?.toLowerCase()==='emmi'&&/regenbogen/i.test(s.last_name));
 const credentials=[[494,'SWC'],[8,'LSW'],[496,'LPCC'],...(emmi.length===1?[[emmi[0].id,'LPCC']]:[]),[457,'LPCC'],[505,'LPCC']].filter(([id])=>byId(id)).map(([id,credential])=>`${person(id)} — ${credential}`);
 if(!emmi.length)credentials.push('Emmi Regenbogen — congratulations on your LPCC licensure!');
 const roles=byId(496)?[`${person(496)} — congratulations on your new team role! ${e(byId(496).title||'')}`]:[];
 const milestoneIds={Michael:501,Pauli:506,Hannah:559,'Haley Inyart':3,Jacque:485,Mariela:494,Bobby:529,Liz:193};
 const anniversaryPeople=milestones.map(([label])=>{if(milestoneIds[label]&&byId(milestoneIds[label]))return byId(milestoneIds[label]);const matches=staff.filter(s=>[`${s.first_name} ${s.last_name}`.toLowerCase(),String(s.first_name).toLowerCase(),String(s.preferred_name||'').toLowerCase()].includes(label.toLowerCase()));return matches.length===1?matches[0]:{milestoneName:label};});
 return [
 {key:'people_since_march',title:'Welcome to the team',icon:'people',body:'<h2 style="font-family:Georgia,serif;font-style:italic;font-size:46px;color:#4b7144;margin:0;text-align:center">Welcome</h2><p style="font-size:24px;color:#123c3c;text-align:center;margin:6px 0 20px">to our new team members!</p><table role="presentation" style="width:100%;border-collapse:collapse"><tbody>'+hires.join('')+'</tbody></table><h3>With appreciation</h3>'+p(`We thank ${departures.join(', ')} for their contributions. Use current app assignments for coverage and contact support about reassigned work.`)},
 {key:'credentials_roles',title:'Congratulations · credentials and team roles',icon:'cap',body:p('Congratulations on these licensure milestones!')+list(credentials)+p('Congratulations on this new team role:')+list(roles)+p('Thank you for the care, leadership and coordination you bring to these roles.')},
 {key:'anniversaries',title:'Celebrating your time with the team',icon:'heart',body:p('Thank you for the work and commitment behind these team milestones:')+list(anniversaryPeople.map(s=>s.id?`${person(s.id)} — {{staff:${s.id}:tenure}}`:`${e(s.milestoneName)} — start date needs confirmation`))},
 {key:'schools_since_march',title:'School Partnerships · Colorado Springs & Denver',icon:'cap',body:schoolPartnershipUpdate},
 {key:'spanish_intake',icon:'chat',...itscoSuggestedTopicEdits.spanish_intake},
 {key:'business_cards',icon:'document',...itscoSuggestedTopicEdits.business_cards},
 kioskTopic
 ];
}
export function nextLevelUpTopics({departures=[]}={}){
 const names=departures.map(s=>e(`${s.first_name} ${s.last_name}`)).join(', ');
 return [
 {key:'welcome',title:'Next Level Up · your October update',icon:'heart',body:p('This is NLU’s own team update: a practical guide to your staff review, programming, work tools and upcoming changes. Please review the information that applies to your role and record time spent on required updates through the designated paid-work process.')},
 {key:'people',title:'Our team and coverage',icon:'people',body:p(`Thank you to departing NLU colleagues${names?`: ${names}`:''} for their contributions. Use current assignments in the app when checking program coverage. Ask support about a reassignment or a team member who should be included in the final update.`)},
 {key:'programs',title:'Programming, schedules and your work',icon:'calendar',body:p('Review your assigned programs, sessions, participant lists and locations in the app. Open assigned tasks for the exact action, due date and supporting documents. Use the program’s attendance and time-entry workflow and report a coverage or schedule problem to the responsible team.')+p('Upcoming program changes will be added to this section as dates and assignments are finalized. Do not treat a draft announcement as a new participant assignment or a confirmed schedule.')},
 {key:'compensation',title:'Your individual pay category and level',icon:'chart',body:p('Your individual amendment will state the category, level and rates that apply to your NLU work. Review your own completed schedule and ask about anything unclear before signing. The NLU rate schedule is being completed; ITSCO clinical billing rates do not automatically apply to NLU coaching, tutoring or program work.')+p('No rate or payroll setting changes merely because this draft is visible. Completed amendments will be issued separately for electronic signature and retained in your profile.')},
 {key:'profile',title:'Your profile and the NLU website',icon:'client',body:p('Review your current photo, introduction, credentials and strongest focus areas in the staff updater. Select the areas you do not serve and highlight up to three in each category. Check your public profile when it is published; share only the agency’s current public contact information.')+p('<a href="https://nextleveluplcc.com">Visit the Next Level Up website</a>')},
 {key:'communications',title:'Messages, notifications and meeting links',icon:'chat',body:p('Choose your communication preferences in the updater. NLU service communications have campaign approval; sending still depends on number configuration, consent and account readiness. Do not use ITSCO’s staff polling campaign as NLU’s sender. App notifications remain available according to your access and settings.')+p('An enabled reminder can say “You have a message waiting—sign in to reply” or direct you to an upcoming meeting in the app. Personal-phone forwarding and other phone features will be announced when available. Keep participant details in the authorized record and use support for a routing problem.')},
 {key:'spanish_intake',title:'Spanish-speaking families · intake coordination',icon:'chat',body:spanishIntakeProcedure},
 {key:'business_cards',title:'Business cards and profile links',icon:'document',body:businessCards},
 {...kioskTopic,key:'office_kiosk',body:kioskTopic.body.replace('/itsco/kiosk','/nlu/kiosk')},
 {key:'library_transition',title:'The app, Library and account transitions',icon:'gear',body:p('Use the app’s tasks and approved document Library for your role. We are working toward a more unified email and document experience. Continue using current approved email and sign-in access until your individual migration is confirmed; this draft does not announce a Google account shutdown date.')+p('Private virtual rooms are coming. Meeting access, appropriate uses and invitations will be explained before rollout. Install Quick View on your phone home screen if you use it, protect your device and code, and ask support for another access option if needed.')},
 {key:'terms',title:'NLU terms and privacy',icon:'policy',body:p(`<a href="${app}/nlu/terms">NLU terms</a> · <a href="${app}/nlu/privacypolicy">NLU privacy policy</a>`)+p('Review the terms for your organization. Staff SMS choices, access to client messaging and signing an amendment are separate actions.')}
 ];
}
