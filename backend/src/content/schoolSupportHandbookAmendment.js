import { SCHOOL_SUPPORT_SECTION } from './compensationHandbookClarifications.js';

// Keep the supplied handbook's existing public anchor, including older email links.
export const SCHOOL_SUPPORT_HANDBOOK_SLUG = 'school-support-activity-hours';
export const SCHOOL_SUPPORT_HANDBOOK_URL = `https://app.itsco.health/itsco/workplace-handbook#handbook-${SCHOOL_SUPPORT_HANDBOOK_SLUG}`;
export const SCHOOL_SUPPORT_NOVEMBER_UPDATE = {
  subject: 'School Support Hours — clearer name and request instructions',
  rationale: 'Name the earned school benefit clearly so staff can distinguish it from PTO and time worked under Support Activity. Explain how to request hours, use one hour during an eligible school Medicaid cancellation, and use temporary self-service without submitting duplicate claims. The rename preserves existing accrual rules, earned balances, the 20-hour cap and the applicable support-activity payment rate.',
  changedContent: `<p><strong>School Support Hours</strong> is the clearer name for the earned benefit previously labeled “school support activity hours.” It helps school-assigned providers cover time lost to weather-related school closures or disruptions and missed client sessions.</p>
<p><a href="${SCHOOL_SUPPORT_HANDBOOK_URL}">Read the School Support Hours policy and submission instructions</a>.</p>
<ul><li><strong>Temporary self-service:</strong> open <a href="https://app.itsco.health/itsco/dashboard?tab=my&amp;my=payroll">My Dashboard → My Payroll</a>, select <strong>School Support Hours — Temporary</strong> in Submit or your earned-hours balances, enter the use date and hours, and select <strong>Submit School Support Hours</strong>. No attachment, appointment link or payroll approval is needed.</li>
<li><strong>Eligible cancellation or missed session:</strong> the assigned provider can review earned, pending and available hours in the School Support Hours panel, select <strong>Use 1 hour</strong> when at least one hour is available, and review and sign the session change. Signing submits the linked request. Do not submit another claim for the same hour.</li>
<li><strong>Balance and payment:</strong> pending requests reserve availability. Temporary self-service deducts the earned hours and adds payment at the applicable support-activity rate together. Earlier pending requests and the linked cancellation workflow retain their review step. Track the request in My Payroll.</li></ul>
<p>The existing accrual of 2 hours per 25 qualifying hours or credits and the 20-hour balance cap remain unchanged. School Support Hours is separate from Sick Leave, Personal PTO and Training PTO, and from recording actual Support Activity work. It does not create an insurance claim for a missed session or automatically pay every cancellation.</p>`
};

// Only apply this owner-approved wording to the ITSCO reference edition.
// Monthly review drafts and archived source files retain their historical text.
export function applySchoolSupportHandbookAmendment(source, tenant) {
  if (tenant !== 'itsco') return source;
  for (const section of source.sections || []) {
    if (section.slug === SCHOOL_SUPPORT_HANDBOOK_SLUG) {
      section.title = SCHOOL_SUPPORT_SECTION.title;
      section.bodyHtml = SCHOOL_SUPPORT_SECTION.bodyHtml.replace(/<(\/?)h2>/g, '<$1h4>');
      section.status = 'ready';
    } else if (section.status === 'ready') {
      section.bodyHtml = String(section.bodyHtml || '').replace(/school support activity hours/gi, 'School Support Hours');
    }
  }
  return source;
}
