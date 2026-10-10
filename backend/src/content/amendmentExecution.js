import {SUPERVISORY_REVIEW_CONSIDERATION} from './compensationHandbookClarifications.js';
export const PRIOR_TERMS_REPLACEMENT = 'For work and benefits on or after this amendment’s prospective effective date, this amendment replaces all financial, compensation and employee-benefit terms stated in the prior employment agreement. Those matters are governed by this amendment, its individual rate schedule and the Workplace Handbook policies it incorporates. All other terms of the prior agreement and all other agency policies remain in effect. Wages, reimbursements and leave already earned before the change remain protected.';
export const ELECTRONIC_SIGNATURE_NOTICE = 'The employee signs electronically using the signature section at the bottom of this Provider Update. The agency’s authorized representative countersigns electronically. The app records each signature and signing date, and the completed signed copy is retained in the employee’s My Documents for later viewing and download. The prospective effective-date rules above apply.';
export function updateAmendmentExecutionTerms(html) {
 let result=String(html||'')
  .replace('This amendment replaces conflicting compensation and accrual terms in the prior employment agreement for work on or after the agreed effective date. All other nonconflicting agreement terms remain in effect.',PRIOR_TERMS_REPLACEMENT)
  .replace('Other existing vacation/PTO entitlements are unchanged.','Previously earned leave balances remain protected.')
  .replace('Employee signature/date: ____________________. ITSCO authorized representative signature/date: ____________________. Agreed effective date: ____________________.',ELECTRONIC_SIGNATURE_NOTICE);
 result=result.replace(/(<h3>10\. Compensation-level expectations and review<\/h3>)([\s\S]*?)(?=<h3>|$)/,(_,heading,body)=>heading+body+(body.includes(SUPERVISORY_REVIEW_CONSIDERATION)?'':'<p>'+SUPERVISORY_REVIEW_CONSIDERATION+'</p>'));
 return result;
}
export function splitFinalSignature(html) {
 const pattern=/<h3>\d+\. Employee acknowledgment and signatures<\/h3>[\s\S]*?(?=<h3>|$)/;
 const match=String(html).match(pattern);
 return {clauses:match?String(html).replace(pattern,''):String(html),signature:match?.[0]||'<h3>Employee acknowledgment and electronic signatures</h3><p>'+ELECTRONIC_SIGNATURE_NOTICE+'</p>'};
}
