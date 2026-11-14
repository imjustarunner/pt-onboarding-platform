import { roleDevelopmentNovemberUpdates } from './roleDevelopmentNovember2026.js';
import { COUNSELING_EXPECTATIONS_HTML, childcarePolicyHtml } from './providerRolesNovember2026.js';
import { NLU_PAY_LEVELS } from './nluCompensationPolicy.js';
import { ADP_PAY_STATEMENT_SECTION, BONUS_TAX_SECTION, SICK_LEAVE_HOURS_SECTION } from './adpSickLeaveReportingHandbook.js';
import { DIRECT_CARE_INDIRECT_CORRECTION_HTML } from './directCareIndirectCorrection.js';
import { FLAT_ADDON_POLICY_HTML } from './flatAddonHandbookAmendment.js';
import { applySchoolSupportHandbookAmendment, SCHOOL_SUPPORT_NOVEMBER_UPDATE } from './schoolSupportHandbookAmendment.js';
import { TESTING_SERVICE_CODES, testingCompensationBasis } from './testingServicePolicy.js';

export const COLLECTIVE_HANDBOOK_RELEASE = 'collective-owner-review-2026-11-13';
export const COLLECTIVE_POLICY_PERIOD = 'November 2026';
const practices = {
  itsco: { name: 'ITSCO', slug: 'itsco', host: 'app.itsco.health' },
  nlu: { name: 'Next Level Up', slug: 'nlu', host: 'app.nextleveluplcc.com' },
  isi: { name: 'The Inner Strength Institute', slug: 'tisi', host: 'app.theinnerstrengthinstitute.com' }
};
const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const p = text => `<p>${text}</p>`;
const titleCase = value => value.replaceAll('&amp;', '&');
const definition = (slug, title, bodyHtml, parentSlug = null) => ({ slug, title, bodyHtml, parentSlug, sourcePage: null, status: 'ready' });

export const SHARED_REVIEW_POLICY_SLUGS = [
  'career-pathways-job-titles-service-focus-and-compensation-structure', 'career-pathway-overview',
  'service-focus-assignment', 'pay-levels-and-provider-designation', 'employee-contract-policy',
  'benefits-tier-framework', 'compensation-minimum-workload-rate',
  'compensation-introductory-probationary-compensation', 'direct-care-automatic-indirect-correction',
  'adp-pay-statements-and-sick-leave-hours', 'bonus-tax-withholding-and-gross-pay',
  'counseling-and-psychotherapy-role-expectations', 'childcare-role-and-supervision',
  'flat-clinical-addons-and-eligibility', 'testing-services', 'service-code-inventory'
];

export function reviewedTestingInventoryHtml() {
  const rows = TESTING_SERVICE_CODES.map(code => {
    const group = code.requiredRole ? code.bucket === 'credit' ? 'testing-evaluation' : 'testing-administration' : 'direct-care';
    const label = code.requiredRole ? code.bucket === 'credit' ? 'Testing · evaluation' : 'Testing · administration/scoring' : 'Related clinical Direct Care';
    return `<tr><th>${escape(code.code)}</th><td>${escape(code.name)}</td><td><mark data-service-group="${group}">${escape(label)}</mark><br />${code.bucket === 'credit' ? 'Clinical Session Rate' : 'Direct Care Rate'}</td><td>${escape(testingCompensationBasis(code))}</td><td>${code.requiredRole ? 'Testing role; verified component and qualifications; Medicaid only.' : 'Existing clinical authorization and payer eligibility required.'}</td></tr>`;
  }).join('');
  return '<h3>Testing code inventory and compensation basis</h3>'
    + p('The code identifies the service; its compensation bucket and actual eligible work determine paid time. A 9-series code does not automatically earn a full clinical credit. These reference rows do not activate medical claims or grant a provider permission to perform Testing.')
    + `<table><thead><tr><th>Code</th><th>Work</th><th>Service category / pay bucket</th><th>Credits and paid time</th><th>Eligibility</th></tr></thead><tbody>${rows}</tbody></table>`
    + p('Read <a href="#handbook-testing-services">Testing — services, code examples and pay buckets</a> for exact examples, source references, initial/add-on combinations and billing-time requirements. The billing settings inventory includes inactive references; payer/provider and unit configuration must be verified before activation.');
}

function adapt(html, tenant) {
  const practice = practices[tenant];
  return String(html || '').replaceAll('ITSCO, Next Level Up and Inner Strength share regular business hours', 'The three clinical practices share regular business hours')
    .replaceAll('https://app.itsco.health/itsco/', `https://${practice.host}/${practice.slug}/`)
    .replaceAll('ITSCO', practice.name);
}

function currentCompensationWording(source, tenant) {
  for (const s of source.sections) {
    if (tenant === 'isi' && (/^compensation-rate-category-[123]$/.test(s.slug) || ['role-based-supplemental-compensation-rate-schedule', 'program-service-rate-schedules'].includes(s.slug))) {
      s.bodyHtml = p('The Inner Strength Institute uses individually approved compensation. A category or provider designation does not import another practice’s wage table, tutoring program or program rate. The completed individual agreement states the authorized service, regular rate, any expressly selected introductory rate and duration, indirect allowance and effective date.')
        + p('See <a href="#handbook-pay-levels-and-provider-designation">Pay Levels 1–5 and provider designations</a>, <a href="#handbook-employee-contract-policy">individual agreements and the required probation choice</a>, and <a href="#handbook-service-code-inventory">the service code inventory</a>. Existing individual rates and earned compensation are preserved.');
      if (s.slug === 'program-service-rate-schedules') s.title = 'Individual service rates and approved scope';
      continue;
    }
    if (!/compensation|rate-schedule|billing-compensation/.test(s.slug) || ['employee-contract-policy','compensation-minimum-workload-rate','compensation-introductory-probationary-compensation','compensation-tier-3-minimum-workload-exemption'].includes(s.slug)) continue;
    s.bodyHtml = String(s.bodyHtml || '')
      .replace(/Probationary and minimum-workload rates/g, 'Introductory rates and the required Yes/No choice')
      .replace(/Probationary \/ minimum-workload rate/g, 'Introductory rate — only when Yes is selected')
      .replace(/Applicable introductory conditions, minimum-workload thresholds and individual waivers remain separate\./g, 'Introductory compensation requires an express Yes/No choice. Minimum-workload reductions are waived prospectively from November 13, 2026; prior service history and individual protections remain intact.')
      .replace(/Two distinct conditions that use the stated reduced rate:[\s\S]*?(?=<\/p>)/g, 'An introductory rate applies only when Yes is expressly selected in the completed individual agreement. Minimum-workload reductions are waived prospectively from November 13, 2026. Preserve earlier service-date history, completed probation and greater individual protections.')
      .replace(/Probation uses the disclosed minimum-workload rate in each pay category\./g, 'An expressly selected introductory period uses only the disclosed introductory rates in the individual schedule.')
      .replace(/Minimum-workload reductions are waived for 60 calendar days after the amendment[’']s prospective effective date\./g, 'Minimum-workload reductions are waived prospectively from November 13, 2026; new or revised schedules do not adopt a workload-based pay reduction.');
    s.bodyHtml = s.bodyHtml.replace(/<table>[\s\S]*?<\/table>/g, table => {
      const rows = [...table.matchAll(/<tr\b[^>]*>[\s\S]*?<\/tr>/g)];
      const header = rows.find(r => /<th\b/i.test(r[0]));
      if (!header) return table;
      const cells = [...header[0].matchAll(/<t[dh]\b[^>]*>[\s\S]*?<\/t[dh]>/g)];
      const index = cells.findIndex(c => /^\s*Minimum-workload rate\s*$/i.test(c[0].replace(/<[^>]*>/g, '')));
      if (index < 0) return table;
      return table.replace(/<tr\b[^>]*>[\s\S]*?<\/tr>/g, row => {
        const values = [...row.matchAll(/<t[dh]\b[^>]*>[\s\S]*?<\/t[dh]>/g)];
        return values[index] ? row.slice(0, values[index].index) + row.slice(values[index].index + values[index][0].length) : row;
      });
    });
  }
}

function upsert(source, value) {
  const current = source.sections.find(s => s.slug === value.slug);
  if (current) Object.assign(current, { ...value, parentSlug: value.parentSlug || current.parentSlug || null });
  else source.sections.push(value);
}

export function finishSuppliedHandbookStructure(source) {
  const excluded = [...(source.ownerReviewExcludedEmptySections || [])];
  // Empty imported headings are navigation containers, not unfinished policies.
  // Empty leaves contain no supplied policy text: preserve their identity in the
  // release audit rather than publishing a fabricated policy or blank appendix.
  let changed = true;
  while (changed) {
    changed = false;
    const leaves = source.sections.filter(s => !String(s.bodyHtml || '').replace(/<[^>]*>/g, '').trim() && !source.sections.some(child => child.parentSlug === s.slug));
    if (leaves.length) {
      const slugs = new Set(leaves.map(s => s.slug));
      for (const s of leaves) if (!excluded.some(x => x.slug === s.slug)) excluded.push({ slug: s.slug, title: s.title, reason: 'No policy text supplied in the reviewed source edition.' });
      source.sections = source.sections.filter(s => !slugs.has(s.slug));
      source.removedSectionSlugs = [...new Set([...(source.removedSectionSlugs || []), ...slugs])];
      changed = true;
    }
  }
  for (const s of source.sections) {
    if (String(s.bodyHtml || '').replace(/<[^>]*>/g, '').trim()) continue;
    const children = source.sections.filter(child => child.parentSlug === s.slug);
    s.bodyHtml = p('Read the policies in this part:') + `<ul>${children.map(child => `<li><a href="#handbook-${escape(child.slug)}">${escape(child.title)}</a></li>`).join('')}</ul>`;
    s.status = 'ready';
  }
  source.ownerReviewExcludedEmptySections = excluded;
  return source;
}

export function sharedRoleDevelopmentHtml(tenant) {
  const body = adapt(roleDevelopmentNovemberUpdates[0].changed_content, tenant);
  return body + p('These distinctions apply across The Mental Range Collective. Each company maintains its own authorized services and individual pay schedules. A shared role name or benefit framework does not copy another company’s rates, expand credentials, or enroll an employee in a benefit plan.');
}

export function sharedCareerPathwayHtml(tenant) {
  let body = adapt(roleDevelopmentNovemberUpdates[1].changed_content, tenant)
    .replace('Independently licensed provider practice:', 'Licensed and other approved advanced professional practice:');
  if (tenant === 'nlu') body = body.replace('</ul>', '<li><strong>Tutoring and learning support:</strong> develop subject- and grade-specific teaching skills, learning plans, progress review, family communication, and virtual or in-person educational support. Pay Levels 1–5 describe competency and responsibilities within the assigned learning role. A learning pathway does not require becoming a counselor and does not authorize clinical assessment, psychotherapy or insurance billing. Childcare, Homework Help, tutoring and clinical services retain their separately documented duties and pay.</li></ul>');
  if (tenant === 'isi') body = body.replaceAll('Facilitator and clinical support', 'Practice and clinical support');
  return body;
}

export function sharedServiceFocusHtml(tenant) {
  if (tenant === 'isi') return p('The Inner Strength Institute provides counseling, psychotherapy and separately approved clinical assessment or Testing within each individual’s verified qualifications and supervision. It does not offer tutoring. A separate tutoring or school-service-focus assignment is not required for its counseling agreements.')
    + p('The individual agreement records the authorized clinical responsibilities, setting, schedule, supervision and compensation. General role-development and benefit principles apply without creating a separate career-tier pay system. Childcare or Testing is assigned only through its separately approved service role and applicable individual terms.');
  return adapt(roleDevelopmentNovemberUpdates[2].changed_content, tenant)
    + p(tenant === 'itsco' ? 'School-based assignments are an ITSCO service focus and require the applicable school placement, schedule and approvals. Office and telehealth services retain their own expectations.' : 'Next Level Up may assign tutoring and learning support, counseling, approved Testing and nonclinical childcare as distinct services. School-based clinical placements and the ITSCO School Support Hours benefit are not NLU service focuses.');
}

export const SHARED_BENEFIT_FRAMEWORK_HTML = p('Role development, compensation category, Pay Level 1–5, employment status and benefit eligibility are separate decisions. This framework applies to ITSCO, Next Level Up and The Inner Strength Institute, with the actual benefits governed by each company’s adopted plan documents and the individual agreement. A common framework does not automatically provide every company with the same benefit or rate.')
  + '<h3>Workload and benefit reference levels</h3><table><thead><tr><th>Benefit tier</th><th>Reference weekly qualifying service average</th><th>Use</th></tr></thead><tbody><tr><td>Tier 1</td><td>6 to under 13</td><td>Entry reference level for an adopted tier-based benefit.</td></tr><tr><td>Tier 2</td><td>13 to under 25</td><td>Standard reference level for an adopted tier-based benefit.</td></tr><tr><td>Tier 3</td><td>25 or more</td><td>Premium reference level for an adopted tier-based benefit.</td></tr></tbody></table>'
  + p('These are benefit reference levels, not minimum employment commitments, pay categories or a second career ladder. Current part-time status or a lower service average is not itself noncompliance. New or revised compensation schedules under this release do not impose a minimum-workload pay reduction. A new optional benefit must identify its actual eligibility, measurement, grace and coverage rules in writing before activation; it is not promised merely because a tier is listed here.')
  + p('Previously accrued leave, earned wages and legally required benefits remain protected. Protected sick leave has no new-hire probationary waiting period. Existing individually approved benefits and greater protections remain effective. An optional introductory compensation period is a separate, expressly selected Yes/No contract choice; it does not create a probationary waiting period for statutory rights.');

export const SHARED_CONTRACT_POLICY_HTML = p('Before preparing a new employment agreement, the authorized preparer must expressly choose <strong>Yes</strong> or <strong>No</strong> for introductory/probationary compensation. No default is selected, and an unanswered choice prevents preparing or issuing the agreement. The completed agreement records the choice, the exact applicable rates, the original start date, the stated end condition and any service-specific duration. Choosing No uses the regular agreed rates.')
  + p('Choosing Yes applies only the disclosed introductory rates for the stated period, no more than the applicable 90-calendar-day general introductory period measured from the original employment start date. A separately approved program may have a shorter period disclosed in its own schedule. A role update, category renumbering, handbook publication or later workload change never restarts a completed period. Preserve existing waivers and higher agreed rates. There is no minimum-workload pay reduction in new or revised schedules under this release.')
  + p('The agreement states the person’s actual assigned services, duties, rate and time basis, supervision and effective date. Handbook references open the relevant company policy in a branded in-place viewer, showing the section and published handbook version. Reading a linked policy does not add a service role or silently amend agreed rates. The student training agreement governs any later approved student placement separately.');

export const SHARED_MINIMUM_WORKLOAD_HTML = p('Minimum-workload pay reductions are waived prospectively from November 13, 2026. No minimum-workload reduction is enabled for new or revised compensation schedules under this release. Current part-time employees do not lose agreed regular compensation merely because their service average is below a benefit reference tier. An expressly selected introductory compensation period remains a separate Yes/No agreement choice.')
  + p('Preserve all earned pay, previous waivers and higher individual terms. Earlier executed agreements and earlier service dates retain their recorded history; any favorable prospective waiver is recorded separately. A future minimum-workload rule would require a separate prospective review, explicit written terms and any required acceptance before it could apply. This section does not authorize a deduction or retrospective reduction.');

export function sharedPayLevelHtml(tenant) {
  return p('Each company uses these five provider designations to describe approved competency and responsibilities. A Pay Level is separate from a benefit tier, compensation category, professional credential and authorization to perform a service.')
    + `<table><thead><tr><th>Pay Level</th><th>Provider designation</th><th>Placement considerations</th></tr></thead><tbody>${NLU_PAY_LEVELS.map(level => `<tr><td>${level.level}</td><td>${escape(level.label)}</td><td>${escape(level.description)}</td></tr>`).join('')}</tbody></table>`
    + p(tenant === 'isi' ? 'The Inner Strength Institute retains individually approved compensation. These designations do not introduce another company’s rate matrix, tutoring service line or automatic increase.' : 'The individual agreement identifies the applicable company compensation category and service-specific pay level. Different duties may need separately approved placements; a clinical title does not itself establish advanced tutoring, childcare or Testing competence.')
    + p('Progression is reviewed and documented; it is not automatic. A senior designation does not itself establish professional licensure or authority to supervise.');
}

export function sharedAutomaticIndirectHtml(tenant) {
  return DIRECT_CARE_INDIRECT_CORRECTION_HTML
    .replace(/All employees in Categories 1, 2 and 3 receive/, 'Employees with eligible approved Direct Care assignments receive')
    .replace(/This includes approved H-codes and other approved non-9-series billable hourly or unit-based services assigned to that category;/, 'This includes approved H-codes and eligible Testing administration/scoring or clinical telephone work mapped to Direct Care;')
    .replace('including during probation or minimum-workload rates', 'including an expressly selected introductory period')
    + p(`This policy applies to ${practices[tenant].name} as well as the other collective clinical practices. Eligibility follows the approved service mapping and actual work, not the first digit of the code. The individual schedule or amendment states the allowance and applicable indirect rate; preserve a greater agreed allowance. Eligible tutoring follows its separate allowance where offered. Childcare and professional Testing evaluation do not acquire an additional automatic allowance from this paragraph. A newly prepared NLU compensation amendment must disclose the same approved Direct Care allowance; existing signed records remain intact.`);
}

export function applyCollectiveHandbookReview(source, updates = [], tenant) {
  if (!practices[tenant]) return { source, updates };
  applySchoolSupportHandbookAmendment(source, tenant);
  const additions = [
    definition('career-pathways-job-titles-service-focus-and-compensation-structure', 'Role development, compensation and benefit eligibility', sharedRoleDevelopmentHtml(tenant)),
    definition('career-pathway-overview', 'Role development pathways', sharedCareerPathwayHtml(tenant)),
    definition('service-focus-assignment', tenant === 'isi' ? 'Clinical responsibilities and individual expectations' : 'Service focus and individual expectations', sharedServiceFocusHtml(tenant)),
    definition('pay-levels-and-provider-designation', 'Pay Levels 1–5 and provider designations', sharedPayLevelHtml(tenant)),
    definition('employee-contract-policy', 'Individual agreements, probation choice and policy references', SHARED_CONTRACT_POLICY_HTML),
    definition('benefits-tier-framework', 'Benefit tiers and current part-time work', SHARED_BENEFIT_FRAMEWORK_HTML),
    definition('compensation-minimum-workload-rate', 'Minimum-workload reductions are not enabled in new schedules', SHARED_MINIMUM_WORKLOAD_HTML),
    definition('compensation-tier-3-minimum-workload-exemption', 'Preserved waivers and existing compensation history', SHARED_MINIMUM_WORKLOAD_HTML),
    definition('compensation-introductory-probationary-compensation', 'Introductory compensation requires an explicit Yes or No', SHARED_CONTRACT_POLICY_HTML),
    definition('direct-care-automatic-indirect-correction', 'Automatic indirect pay for approved Direct Care assignments', sharedAutomaticIndirectHtml(tenant)),
    definition(ADP_PAY_STATEMENT_SECTION.slug, ADP_PAY_STATEMENT_SECTION.title, adapt(ADP_PAY_STATEMENT_SECTION.bodyHtml, tenant)),
    definition(SICK_LEAVE_HOURS_SECTION.slug, SICK_LEAVE_HOURS_SECTION.title, adapt(SICK_LEAVE_HOURS_SECTION.bodyHtml, tenant)),
    definition(BONUS_TAX_SECTION.slug, BONUS_TAX_SECTION.title, adapt(BONUS_TAX_SECTION.bodyHtml, tenant)),
    definition('counseling-and-psychotherapy-role-expectations', 'Counseling support and psychotherapy: qualifications and expectations', COUNSELING_EXPECTATIONS_HTML),
    definition('childcare-role-and-supervision', 'Childcare role, staffing and supervision', childcarePolicyHtml(tenant)),
    definition('flat-clinical-addons-and-eligibility', 'Outside regular hours and eligible clinical add-ons', adapt(FLAT_ADDON_POLICY_HTML, tenant)),
    definition('service-code-inventory', 'Service code inventory, compensation buckets and credits', reviewedTestingInventoryHtml())
  ];
  const remove = tenant === 'itsco' ? [] : ['school-support-activity-hours', 'event-travel-reimbursement'];
  if (remove.length) {
    source.sections = source.sections.filter(s => !remove.includes(s.slug));
    source.removedSectionSlugs = [...new Set([...(source.removedSectionSlugs || []), ...remove])];
    for (const s of source.sections) {
      if (remove.includes(s.parentSlug)) s.parentSlug = null;
      if (s.slug === 'outreach-services-non-clinical') s.bodyHtml = p('Separately approved nonclinical work and required travel remain subject to the individual’s written assignment, actual-time records and applicable wage and reimbursement rules. The ITSCO-specific outreach travel submission policy and School Support Hours program are not adopted by this Practice.');
    }
  }
  if (tenant === 'isi') {
    // Keep historical anchors that already point here while removing an offered
    // tutoring service line from the current company edition.
    source.sections = source.sections.filter(s => !/^nlu-(?:tutoring|childcare|testing)-compensation$/.test(s.slug) && !/^(?:tutoring|homework-help)-(?:compensation|program|service)/.test(s.slug));
    for (const s of source.sections) if (/service-focus/.test(s.slug)) { s.title = 'Clinical responsibilities and individual expectations'; s.bodyHtml = sharedServiceFocusHtml(tenant); }
  }
  for (const value of additions) upsert(source, value);
  for (const inventory of source.sections.filter(s => ['colorado-billing-compensation-appendix', 'service-code-approval-and-credit-reference', 'service-code-compensation-and-authorizations', 'services-codes-included-in-the-sb23-174-coverage-policy'].includes(s.slug))) {
    const marker = '<h3>Testing code inventory and compensation basis</h3>';
    inventory.bodyHtml = String(inventory.bodyHtml || '').split(marker)[0] + reviewedTestingInventoryHtml();
    inventory.status = 'ready';
  }
  const testingRoot = source.sections.find(s => s.slug === 'testing-services');
  if (testingRoot) testingRoot.bodyHtml = String(testingRoot.bodyHtml || '').split('<h3>Testing code inventory and compensation basis</h3>')[0] + reviewedTestingInventoryHtml();
  if (tenant === 'nlu') upsert(source, definition('nlu-service-specific-pay-levels', 'Service-specific Pay Levels 1–5', sharedPayLevelHtml(tenant)));
  currentCompensationWording(source, tenant);
  if (remove.length) for (const s of source.sections) s.bodyHtml = String(s.bodyHtml || '').replace(/<a\s+href="[^"]*#handbook-(?:event-travel-reimbursement|school-support-activity-hours)"[^>]*>([\s\S]*?)<\/a>/g, '$1');
  const affected = new Set(additions.map(s => s.slug));
  const revised = updates.filter(e => !remove.includes(e.handbook_section_slug)).map(e => {
    if (!affected.has(e.handbook_section_slug)) return e;
    const section = source.sections.find(s => s.slug === e.handbook_section_slug);
    return { ...e, subject: titleCase(section.title), changed_content: section.bodyHtml, policy_section_slugs: [section.slug], related_section_slugs: [], scope: [tenant] };
  });
  for (const value of additions) {
    const key = `review-${COLLECTIVE_HANDBOOK_RELEASE}-${tenant}-${value.slug}`;
    const existing = revised.findIndex(e => e.period_label === COLLECTIVE_POLICY_PERIOD && e.handbook_section_slug === value.slug);
    const next = { id: key, status: 'draft', period_label: COLLECTIVE_POLICY_PERIOD, digest_title: `${COLLECTIVE_POLICY_PERIOD} Workplace Handbook Updates`, subject: titleCase(value.title), rationale: 'Shared policy across ITSCO, Next Level Up and The Inner Strength Institute. This entry uses this company’s current manual wording and service scope; individual rates, agreements and earned rights remain protected.', changed_content: value.bodyHtml, handbook_section_slug: value.slug, policy_section_slugs: [value.slug], related_section_slugs: [], link_origin: 'source_review', approvalRelease: COLLECTIVE_HANDBOOK_RELEASE, scope: ['itsco', 'nlu', 'isi'] };
    if (existing >= 0) revised[existing] = { ...revised[existing], ...next }; else revised.push(next);
  }
  if (tenant === 'itsco') {
    const current = source.sections.find(s => s.slug === 'school-support-activity-hours');
    const index = revised.findIndex(e => e.period_label === COLLECTIVE_POLICY_PERIOD && e.handbook_section_slug === 'school-support-activity-hours');
    const value = { ...SCHOOL_SUPPORT_NOVEMBER_UPDATE, id: `review-${COLLECTIVE_HANDBOOK_RELEASE}-itsco-school-support`, status: 'draft', period_label: COLLECTIVE_POLICY_PERIOD, digest_title: `${COLLECTIVE_POLICY_PERIOD} Workplace Handbook Updates`, handbook_section_slug: 'school-support-activity-hours', policy_section_slugs: ['school-support-activity-hours'], changed_content: current?.bodyHtml || SCHOOL_SUPPORT_NOVEMBER_UPDATE.changedContent, scope: ['itsco'] };
    if (index >= 0) revised[index] = value; else revised.push(value);
  }
  source.ownerReviewRelease = COLLECTIVE_HANDBOOK_RELEASE;
  source.sourceDate = '2026-11-13';
  finishSuppliedHandbookStructure(source);
  const finalSections = new Map(source.sections.map(s => [s.slug, s]));
  return { source, updates: revised.filter(e => finalSections.has(e.handbook_section_slug)).map(e => ({ ...e, changed_content: finalSections.get(e.handbook_section_slug).bodyHtml, policy_section_slugs: [e.handbook_section_slug], related_section_slugs: (e.related_section_slugs || []).filter(slug => finalSections.has(slug)) })) };
}
