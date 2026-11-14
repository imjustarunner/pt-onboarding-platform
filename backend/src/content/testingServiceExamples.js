// Examples are descriptions of a service component, never instrument-to-code
// assignments or a promise that Colorado Medicaid covers a particular battery.
export const TESTING_REFERENCE_VERSION = 'testing-reference-2026-11-13-sourced-v1';
export const TESTING_ROOT_SLUG = 'testing-services';
export const TESTING_EXAMPLES_SLUG = 'testing-code-examples-and-pay-buckets';
export const TESTING_PROTOCOL_SLUG = 'psychological-testing-and-telephone-protocol';
export const TESTING_SECTION_SLUGS = [TESTING_ROOT_SLUG,TESTING_PROTOCOL_SLUG,TESTING_EXAMPLES_SLUG,'nlu-testing-compensation'];
export const TESTING_SOURCES = Object.freeze({
  sbhs:{title:'Colorado SBHS Billing Manual, October 2026',url:'https://hcpf.colorado.gov/sbhs-billing-manual',localPath:'assets/Narriva_Brand_Kit/October 2026 SBHS Billing Manual.pdf'},
  apa2026:{title:'APA Services 2026 testing billing and coding guide',url:'https://www.apaservices.org/practice/reimbursement/health-codes/testing/billing-coding.pdf'},
  apaCases:{title:'APA Services published clinical examples (2019 teaching addendum)',url:'https://www.molinahealthcare.com/marketplace/ca/en-us/Members/Members%20Resources/-/media/78550F84C2074EF2BED422EDE7D58007.ashx'}
});
const example=(activity,notThis,source,page,kind='manual-described activity')=>Object.freeze({activity,notThis,source,page,kind});
export const TESTING_CODE_EXAMPLES = Object.freeze({
  '96116':example('Interview-based examination of attention, memory, judgment and problem solving, with examination findings documented.','Not the administration of a standardized test battery.','sbhs',30),
  '96121':example('Qualifying additional examination and associated documentation time in the same neurobehavioral status examination.','Not a different test; requires 96116 and qualifying additional time.','sbhs',31),
  '96130':example('Interpret findings with clinical history to clarify psychological diagnosis and treatment when the reason for poor treatment response is unclear.','Not merely administering or scoring instruments.','sbhs',32),
  '96131':example('Further integration, psychological report preparation or feedback for the evaluation begun under 96130.','Not a standalone report-writing code or duplicate indirect minutes.','sbhs',33),
  '96132':example('In APA’s cognitive-decline case, select measures and integrate cognitive findings, history and clinical observations into conclusions and recommendations.','Not every ADHD referral or cognitive test automatically belongs to neuropsychological evaluation.','apaCases',3,'published case component'),
  '96133':example('Additional interpretation, report work and patient/family feedback in that neuropsychological episode.','Requires 96132; not technician interpretation.','apaCases',5,'published case component'),
  '96136':example('The QHP personally administers and scores two or more appropriate tests; see APA’s named battery examples below.','Not technician work or a single brief screener.','apaCases',4,'published case component'),
  '96137':example('Further QHP administration/scoring in that episode, including later scoring.','Requires 96136; report interpretation belongs to evaluation.','apaCases',5,'published case component'),
  '96138':example('A supervised technician administers and scores two or more appropriate tests from the battery.','Not the QHP’s personally performed administration.','apaCases',10,'published case component'),
  '96139':example('Further technician administration/scoring, including later scoring and score transfer.','Requires 96138; not independent clinical conclusions.','apaCases',11,'published case component'),
  '96146':example('One electronically administered instrument produces an automated result without professional or technician administration.','A tablet, online scoring or software brand alone does not qualify. No product-specific mapping has been verified.','sbhs',40),
  '98966':example('A documented 7-minute clinical assessment/management telephone encounter with an established member or guardian.','Not a scheduling call, a test battery or separately rebilled evaluation feedback.','sbhs',42,'duration illustration within the manual’s 5–10-minute definition'),
  '98967':example('A documented 15-minute clinical assessment/management telephone encounter with an established member or guardian.','Not a scheduling call, a test battery or separately rebilled evaluation feedback.','sbhs',43,'duration illustration within the manual’s 11–20-minute definition'),
  '98968':example('A documented 25-minute clinical assessment/management telephone encounter with an established member or guardian.','Not a scheduling call, a test battery or separately rebilled evaluation feedback.','sbhs',44,'duration illustration within the manual’s 21–30-minute definition'),
  'H0001':example('Assess alcohol/drug-use history and its clinical effects to formulate a substance-use diagnosis and services/referral plan.','Not a general psychological test or primary mental-health diagnostic evaluation.','sbhs',49),
  'H0004':example('Individual counseling/therapy addressing assessed problems listed in the treatment/service plan.','Not psychological testing; crisis intervention uses its own service.','sbhs',51)
});
export const testingExampleForCode=code=>TESTING_CODE_EXAMPLES[String(code||'').trim().toUpperCase()]||null;
export function testingExampleSummary(code) {
 const value=testingExampleForCode(code);
 if(!value)return null;
 const source=TESTING_SOURCES[value.source];
 return {activity:value.activity,notThis:value.notThis,sourceTitle:source.title,sourcePage:value.page,sourceUrl:source.url+(value.source==='sbhs'?'':`#page=${value.page}`)};
}
const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function testingExampleSourceHtml(value) {
 const source=TESTING_SOURCES[value.source];
 return `<a href="${escape(source.url)}${value.source==='sbhs'?'':`#page=${value.page}`}" title="${escape(source.title)}">${escape(source.title)}, page ${value.page}</a>`;
}
export function testingExamplesHtml(definitions,basis) {
 const rows=bucket=>definitions.filter(d=>d.bucket===bucket).map(d=>{
  const value=testingExampleForCode(d.code);
  if(!value)throw Error(`A verified activity example is required for ${d.code}.`);
  return `<tr><th>${d.code}</th><td>${escape(basis(d))}</td><td>${escape(value.activity)}<br /><em>${escape(value.kind)}</em></td><td>${escape(value.notThis)}</td><td>${testingExampleSourceHtml(value)}</td></tr>`;
 }).join('');
 const table=bucket=>`<table><thead><tr><th>Code</th><th>Credits / paid time</th><th>Matching activity</th><th>Does not match</th><th>Source</th></tr></thead><tbody>${rows(bucket)}</tbody></table>`;
 return `<p>Reference ${TESTING_REFERENCE_VERSION}. These are sourced service examples, not a list of approved instruments or an automatic coverage decision. Choose a code from the referral question, work actually performed, performer, time and current payer rules. An instrument name or diagnosis alone is insufficient. The existing scope, Testing-role, supervision and Medicaid-only requirements still apply to testing.</p><h3>Clinical Session bucket — actual eligible evaluation hours</h3>${table('credit')}<h3>Direct Care bucket — approved actual time / existing verified units</h3>${table('hcode')}<h3>Indirect bucket — separately assigned administrative work</h3><p>Booking a testing appointment, checking benefits/authorization status and routine billing administration use the approved indirect assignment and actual minutes. These are examples of internal compensation duties, not billable testing codes. Interpretation, clinical integration, report conclusions and evaluation feedback remain evaluation work. Do not move clinical work to indirect pay because reimbursement is low.</p><h3>Named tests in APA’s published teaching battery</h3><p>APA’s 2019 clinical examples list the Wisconsin Card Sorting Test, California Verbal Learning Test and Trail Making Test among possible battery instruments. The examples distinguish QHP administration (96136/96137) from technician administration (96138/96139); separate professional integration/report/feedback uses 96132/96133 in the illustrated neuropsychological case. These historical teaching examples do not approve an edition, age range, purchase, staff qualification or Medicaid claim. Verify the current instrument manual and the client’s clinical indication before selection. <a href="${TESTING_SOURCES.apaCases.url}#page=4">Published APA clinical example, pages 3–5 and 9–11</a>.</p><p>A brief screener, an educational placement/tutoring assessment or a named product does not automatically support a comprehensive medical testing claim. Purely educational testing without a medical/health-management purpose does not become a Medicaid service through this pay policy. For 96146, verify the exact product, instrument and automated workflow; no brand is presumed to qualify. Colorado’s October 2026 manual restricts this code to its specified single-instrument situation; follow that payer rule where broader general guidance differs. <a href="${TESTING_SOURCES.apa2026.url}#page=9">APA Services 2026 guide, pages 7–8</a>.</p>`;
}
