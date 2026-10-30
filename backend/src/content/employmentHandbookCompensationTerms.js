import { ADVANCED_CATEGORY_LABEL, ADVANCED_CATEGORY_DESCRIPTION, ADVANCED_CATEGORY_PLACEMENT } from './advancedCompensationCategory.js';
import { BONUS_TAX_CLAUSE } from './bonusTaxPolicy.js';

export const EMPLOYMENT_HANDBOOK_COMPENSATION_VERSION = 'handbook-category-and-missed-fee-2026-10-29';
export const EMPLOYMENT_HANDBOOK_COMPENSATION_KEY = 'HANDBOOK_CATEGORY_AND_MISSED_SESSION_PAY';
const escape = value => String(value).replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]));

export const EMPLOYMENT_CATEGORY_DEFINITIONS_HTML = `<h3>Compensation category definitions</h3>
<p>Where category-based compensation applies, the employee’s written assignment identifies the category and level. Category describes approved placement; level selects the applicable rates. Neither establishes permission to provide a service.</p>
<ul><li><strong>Category 1 · Unlicensed:</strong> Approved unlicensed, bachelor’s-level and student or training roles, as expressly assigned by the Practice.</li>
<li><strong>Category 2 · Pre-licensed:</strong> Pre-licensed or unlicensed master’s-level staff, subject to the Practice’s documented placement rules.</li>
<li><strong>Category 3 · ${escape(ADVANCED_CATEGORY_LABEL)}:</strong> ${escape(ADVANCED_CATEGORY_DESCRIPTION)}</li></ul>
<p>${escape(ADVANCED_CATEGORY_PLACEMENT)}</p>`;

export const EMPLOYMENT_MISSED_SESSION_COMPENSATION_HTML = `<h3>Missed-session fee compensation</h3>
<p>For all eligible services, compensation from a lawfully collected and retained no-show or late-cancellation fee follows the Practice’s Workplace Handbook policy communicated for the applicable effective date. The handbook governs the assigned category’s percentage, eligible collections, subscription and credit treatment, and payroll timing. A scheduled appointment, unpaid invoice or credit that remains available for a later session does not by itself earn a fee share. This provision does not authorize a client charge prohibited by law, payer rules or the client’s agreement.</p>
<p>The handbook’s missed-session fee compensation policy replaces conflicting standard missed-session compensation language for events on or after this agreement’s effective date. Any later change requires advance written notice and any legally required agreement. Compensation already earned and rights arising from earlier events are preserved.</p>
<p>Pay for actual work and required waiting time is separate from the fee share and remains payable regardless of whether a client fee is collected. Record all compensable time. Applicable minimum-wage, overtime and other wage requirements continue to apply; a fee share does not replace required wages or authorize duplicate payment for the same work.</p>`;

/** Applied only when generating a new contract; stored agreements are untouched. */
export function applyEmploymentHandbookCompensation(clauses) {
  const result = clauses.filter(clause => String(clause.clause_key || '').toUpperCase() !== EMPLOYMENT_HANDBOOK_COMPENSATION_KEY).map(clause => {
    const key = String(clause.clause_key || '').toUpperCase();
    if (/^(?:NO_SHOW_COMP(?:ENSATION)?|MISSED_SESSION_(?:PAY|COMPENSATION)|LATE_CANCEL(?:LATION)?_(?:PAY|COMPENSATION))(?:_[A-Z0-9]+)*$/.test(key)) {
      return { ...clause, body_html: '', policyVersion: EMPLOYMENT_HANDBOOK_COMPENSATION_VERSION, policyReason: 'Replaced prospectively by the handbook missed-session fee policy' };
    }
    return { ...clause };
  });
  const policy = {
    clause_key: EMPLOYMENT_HANDBOOK_COMPENSATION_KEY,
    title: 'Compensation categories and missed-session fees',
    body_html: `<h2>Compensation categories and missed-session fees</h2>${EMPLOYMENT_CATEGORY_DEFINITIONS_HTML}${EMPLOYMENT_MISSED_SESSION_COMPENSATION_HTML}<h3>Bonus amounts and withholding</h3><p>${BONUS_TAX_CLAUSE}</p>`,
    policyVersion: EMPLOYMENT_HANDBOOK_COMPENSATION_VERSION,
    policyReason: 'Current category definitions and handbook-based missed-session compensation for new agreements'
  };
  const signatureIndex = result.findIndex(clause => /(?:^|_)(?:SIG_BLOCK|SIGNATURE_BLOCK)(?:_|$)/.test(String(clause.clause_key || '').toUpperCase()));
  result.splice(signatureIndex < 0 ? result.length : signatureIndex, 0, policy);
  return result;
}
