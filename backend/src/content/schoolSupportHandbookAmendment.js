import { SCHOOL_SUPPORT_SECTION } from './compensationHandbookClarifications.js';

// Keep the supplied handbook's existing public anchor, including older email links.
export const SCHOOL_SUPPORT_HANDBOOK_SLUG = 'school-support-activity-hours';
export const SCHOOL_SUPPORT_HANDBOOK_URL = `https://app.itsco.health/itsco/workplace-handbook#handbook-${SCHOOL_SUPPORT_HANDBOOK_SLUG}`;
export const SCHOOL_SUPPORT_NOVEMBER_UPDATE = {
  subject: 'School Support Hours — clearer name and request instructions',
  rationale: 'Use an actual ITSCO school Medicaid cancellation or missed session as the normal request source, allow up to one available hour, and preserve prior earned balances and pending-request rights without duplicate payments.',
  changedContent: `<p><strong>ITSCO School Support Hours:</strong> open the actual eligible school Medicaid client appointment, complete the cancellation or missed-session details, select <strong>Use up to 1 hour</strong>, enter the available amount and review and sign the change. The request is attached to that appointment and its verified local service date.</p><p>Payroll reviews the linked request after the signed cancellation is complete. Pending requests reserve availability; earned hours are deducted only when payment is applied at the applicable support-activity rate. A closed pay period defers review to an available open period rather than erasing earned hours. Do not submit a second request or bill an insurance claim for a service that did not occur.</p><p>Earlier unrestricted earned balances and prior requests remain protected through <strong>Earlier earned balance requests</strong> in My Payroll. This limited legacy-rights exception does not replace the actual-session route for new cancellation-based uses.</p><p>The existing 2-per-25 verified earning rule, 20-hour balance cap, source-review gates and prior signed terms remain intact. This benefit is ITSCO-only.</p><p><a href="${SCHOOL_SUPPORT_HANDBOOK_URL}">Read the full School Support Hours policy</a>.</p>`
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
