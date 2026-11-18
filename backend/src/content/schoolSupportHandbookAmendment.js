import { SCHOOL_SUPPORT_SECTION } from './compensationHandbookClarifications.js';

// Keep the supplied handbook's existing public anchor, including older email links.
export const SCHOOL_SUPPORT_HANDBOOK_SLUG = 'school-support-activity-hours';
export const SCHOOL_SUPPORT_HANDBOOK_URL = `https://app.itsco.health/itsco/workplace-handbook#handbook-${SCHOOL_SUPPORT_HANDBOOK_SLUG}`;
export const SCHOOL_SUPPORT_NOVEMBER_UPDATE = {
  subject: 'School Support Hours — clearer name and request instructions',
  rationale: 'Explain temporary self-service for any available earned School Support Hours without linking sessions until EHR integration. Preserve earned balances, pending requests and prior signed terms without duplicate payments.',
  changedContent: `<p><strong>ITSCO School Support Hours — Temporary:</strong> open <strong>My Dashboard → Submit → PTO → School Support Hours — Temporary</strong>, or choose <strong>Use hours — Temporary</strong> from your school support bank in My Dashboard or My Payroll. Enter the use date and any hours up to your available balance, then select <strong>Submit School Support Hours</strong>.</p><p>Until EHR integration, no client selection, appointment link, cancellation, attachment or payroll approval is required. A submission is not limited to one hour. The app deducts the hours and adds payment at the applicable support-activity rate to the applicable open pay period together. Your balance and payroll history update after submission.</p><p>Earlier pending requests reserve availability and retain their payroll review step. Existing earned balances and prior requests remain protected. Do not submit a second claim for hours already paid or pending, or bill an insurance claim for a service that did not occur.</p><p>The existing 2-per-25 verified earning rule, 20-hour balance cap, source-review gates and prior signed terms remain intact. This benefit is ITSCO-only.</p><p><a href="${SCHOOL_SUPPORT_HANDBOOK_URL}">Read the full School Support Hours policy</a>.</p>`
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
