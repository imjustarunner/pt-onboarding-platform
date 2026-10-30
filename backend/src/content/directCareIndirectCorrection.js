export const DIRECT_CARE_INDIRECT_SCOPE = 'All employees in Categories 1, 2 and 3 receive an automatic paid indirect allowance for every approved service assigned to the Direct Care hourly/unit compensation category. This includes approved H-codes and other approved non-9-series billable hourly or unit-based services assigned to that category; it is not limited to H0004. Service authorization and the approved compensation mapping determine eligibility, not the code prefix alone.';
export const DIRECT_CARE_INDIRECT_ALLOWANCE = 'The allowance is 10 minutes of paid indirect time per compensated direct-hour equivalent, paid in addition to direct-service pay at the employee’s applicable indirect hourly rate. Preserve any greater agreed allowance. Apply it proportionally to verified units or documented service minutes under the approved code-specific mapping, including during probation or minimum-workload rates. Record additional actual compensable work without claiming the same work twice. Existing salary-only arrangements that exclude separate service pay remain unchanged.';
export const DIRECT_CARE_INDIRECT_CORRECTION_SLUG = 'direct-care-automatic-indirect-correction';
export const DIRECT_CARE_INDIRECT_CORRECTION_HTML = `<p>${DIRECT_CARE_INDIRECT_SCOPE}</p><p>${DIRECT_CARE_INDIRECT_ALLOWANCE}</p>
<h3>Examples using the ten-minute allowance</h3><table><thead><tr><th>Approved compensation quantity</th><th>Automatic paid indirect time</th></tr></thead><tbody><tr><td>One 15-minute unit</td><td>2.5 minutes</td></tr><tr><td>Four 15-minute units / one direct-hour equivalent</td><td>10 minutes</td></tr><tr><td>30 documented service minutes for a minute-based service</td><td>5 minutes</td></tr></tbody></table>
<h3>Correction of the category restriction</h3><p>This clarification corrects the erroneous Category 1 restriction in the October compensation materials. It applies to eligible work under the affected compensation schedule, including earlier eligible service dates; it is not a new benefit starting on the clarification date. Review prior payments for omitted allowances and reconcile related leave accrual. Verify separately paid indirect amounts for the same work before determining a correction, and preserve pay for additional actual work.</p>
<h3>Issued amendments and records</h3><p>Preserve the original issued or signed amendment and its audit history. Payroll will notify affected employees of the corrected allowance, the prior-period reconciliation and any additional minutes and pay being added. Employees do not need to resubmit time or sign another amendment to receive this employer-authorized pay correction. Do not silently replace a signed document. Clinical Session service-credit compensation and separate support or program pay types retain their own rules. A code listing does not itself authorize a service or claim.</p>`;

// Exact, scoped replacements also repair saved handbook drafts without replacing
// unrelated owner edits, rate tables, media, or already issued agreements.
const replacements = [
 ['Categories 2 and 3 receive 10 minutes (10/60 hour) of paid indirect time per compensated H-code direct-hour equivalent', 'Categories 1, 2 and 3 receive 10 minutes (10/60 hour) of paid indirect time per compensated Direct Care hour equivalent'],
 ['Category 1 reports actual indirect time separately and receives no automatic allowance. ', ''],
 ['Categories 2 and 3 also receive 10 minutes (10/60 hour) of indirect pay per direct-hour equivalent. Category 1 records actual indirect work separately.', 'Categories 1, 2 and 3 also receive 10 minutes (10/60 hour) of automatic indirect pay per direct-hour equivalent for all approved Direct Care services.'],
 ['Category 1 submits actual time. Categories 2 and 3 receive the H-code allowance automatically', 'Categories 1, 2 and 3 receive the Direct Care allowance automatically'],
 ['Submit actual indirect time separately; no indirect time is added automatically.', 'Approved Direct Care services include 10 minutes of automatic indirect pay per direct-hour equivalent. Report additional actual indirect work without duplicating the allowance.'],
 ['Indirect time: submit actual time worked.', 'Direct Care allowance: 10 minutes of automatic indirect pay per direct-hour equivalent. Report additional actual indirect work without duplicating the allowance.'],
 ['For Categories 2 and 3, the H-code indirect allowance continues at the applicable indirect rate. Category 1 reports actual indirect time separately.', 'For Categories 1, 2 and 3, the automatic Direct Care indirect allowance continues at the applicable indirect rate.'],
 ['For Categories 2 and 3, one direct hour + 10/60 indirect hour = 7/6 accrual hours. Category 1 uses separately submitted actual indirect time.', 'For Categories 1, 2 and 3, one direct hour + 10/60 indirect hour = 7/6 accrual hours.'],
 ['This is an exception to Category 1’s general no-automatic-indirect rule.', 'The automatic indirect allowance applies to all compensation categories and all approved Direct Care services.'],
 ['For general services, submit actual indirect time separately. Tutoring and eligible H2014 follow their separate program allowance described below.', 'All approved Direct Care services include automatic indirect pay for every category. Tutoring and eligible H2014 also follow their program allowance described below.'],
 ['For Categories 2 and 3, the H-code indirect allowance', 'For Categories 1, 2 and 3, the Direct Care indirect allowance']
];
export function correctDirectCareIndirectText(html) {
 let result = String(html || '');
 for (const [before, after] of replacements) result = result.replaceAll(before, after);
 return result;
}
export function applyDirectCareIndirectCorrection(source) {
 for (const section of source.sections) section.bodyHtml = correctDirectCareIndirectText(section.bodyHtml);
 const section = {slug:DIRECT_CARE_INDIRECT_CORRECTION_SLUG,title:'Automatic indirect pay for all approved Direct Care services',bodyHtml:DIRECT_CARE_INDIRECT_CORRECTION_HTML,status:'ready',parentSlug:null,sourcePage:null};
 const existing = source.sections.find(s=>s.slug===section.slug);
 if (existing) Object.assign(existing,section); else source.sections.push(section);
 return source;
}
