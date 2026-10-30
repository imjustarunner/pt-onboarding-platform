import { currentOctoberPolicyData, nluPolicyTextAdaptations } from './currentOctober2026PolicyData.js';
import { HCODE_HANDBOOK_HTML } from './hcodeCompensationPolicy.js';

export const OCTOBER_SECTION_ALIASES = {
  'category-level-rate-schedule': 'role-based-supplemental-compensation-rate-schedule',
  'paid-time-off-and-colorado-sick-leave': 'sick-leave-accrual-and-protected-use',
  'timekeeping-support-and-overtime': 'actual-work-time-support-and-corrections',
  'minimum-workload-rates-and-tracking': 'compensation-minimum-workload-rate',
  'service-code-approval-and-credit-reference': 'service-code-compensation-and-authorizations',
  'training-leave-benefit': 'training-leave-accrual-and-requests',
  'compensation-regardless-of-funding-source': 'compensation-authority-and-modification',
  'health-insurance-employee-only-contribution': 'health-insurance-employer-contribution',
  'spanish-language-intake': 'spanish-language-intake-and-handoff',
  'office-kiosk-procedures': 'office-kiosk-and-client-arrivals',
  'school-mileage-reimbursement': 'mileage-reimbursement-policy',
  'school-service-support-time': 'school-support-activity-hours',
  'groups-moratorium-and-approval': 'group-services-moratorium-and-exceptions',
  'communications-schoolcarebridge-and-transition': 'digital-workplace-and-transition-procedures',
  'october-2026-editor-change-map': 'handbook-and-update-tracker'
};
const restrictedIsiCodes = new Set(['H0002','H0023','H0025','H2014','H2015','H2016','H2017','H2018','H2021','H2022','H2032','H2033','T1017','S9454','97535']);

export function adaptCurrentOctoberPolicy(body, tenant) {
  let value = body;
  if (tenant !== 'itsco') {
    for (const [before, after] of Object.entries(nluPolicyTextAdaptations)) value = value.replaceAll(before, after);
    value = value.replace(/<a href="mailto:[^"<>]*@itsco\.health"[^>]*>.*?<\/a>/gi, 'the designated team through the app')
      .replace(/\b(?:support|PO|payroll|legal|compliance|leaves)@itsco\.health\b/gi, 'the designated team through the app')
      .replaceAll('https://app.itsco.health/itsco/', 'https://app.nextleveluplcc.com/nlu/')
      .replaceAll('ITSCO', 'Next Level Up').replaceAll('Skill Builders', 'Therapy + Tutoring');
  }
  if (tenant === 'isi') {
    value = value.replace(/<a href="mailto:[^"<>]*@nextleveluplcc\.com"[^>]*>.*?<\/a>/gi, 'the Support Team through the app')
      .replace(/\b(?:support|PO|payroll|legal|compliance|leaves)@nextleveluplcc\.com\b/gi, 'the designated team through the app')
      .replaceAll('https://app.nextleveluplcc.com/nlu/', 'https://app.theinnerstrengthinstitute.com/tisi/')
      .replaceAll('Next Level Up', 'Inner Strength Institute').replaceAll('NLU', 'ISI')
      .replaceAll('Providers and Facilitators', 'Providers').replaceAll('Provider or Facilitator', 'Provider')
      .replaceAll('Providers/Facilitator', 'Providers').replaceAll('Non-Provider/Facilitator', 'Non-Provider')
      .replaceAll('The Facilitator Coding Protocol', 'The approved counseling coding and documentation procedures')
      .replace(/<tr>[\s\S]*?<\/tr>/g, row => {
        const code = row.match(/<t[hd][^>]*>(.*?)<\/t[hd]>/)?.[1]?.replace(/<[^>]+>/g, '').trim();
        return restrictedIsiCodes.has(code) ? '' : row;
      });
    value = value.replace(/<h[24]>Restricted and currently unapproved services<\/h[24]>[\s\S]*?(?=<h[24]>|$)/g,
      '<h4>Counseling service authorization</h4><p>Only services within the counseling practice’s approved scope may be scheduled or billed. A saved compensation mapping does not authorize another service line. Client groups require express written leadership approval and verified provider, supervision and payer requirements.</p>');
  }
  for (const [old, slug] of Object.entries(OCTOBER_SECTION_ALIASES)) value = value.replaceAll(`#handbook-${old}`, `#handbook-${slug}`);
  return value;
}

function set(source, slug, bodyHtml, title) {
  const section = source.sections.find(s => s.slug === slug);
  if (section) Object.assign(section, { bodyHtml, status: 'ready', ...(title ? { title } : {}) });
  else source.sections.push({ slug, title: title || slug, bodyHtml, status: 'ready', sourcePage: null, parentSlug: null });
}

export function applyCurrentOctoberPolicies(source, tenant) {
  for (const section of source.sections) section.bodyHtml = String(section.bodyHtml || '').replaceAll('Clinical Hour Rate','Clinical Session Rate').replaceAll('Standard Professional Rate','Direct Care Rate');
  for (const policy of currentOctoberPolicyData.sharedSections) {
    const body = adaptCurrentOctoberPolicy(policy.bodyHtml, tenant);
    const slug = OCTOBER_SECTION_ALIASES[policy.slug] || policy.slug;
    if (policy.slug === 'category-level-rate-schedule') {
      set(source, slug, body.split('<section class="compensation-category">')[0]);
      const categories = [...body.matchAll(/<section class="compensation-category"><h2>Category ([123])[^<]*<\/h2>([\s\S]*?)<\/section>/g)];
      if (categories.length !== 3) throw Error('Expected all three current category schedules.');
      for (const [, category, content] of categories) set(source, `compensation-rate-category-${category}`, content.replace(/<(\/?)h3>/g, '<$1h5>'));
    } else set(source, slug, body);
  }
  const allowance = HCODE_HANDBOOK_HTML.match(/<h3>Automatic indirect allowance<\/h3>([\s\S]*?)(?=<h3>Worked examples)/)[1];
  const reference = '<p>Use <a href="#handbook-colorado-billing-compensation-appendix">Colorado Billing &amp; Compensation Appendix</a> for the current service-specific quantity basis, documentation and effective-date rules. Payer billing units, employee compensation equivalents and actual work time are separate records.</p>';
  for (const slug of ['compensation-integrated-service-compensation','compensation-included-indirect-service-component','compensation-per-minute-integrated-services','compensation-fixed-unit-based-and-per-encounter-integrated-services']) {
    set(source, slug, '<p>Approved H-code services use the applicable Direct Care Rate and the service-specific quantity basis in the current appendix. Clinical service-credit compensation includes its routine administrative component; it does not generate a separate automatic indirect cash payment.</p>' + allowance + reference);
  }
  set(source, 'compensation-sick-leave-time-equivalency', source.sections.find(s => s.slug === 'sick-leave-accrual-and-protected-use').bodyHtml);
  set(source, 'compensation-tier-3-minimum-workload-exemption', '<p>Minimum-workload status uses the applicable effective workload tier, period grace and recorded waivers described in <a href="#handbook-compensation-minimum-workload-rate">Minimum-workload rates and tracking</a>. Apply the current policy and individual agreement for the service date. This section does not create an additional six-period exemption.</p>', 'Minimum-workload grace and waivers');

  const extraUpdates = [];
  for (const policy of currentOctoberPolicyData.nluSections) {
    if (tenant === 'itsco' || (tenant === 'isi' && !policy.slug.startsWith('provider-update-'))) continue;
    const slug = OCTOBER_SECTION_ALIASES[policy.slug] || policy.slug;
    const body = adaptCurrentOctoberPolicy(policy.bodyHtml, tenant).replaceAll('does not replace the licensed employee category', 'does not replace the assigned compensation category');
    set(source, slug, body, policy.title);
    if (policy.slug.startsWith('provider-update-') || policy.slug === 'nlu-tutoring-and-h2014-compensation') {
      extraUpdates.push({ id: `${tenant}-source-current-october-${slug}`, status: 'draft', subject: policy.title,
        rationale: 'Include the current agency procedure in the consolidated October release and keep the provider update aligned with its handbook.',
        changed_content: body, handbook_section_slug: slug, policy_section_slugs: [slug], related_section_slugs: [], link_origin: 'source_review' });
    }
  }
  if (tenant === 'nlu') {
    const exception = '<p>Next Level Up’s tutoring and Category 1 H2014 exceptions are described in <a href="#handbook-nlu-tutoring-and-h2014-compensation">Tutoring and H2014 compensation</a>. The approved individual schedule and service-date rules control.</p>';
    for (const slug of ['compensation-rate-category-1','compensation-included-indirect-service-component']) source.sections.find(s => s.slug === slug).bodyHtml += exception;
  }
  return extraUpdates;
}
