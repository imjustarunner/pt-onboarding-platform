import { isBachelorsCredentialText } from '../utils/credentialNormalization.js';
import { normalizeChildcareRatesByBand } from './nluCompensationPolicy.js';

export const CONTRACT_SERVICE_ROLE_VERSION = 'service-role-clauses-2026-11-12';
const duty = (id, title, body, description) => ({
  id, title, description, clause_key: `ROLE_${id.toUpperCase()}`,
  body_html: `<h2>${title}</h2>${body}`, policyVersion: CONTRACT_SERVICE_ROLE_VERSION
});

/** These duties describe an assigned role; selecting one never grants practice authority. */
export const CONTRACT_SERVICE_ROLES = [
  duty('bachelors_counseling', 'Bachelor’s-level counseling and skills support',
    '<p>The employee may provide only specifically approved bachelor’s-level counseling, psychoeducation, skill development and supportive interventions within the employee’s documented qualifications and assigned scope. This role is distinct from master’s-level psychotherapy and does not authorize independent diagnosis, psychological interpretation or psychotherapy beyond the employee’s legally authorized role.</p><p>Follow the approved service plan, document the actual intervention, maintain role-appropriate oversight and consultation, and escalate clinical risk, diagnostic questions and work outside the approved scope to the responsible qualified professional. The Practice must verify applicable professional registration or exemption, payer rendering-provider eligibility and supervision before assigning or billing a service. An internal title, compensation category or H-code does not establish authorization.</p>',
    'Role-specific supportive counseling, psychoeducation, skills work and required oversight; distinct from psychotherapy.'),
  duty('psychotherapy', 'Master’s-level psychotherapy responsibilities',
    '<p>The employee may provide psychotherapy and other approved master’s-level clinical services only when the Practice has verified the employee’s education, applicable license, registration, training status or exemption, competence, authorized scope and required supervision. An unlicensed or pre-licensed employee must work within the permitted role and documented supervision arrangement; this clause does not represent independent licensure.</p><p>Perform authorized assessment, individualized treatment planning, psychotherapy, risk assessment, care coordination and clinical documentation appropriate to the assignment. Obtain required informed consent, identify the employee’s actual credentials and supervisor, use approved clinical methods, and consult or refer when needs exceed competence or authority. Payer eligibility and service-specific authorization must be verified separately from compensation placement.</p>',
    'Approved assessment, treatment planning, psychotherapy and clinical documentation subject to actual qualifications and supervision.'),
  duty('tutoring', 'Tutoring and educational support responsibilities',
    '<p>Provide assigned tutoring, Homework Help and educational support within documented subject-area competency, student needs and the approved learning plan. Record attendance, actual service time, educational activities, progress and appropriate caregiver communication. Ordinary academic progress checks are not psychological testing.</p><p>Tutoring placement and compensation must be stated in the completed individual service schedule, including format, applicable tutoring level and indirect rate. Approved tutoring receives the applicable handbook allowance of 10 paid indirect minutes per direct tutoring hour, prorated; record additional actual compensable work without duplicate payment. Homework Help retains its separately approved pay and allowance rules. A tutoring assignment does not authorize psychotherapy, clinical H2014 or insurance billing.</p>',
    'Educational services, progress records, approved tutoring placement and applicable indirect-time rules.'),
  duty('childcare', 'Childcare and daycare responsibilities',
    '<p>Provide approved nonclinical childcare using age-appropriate activities, active supervision, safe arrival and release procedures, confidentiality, emergency procedures and required reporting. The Practice must verify applicable age, training, screening, facility and staffing requirements before assignment. A compensation band is not a legally permissible child-to-caregiver ratio.</p><p>The completed individual childcare schedule must state the applicable pay level, one-child base rate, additional-child bands and any written exception. Record actual attendance and actively assigned caregivers; for shared groups divide children in care by active caregivers and round up solely to choose the approved compensation band. Calculate separate groups separately. Required preparation, cleanup and on-duty availability with no children present use the agreed one-child base rate unless another assignment and rate were established in advance. Childcare has no additional automatic indirect allowance under this schedule. More than four children per caregiver requires immediate staffing review and does not automatically extend a pay table.</p>',
    'Nonclinical care, active supervision, actual attendance/staffing records and a separately completed childcare pay schedule.'),
  duty('psychological_testing', 'Psychological testing responsibilities and oversight',
    '<p>Testing work requires prior written approval of the employee’s qualifications, demonstrated instrument-specific competence, assigned components, responsible professional, supervision, informed consent and payer requirements. Distinguish administration and scoring from evaluation, interpretation, report integration and feedback. A compensation category, job title or another professional’s license does not independently authorize those activities.</p><p>Under C.R.S. § 12-245-232(3), a psychometrician or student trainee may administer tests under the direct supervision of a licensee who meets the section’s instrument-specific qualifications. Verify that the actual personnel and arrangement satisfy the statute and applicable professional rules before assignment. Administration and scoring may be assigned to a qualified supervised assistant or technician only when permitted by professional scope, instrument requirements and payer rules. The responsible professional must provide the required ongoing review, direction, monitoring and records; responsibility is not limited to maintaining an ethical or safe setting. Clinical interpretation, diagnostic conclusions and final reports must remain with an appropriately qualified and authorized professional. Do not represent a technician as a qualified health care professional.</p><p>Record actual time, dates, instruments, personnel, supervision and each service component separately. The completed testing schedule must state hourly compensation for administration/scoring and for any separately authorized evaluation work, including the applicable indirect allowance. Billing units, reimbursement and claim dates do not determine paid work time. Do not duplicate minutes across testing, report preparation, psychotherapy, telephone assessment or another service; verify current code coverage, rendering-provider eligibility and payer-specific claim rules before billing.</p>',
    'Separately authorized administration/scoring and professional evaluation, with component-specific time, qualification and oversight records.')
];

export function normalizeContractServiceRoles(value, { strict = false } = {}) {
  if (!Array.isArray(value)) {
    if (strict) throw Object.assign(new Error('Service roles must be a list of selected roles.'), { status: 400 });
    return [];
  }
  const allowed = new Set(CONTRACT_SERVICE_ROLES.map(role => role.id));
  if (strict && value.some(id => !allowed.has(id))) throw Object.assign(new Error('Choose valid contract service roles.'), { status: 400 });
  return [...new Set(value.filter(id => allowed.has(id)))];
}

export function normalizeContractServiceRoleDetails(value = {}) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const details = {};
  for (const role of CONTRACT_SERVICE_ROLES) if (value[role.id] && typeof value[role.id] === 'object') {
    details[role.id] = {
      compensationTerms:String(value[role.id].compensationTerms || '').trim().slice(0,6000),
      authorizationTerms:String(value[role.id].authorizationTerms || '').trim().slice(0,4000)
    };
    if (value[role.id].payLevel != null && value[role.id].payLevel !== '') {
      const level=Number(value[role.id].payLevel);
      if(!Number.isInteger(level)||level<1||level>5)throw Object.assign(new Error('Choose a valid service-specific pay level from 1 through 5.'),{status:400});
      details[role.id].payLevel=level;
    }
    if (value[role.id].hourlyRate != null && value[role.id].hourlyRate !== '') {
      const rate=Number(value[role.id].hourlyRate);
      if(!Number.isFinite(rate)||rate<=0||rate>100000)throw Object.assign(new Error('Confirm a positive individual service hourly rate.'),{status:400});
      details[role.id].hourlyRate=rate;
    }
    if (role.id === 'childcare' && value.childcare.ratesByBand != null) details.childcare.ratesByBand=normalizeChildcareRatesByBand(value.childcare.ratesByBand);
  }
  return details;
}

const escape = value => String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

/** Posting selections win over inference, including an explicitly empty list. */
export function inferContractServiceRoles({ job = {}, credential = '', serviceFocus = '' } = {}) {
  let config = job.prehire_config_json || {};
  try { if (typeof config === 'string') config = JSON.parse(config); } catch { config = {}; }
  if (Object.hasOwn(config.contractDefaults || {}, 'serviceRoles')) return {
    roles: normalizeContractServiceRoles(config.contractDefaults.serviceRoles), source: 'Posting contract defaults'
  };
  let tags = job.tags_json || [];
  try { if (typeof tags === 'string') tags = JSON.parse(tags); } catch { tags = []; }
  const postingFocus = config.contractDefaults?.serviceFocus;
  const context = [job.title, job.applied_role, job.role_type, ...(Array.isArray(tags) ? tags : []), postingFocus || serviceFocus].filter(Boolean).join(' ');
  const roles = [];
  if (/child\s*care|day\s*care|caregiver|babysit/i.test(context)) roles.push('childcare');
  if (/psychometr|psychological\s+test|neuropsych|testing\s+(?:technician|assistant|provider)|test\s+administr/i.test(context)) roles.push('psychological_testing');
  if (/tutor|homework|academic\s+support|educational\s+support/i.test(context)) roles.push('tutoring');
  if (/psychotherap|counsel|mental\s+health|clinical\s+(?:provider|intern)|therapist|skills?\s+(?:support|develop)|facilitator/i.test(context)) {
    const masters = /\b(?:MA|MS|MEd|MSW|PhD|PsyD|LPC|LPCC|LCSW|LSW|LMFT|MFTC)\b|master|doctor/i.test(credential);
    if (masters || /psychotherap|master.?s.level/i.test(context)) roles.push('psychotherapy');
    else if (isBachelorsCredentialText(credential) || /bachelor|facilitator|skills?\s+(?:support|develop)/i.test(context)) roles.push('bachelors_counseling');
  }
  return { roles: [...new Set(roles)], source: 'Applied job, service focus and recorded credential; review before generation' };
}

/** A review suggestion for new NLU contracts, never an automatic employee reassignment. */
export function inferNluContractCategory({credential = '',jobTitle = '',role = ''} = {}) {
  const independent=/\b(?:LPC|LCSW|LMFT|LAC|LPSY|LP)\b|licensed\s+psychologist|\b(?:LPC|CSW|MFT)\.\d/i.test(credential);
  const candidate=/\b(?:LPCC|MFTC|LSW|SWC|LMFTC|LPC-A)\b|pre.?licensed|candidate|LPC.?associate/i.test(credential);
  if (independent && !candidate && !/\bunlicensed\b/i.test(credential)) return 4;
  if (candidate || /\b(?:MA|MS|MEd|MSW|MCouns|PhD|PsyD)\b|master|doctor/i.test(credential)) return 3;
  if (isBachelorsCredentialText(credential) || /\bMBA\b|\bBBA\b/i.test(credential)) return 2;
  if (/intern|practicum|student/i.test(`${credential} ${jobTitle} ${role}`) && !/high\s*school|associate/i.test(credential)) return null;
  if (/GED|high.school|associate|\bAA\b|\bAS\b|no\s+bachelor/i.test(credential) || /child\s*care|day\s*care/i.test(jobTitle)) return 1;
  return null;
}

export function contractServiceRolePlan({ selected, inferred, details, libraryClauses = [], enabled = true } = {}) {
  if (!enabled) return { roles: [], clauses: [], manifest: [], missingFields:[] };
  const roles = selected === undefined ? normalizeContractServiceRoles(inferred) : normalizeContractServiceRoles(selected, {strict:true});
  const approvedDetails = normalizeContractServiceRoleDetails(details);
  const library = new Map(libraryClauses.map(clause=>[clause.clause_key,clause]));
  const missingFields = [];
  for (const role of roles) {
    if (['childcare','psychological_testing'].includes(role) && !approvedDetails[role]?.compensationTerms) missingFields.push(`${role.toUpperCase()}_COMPENSATION_TERMS`);
    if (role === 'childcare' && !approvedDetails[role]?.payLevel) missingFields.push('CHILDCARE_PAY_LEVEL');
    if (role === 'psychological_testing' && !approvedDetails[role]?.authorizationTerms) missingFields.push('PSYCHOLOGICAL_TESTING_AUTHORIZATION_TERMS');
  }
  return {
    roles, missingFields,
    clauses: CONTRACT_SERVICE_ROLES.filter(role => roles.includes(role.id)).map(role => {
      const terms=approvedDetails[role.id];
      const saved=library.get(role.clause_key);
      if (saved && (Number(saved.is_active)===0 || !String(saved.body_html||'').trim())) throw Object.assign(new Error(`The selected role clause is inactive or empty: ${role.title}. Review its library entry before generating.`),{status:400});
      return {...role,title:saved?.title || role.title,body_html:(saved?.body_html || role.body_html) + (terms?.payLevel?`<p><strong>Approved ${role.id==='childcare'?'childcare':'service-specific'} pay level:</strong> ${terms.payLevel}</p>`:'') + (terms?.hourlyRate?`<p><strong>Individual hourly-rate override:</strong> $${terms.hourlyRate.toFixed(2)}; apply only as expressly described in the written service terms.</p>`:'') + (terms?.compensationTerms?`<h3>Individual compensation terms for this service</h3><p>${escape(terms.compensationTerms).replace(/\n/g,'<br />')}</p>`:'') + (terms?.authorizationTerms?`<h3>Approved assignment and supervision</h3><p>${escape(terms.authorizationTerms).replace(/\n/g,'<br />')}</p>`:''),policyReason:'Selected service role; qualifications and separate compensation terms remain required'};
    }),
    manifest: CONTRACT_SERVICE_ROLES.map(role => ({key:role.clause_key,title:role.title,included:roles.includes(role.id),reason:roles.includes(role.id)?'Selected service role':'Service role is not selected',policyVersion:CONTRACT_SERVICE_ROLE_VERSION}))
  };
}

export function applyContractServiceRoleClauses(clauses, plan, { replaceFallbackClinicalDuties = false } = {}) {
  if (!plan.manifest.length) return clauses;
  const known = new Set(CONTRACT_SERVICE_ROLES.map(role => role.clause_key));
  const filtered = clauses.filter(clause => !known.has(clause.clause_key) && !(replaceFallbackClinicalDuties && clause.clause_key === 'JOB_DESC_LPC')).map(clause=>{
    if(!replaceFallbackClinicalDuties || !/^STARTER_V1_DUTIES_(?:HOURLY|FFS)$/.test(clause.clause_key))return clause;
    return {...clause,body_html:clause.body_html.replace('Clinical supervision and approvals must be in place before providing services;','Role-appropriate oversight and required approvals must be in place before assigned services;')};
  });
  const signatureIndex = filtered.findIndex(clause => /(?:^|_)(?:SIG_BLOCK|SIGNATURE_BLOCK)(?:_|$)/.test(clause.clause_key));
  filtered.splice(signatureIndex < 0 ? filtered.length : signatureIndex,0,...plan.clauses);
  return filtered;
}
