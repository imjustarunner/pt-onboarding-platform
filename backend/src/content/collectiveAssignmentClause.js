import { handbookTenant } from '../services/handbookTenant.js';

export const COLLECTIVE_ASSIGNMENT_VERSION = 'mental-range-assignments-2026-11-13';
export const COLLECTIVE_ASSIGNMENT_KEY = 'MENTAL_RANGE_COLLECTIVE_ASSIGNMENTS';
export const COLLECTIVE_ASSIGNMENT_TITLE = 'Assignments Within The Mental Range Collective';

// Use configured company identities, never a name supplied in preview tokens.
// The handbook resolver also recognizes the explicitly configured NLU QA mirrors.
export function isCollectiveCompany(agency) {
  return !!handbookTenant(agency) || ['plottwistco', 'mh4kidz'].includes(String(agency?.slug || '').toLowerCase());
}

export const COLLECTIVE_ASSIGNMENT_PARAGRAPHS = [
  'The Practice participates in The Mental Range Collective. From time to time, the Practice may request that the individual perform approved services or related operational duties for another organization that is part of The Mental Range Collective (an “Affiliated Organization”). Such assignments are discretionary and must remain consistent with the individual’s approved duties, qualifications, professional scope, and applicable supervision and training requirements.',
  'Before an assignment begins, the Practice will provide written assignment details identifying the receiving organization by its legal name, the duties and work location or format, the responsible supervisor, the applicable compensation and payroll arrangements, timekeeping instructions, and the effective dates. Any change to agreed compensation or other contractual terms requires written acceptance by the affected parties. A student placement also remains subject to the applicable academic-program approvals and training agreement.',
  'The Practice named in this agreement remains the contracting employer, or the host Practice for a student training placement, unless a separate written agreement establishes otherwise. An affiliated assignment does not itself transfer this agreement or reduce earned compensation, accrued rights, or responsibilities imposed by law on any employer. Record all actual work accurately and attribute it to the organization receiving the services. Hours across organizations must be combined for minimum-wage and overtime calculations when required by applicable law.',
  'Confidentiality and information handling during an affiliated assignment are governed by applicable law, the organizations’ approved privacy and security policies, and any applicable executed business associate agreement or other written information-sharing arrangement. The individual must complete required privacy orientation and use approved systems. Access, use, and disclosure of client information are limited to the authorized assignment and the permissions appropriate to the individual’s role. This clause does not itself establish an affiliated covered entity, designate a shared HIPAA workforce, grant unrestricted access to another organization’s records, or authorize a use or disclosure beyond the applicable agreement and law.',
  'The Practice may modify or discontinue an affiliated assignment, subject to this agreement and applicable law. Participation in The Mental Range Collective does not guarantee assignments, hours, or continued work with another organization.'
];

export const COLLECTIVE_ASSIGNMENT_HTML = `<h2>${COLLECTIVE_ASSIGNMENT_TITLE}</h2>\n${COLLECTIVE_ASSIGNMENT_PARAGRAPHS.map(text => `<p>${text}</p>`).join('\n')}`;

const oldAssignmentClause = clause => clause.clause_key === COLLECTIVE_ASSIGNMENT_KEY || /^(?:MULTI|STARTER_V1_MULTI_(?:HOURLY|FFS))$/.test(clause.clause_key || '');
const signatureClause = clause => /(?:^|_)(?:SIG_BLOCK|SIGNATURE_BLOCK)(?:_|$)/.test(clause.clause_key || '');

export function applyCollectiveAssignmentClause(clauses, { agency, config, agreementPlan } = {}) {
  if (!isCollectiveCompany(agency)) return clauses;
  // This is a workforce assignment provision, not a change to a client, vendor,
  // BAA, compensation amendment or previously generated/signed document.
  if (/amendment|addendum|acknowledg/i.test(config?.slug || '')) return clauses;
  const workAgreement = ['provider', 'facilitator', 'student'].includes(agreementPlan?.variant)
    || clauses.some(c => /^(?:TERM_AT_WILL|TERM_STUDENT_TRAINING|INTRO_STUDENT_TRAINING|STARTER_V1_INTRO_(?:HOURLY|FFS)|STARTER_V1_TERM_AT_WILL_(?:HOURLY|FFS))$/.test(c.clause_key || ''))
    || (['hourly', 'ffs'].includes(config?.pay_mode) && /(?:^|[_-])(?:employment|facilitator|licensed|lpc|lpcc|intern_practicum)(?:[_-]|$)/i.test(config?.slug || ''));
  if (!workAgreement) return clauses;
  const previousIndex = clauses.findIndex(oldAssignmentClause);
  const result = clauses.filter(clause => !oldAssignmentClause(clause));
  const signatureIndex = result.findIndex(signatureClause);
  const index = previousIndex >= 0 ? Math.min(previousIndex, signatureIndex < 0 ? result.length : signatureIndex) : signatureIndex < 0 ? result.length : signatureIndex;
  result.splice(index, 0, {
    clause_key: COLLECTIVE_ASSIGNMENT_KEY, title: COLLECTIVE_ASSIGNMENT_TITLE,
    body_html: COLLECTIVE_ASSIGNMENT_HTML, policyVersion: COLLECTIVE_ASSIGNMENT_VERSION,
    policyReason: 'Prospective collective-company employment or student training assignment terms'
  });
  return result;
}
