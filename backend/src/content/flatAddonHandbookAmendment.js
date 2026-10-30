export const FLAT_ADDON_HANDBOOK_SLUG = 'flat-clinical-addons-and-eligibility';
export const FLAT_ADDON_HANDBOOK_URL = `https://app.itsco.health/itsco/workplace-handbook#handbook-${FLAT_ADDON_HANDBOOK_SLUG}`;
export const COLORADO_SBHS_SOURCE = 'https://hcpf.colorado.gov/sites/hcpf/files/January%202026%20SBHS%20Billing%20Manual1.9.26.pdf';
export const FLAT_ADDON_POLICY_HTML = `<h2>Flat payments for eligible add-ons</h2>
<p><strong>99051 pays $2.00 and 90785 pays $2.00 per eligible, documented occurrence.</strong> These are ITSCO employee compensation amounts, not payer reimbursement rates. Each add-on is counted once per eligible encounter. Neither adds clinical credits, productive hours, tier or language/location bonuses, automatic indirect time, or extra leave-equivalent hours. Record actual work time separately; the add-on does not replace pay or leave associated with actual compensable work.</p>
<p>This corrects the add-on mapping for the October 10–23, 2026 open pay period and subsequent periods. It does not change posted payroll. Payroll maintains the flat amounts and staff-visible code mappings in <a href="https://app.itsco.health/itsco/admin/payroll?payrollTab=service_codes">Payroll → Service codes</a>. Select an add-on only when the service and documentation qualify.</p>
<h2>90785 — Colorado interactive-complexity eligibility</h2>
<p>Document at least one communication factor and how it complicated care: disruptive communication requiring management; caregiver behavior or emotions obstructing treatment; a sentinel event requiring a mandated report and discussion with the patient/participants; or play equipment/physical devices needed to overcome communication barriers.</p>
<p>Pair 90785 with 90791/90792, 90832/90834/90837, 90833/90836/90838 with the required E/M service, or 90853. Do not use it alone, for translation/interpretation, with crisis psychotherapy, with E/M alone, or with an extended encounter billed as 90834 × 2. A child's age, caregiver attendance, or routine use of toys does not by itself document a qualifying communication barrier.</p>
<p>Confirm the manual's rendering-provider and billing-provider eligibility, setting, payer and service-date requirements. Bachelor's-level status alone does not qualify. Existing agency group-service restrictions still apply.</p>
<p>Source: <a href="${COLORADO_SBHS_SOURCE}">Colorado HCPF State Behavioral Health Services Billing Manual, January 2026, pages 11 and 16</a>. Billing must check the <a href="https://hcpf.colorado.gov/sbhs-billing-manual">edition applicable to the service date</a> and payer requirements before submission.</p>
<h2>99051 — scheduled evening or weekend services</h2>
<p>ITSCO regular business hours are <strong>Monday–Friday, 9:00 a.m.–5:00 p.m., America/Denver</strong>. The time window for review is weekdays before 9:00 a.m. or at/after 5:00 p.m., and Saturdays/Sundays. A service at 9:00 a.m. on a weekday is within regular hours; one at 5:00 p.m. is outside. Use the documented service time, not the time the note was entered.</p>
<p>99051 describes services during regularly scheduled evening, weekend or holiday office hours. Being outside ITSCO's 9–5 window does not alone establish billability: Billing must verify the payer accepts 99051 for the provider, underlying service, setting and schedule. Do not automatically add it to every late or weekend visit, use it for completing notes after hours, or substitute it for a different after-hours code. A clock-based suggestion is only a prompt for review. Document the service date/time and qualifying circumstances; a holiday requires the same payer and schedule review.</p>
<p>Reference: <a href="https://oig.hhs.gov/reports/all/2011/medicaid-payments-for-after-hours-services/">HHS OIG, Medicaid Payments for After-Hours Services</a>. The $2 agency payment does not establish insurance coverage.</p>`;
export const FLAT_ADDON_NOVEMBER_UPDATE = {
  subject: '99051 and 90785 — flat add-on payments and eligibility',
  rationale: 'Correct the mistaken treatment of add-on occurrences as full service credits and clarify eligibility using Colorado billing guidance.',
  changedContent: `<p><strong>99051: $2 per eligible occurrence. 90785: $2 per eligible occurrence.</strong> Neither code earns service credits, additional hours, tier/language/location bonuses or automatic indirect pay. This corrects the October 10–23 open payroll and subsequent periods.</p><p>ITSCO regular business hours are Monday–Friday, 9 a.m.–5 p.m. in Denver. Evening/weekend timing prompts review; it does not automatically qualify a service for 99051. 90785 requires documented interactive complexity and an eligible accompanying service under Colorado guidance.</p><p><a href="${FLAT_ADDON_HANDBOOK_URL}">Read eligibility, documentation and billing references</a>. Payroll controls flat amounts and eligible code categories in <a href="https://app.itsco.health/itsco/admin/payroll?payrollTab=service_codes">Service codes</a>.</p>`
};
const reference = `<h2>Flat clinical add-ons</h2><p>90785 pays $2 and 99051 pays $2 per eligible occurrence, with no clinical credits or added hours. See <a href="${FLAT_ADDON_HANDBOOK_URL}">flat add-on payments and eligibility</a> for documentation, Colorado billing requirements and the 9 a.m.–5 p.m. business-hours policy.</p>`;
export function applyFlatAddonHandbookAmendment(source, tenant) {
  if (tenant !== 'itsco') return source;
  const sections = source.sections || (source.sections = []);
  for (const section of sections) {
    if (section.status !== 'ready') continue;
    if (section.slug === 'direct-clinical-services-billable-when-authorized') {
      section.bodyHtml = section.bodyHtml.replace(/<tr><th>\+(99051|90785)<\/th><td>[\s\S]*?<\/td><\/tr>/g,
        (_, code) => `<tr><th>+${code}</th><td>${code === '99051' ? 'An evening, weekend or holiday service requires payer, provider, setting and schedule review; timing alone does not establish eligibility.' : 'Interactive complexity requires a documented qualifying communication factor and an eligible accompanying service; age, caregiver attendance or routine use of toys alone does not qualify.'} See <a href="${FLAT_ADDON_HANDBOOK_URL}">flat add-on payments and eligibility</a>.</td></tr>`);
    }
    if (section.slug === 'company-fees-and-associated-policy') {
      section.bodyHtml = section.bodyHtml.replace(/(<tr><th>\+90785<\/th><td>)[\s\S]*?(<\/td><td>)/g,
        `$1<p>Interactive complexity requires documented eligibility under the <a href="${FLAT_ADDON_HANDBOOK_URL}">flat add-on policy</a>. A listed client fee does not determine employee compensation or establish payer coverage.</p>$2`);
    }
    if (!['colorado-billing-compensation-appendix','service-code-approval-and-credit-reference','service-code-compensation-and-authorizations'].includes(section.slug)) continue;
    // Remove obsolete credit-table rows, preserving all other mappings and restrictions.
    section.bodyHtml = (section.bodyHtml || '').replace(/<tr><t[dh]>(?:90785|99051)<\/t[dh]>[\s\S]*?<\/tr>/g, '');
    section.bodyHtml = section.bodyHtml.replace('90785 pays $4 and 99051 pays $2 per eligible occurrence', '90785 pays $2 and 99051 pays $2 per eligible occurrence');
    if (!section.bodyHtml.includes(FLAT_ADDON_HANDBOOK_URL)) section.bodyHtml += '\n' + reference;
  }
  const policy = {slug:FLAT_ADDON_HANDBOOK_SLUG,parentSlug:sections.some(s=>s.slug==='colorado-billing-compensation-appendix')?'colorado-billing-compensation-appendix':null,title:'Flat clinical add-ons and eligibility',sourcePage:null,status:'ready',bodyHtml:FLAT_ADDON_POLICY_HTML};
  const existing = sections.find(s=>s.slug===policy.slug);
  if (existing) Object.assign(existing,policy); else sections.push(policy);
  return source;
}
