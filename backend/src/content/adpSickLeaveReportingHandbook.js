import { AUTUMN_RELEASES } from './agencyHandbookAutumn2026.js';
import { BONUS_TAX_CLAUSE } from './bonusTaxPolicy.js';

export const SICK_LEAVE_HOURS_SECTION = {
  slug: 'sick-leave-accrual-and-protected-use',
  title: 'Sick leave hours, accrual and protected use',
  bodyHtml: `<p><strong>Sick leave hours</strong> means the qualifying hours used to calculate leave accrual. It is not the employee’s available sick-leave balance or a replacement for actual hours worked. The existing accrual ratio remains unchanged: all eligible employee classifications accrue <strong>one hour of paid sick leave for every 30 qualifying sick leave hours</strong>. Use the appropriate qualifying basis for the employee’s work; do not apply a second 1-for-25 calculation after converting clinical credits.</p>
<table><thead><tr><th>Recorded work or compensation quantity</th><th>Sick leave hours</th><th>Example</th></tr></thead><tbody>
<tr><th>Clinical service credits</th><td>Approved clinical credits × 1.20</td><td>One 1.00-credit 90837 service contributes 1.20 sick leave hours. A 0.75-credit service contributes 0.90.</td></tr>
<tr><th>H2014 and other approved quarter-hour services</th><td>Eligible 15-minute units ÷ 4</td><td>Four H2014 units contribute 1.00 direct sick leave hour.</td></tr>
<tr><th>Minute-based H0031</th><td>Eligible minutes ÷ 60</td><td>30 documented minutes contribute 0.50 sick leave hour.</td></tr>
<tr><th>Separately recorded indirect work</th><td>Eligible actual minutes ÷ 60</td><td>45 minutes contribute 0.75 sick leave hour.</td></tr>
<tr><th>Other eligible work</th><td>Qualifying tutoring, Homework Help, support, required waiting, meetings, training and other compensable time, counted once</td><td>One eligible hour contributes 1.00 sick leave hour.</td></tr></tbody></table>
<p>The H-code examples include 1.50 direct hours. With the applicable allowance of 10 indirect minutes per direct hour, the app automatically adds a separate <strong>Automatic indirect allowance: 15 minutes (0.25 hour)</strong> line, paid at the applicable indirect rate. The complete example is 1.20 clinical + 1.50 H-code direct + 0.25 automatic indirect + 0.75 additional submitted indirect = <strong>3.70 sick leave hours</strong>. At the existing 1/30 ratio, this earns 3.70 ÷ 30 = 0.123333 hour of sick leave before balance precision and applicable limits. The clinical 20% administrative equivalent supports accrual; it is not an additional cash-pay line. It is not added to H-code, tutoring or support hours.</p>
<p>Count a paid automatic indirect component once where the employee’s applicable compensation terms include it. Four H2014 units contribute one direct hour; a separately applicable 10-minute indirect component contributes another 10/60 hour, not another clinical 20% multiplier. Do not count the same indirect work again as a separate claim. Record additional actual work and reconcile accrual to all legally required hours, including required waiting. An automatic allowance or credit conversion does not establish the actual duration of work or cap statutory accrual.</p>
<p>Hourly employees use eligible actual work. For exempt salaried employees, apply the statutory presumed workweek or the employee’s actual normal workweek when the law requires it. Reconcile all classifications so accrual is never below the applicable statutory entitlement. Preserve earned balances and more generous applicable terms; protect historical periods from recalculation under a later policy version.</p>
<p>This is protected paid sick leave, with no probationary waiting period. Colorado HFWA generally requires accrual at one hour per 30 hours worked up to 48 hours annually, with applicable carryover up to 48 hours. Protected uses, reasonable notice, permitted documentation and nonretaliation rules apply. Do not substitute a generic 10-hour rollover cap or a 30-day advance-notice rule. Separate training leave, vacation and other PTO retain their own eligibility, accrual and payment rules.</p>
<p><strong>Pay when sick leave is used:</strong> use the applicable handbook sick-leave payment policy and no less than the legally required HFWA rate for the leave dates. The consolidated ADP earnings allocation rate is not automatically that payment rate. Payroll must review any required variable-rate lookback and required pay components. Existing more generous promised sick-leave pay remains protected.</p>
<p><strong>Transition from ADP to app calculations:</strong> the existing 1/30 accrual ratio continues. The app calculation begins with the current October 24–November 6, 2026 pay period and continues for subsequent periods. Periods beginning before October 24 remain under their existing processing. Inner Strength uses its first configured period beginning on or after October 24. This changes where calculations are performed and displayed; it does not establish whether prior ADP balances were accurate. Compare the app and ADP at the same completed-payroll cutoff before proposing a separately documented opening-balance correction. Preserve completed payroll and do not adjust balances merely because reporting fields differ or duplicate an ADP accrual. See <a href="#handbook-adp-pay-statements-and-sick-leave-hours">ADP pay statements and Sick leave hours</a>.</p>`
};

export const ADP_PAY_STATEMENT_SECTION = {
  slug: 'adp-pay-statements-and-sick-leave-hours',
  title: 'ADP pay statements and Sick leave hours',
  bodyHtml: `<p>The app provides the detailed earnings record for services, service quantities, applicable rates, indirect work, support activities and other approved pay. Review that detail in My Payroll. Under the consolidated payroll handoff, the ADP statement may show ordinary earnings at one calculated rate instead of listing every service and service rate.</p>
<p><strong>ADP earnings allocation rate = included ordinary earnings ÷ Sick leave hours.</strong> This is a reporting allocation, not a new contracted service rate, an overtime regular rate or the rate automatically used to pay sick leave. It can differ from every rate in the employee’s individual schedule. If the qualifying hours are zero or an earnings component cannot be classified, payroll must reconcile the item rather than invent hours or divide by zero.</p>
<p>Keep separately classified salary, bonuses, overtime premiums, paid-leave payments, collected missed-session fee shares, accountable-plan mileage and other items that require separate earning or reimbursement codes separate from the ordinary earnings numerator. Taxable and nontaxable amounts must retain their proper treatment. The sum of all earnings and reimbursements must reconcile to the approved payroll; changing the display must not change the amount earned.</p>
<p><strong>Use the service and time records already submitted in the app.</strong> The app calculates service credit/unit equivalents and the applicable automatic indirect allowance without requiring a second employee submission for that allowance. Employees submit additional indirect, support, required waiting and other compensable work through the existing time-entry process; count it once. Retain the underlying service and time records for daily and weekly payroll review. Sick leave hours are credit or unit equivalents for accrual and must not be entered as the employee’s sole legal hours-worked record. Wage statements must include the actual hours and other information required by law, with the app’s itemized record available to the employee. Minimum-wage and overtime review uses actual work and the legally required compensation components.</p>
<p>Before the first consolidated handoff, payroll verifies ADP’s earning codes, the separately identified accrual-hours field, actual-hours reporting, leave settings and rounding. Do not assume ADP cannot show service detail; this is the Practice’s chosen reporting arrangement. The app’s payroll worksheet is not proof that an ADP import or payment has been accepted. Payroll confirms the processor’s final totals and records any correction.</p>
<p>The Sick leave hours basis and the 1/30 sick-leave accrual rule are explained in <a href="#handbook-sick-leave-accrual-and-protected-use">Sick leave hours, accrual and protected use</a>. Other PTO may use that qualifying basis only where its own policy provides for it; the name does not create a new PTO entitlement.</p>`
};

export { BONUS_TAX_CLAUSE } from './bonusTaxPolicy.js';
export const BONUS_TAX_SECTION = {
  slug: 'bonus-tax-withholding-and-gross-pay',
  title: 'Bonuses: gross pay and tax withholding',
  bodyHtml: `<p>${BONUS_TAX_CLAUSE}</p><p>Employee federal and state income-tax withholding and the employee share of Social Security and Medicare, when applicable, are deducted as required. The Practice continues to pay its required employer share and other employer payroll taxes; those obligations are not shifted to employees.</p><p>A stated $100 gross bonus is a $100 earnings amount before required employee withholding, not a promise of a $100 deposit. The withholding method does not determine the employee’s final tax liability. Payroll must use the applicable IRS and state rules rather than promise one universal bonus tax percentage.</p><p>Bonuses remain separately identified in payroll. Payroll reviews whether a bonus must be included in the overtime regular rate and applies any required adjustment to the correct workweeks. A payment is not excluded merely because it is called a bonus. Confirm the prospective effective date and remove any automatic net-to-gross or employee-tax gross-up setting for awards covered by this policy, while preserving earlier earned promises and applicable written exceptions.</p>`
};

export function applyAdpSickLeaveReportingHandbook(source, updates, tenant) {
  const release = AUTUMN_RELEASES[tenant];
  if (!release) return updates;
  const changed = new Set();
  for (const policy of [SICK_LEAVE_HOURS_SECTION, ADP_PAY_STATEMENT_SECTION, BONUS_TAX_SECTION]) {
    const current = source.sections.find(s => s.slug === policy.slug);
    if (current) Object.assign(current,{title:policy.title,bodyHtml:policy.bodyHtml,status:'ready'});
    else source.sections.push({...policy,status:'ready',parentSlug:null,sourcePage:null});
    changed.add(policy.slug);
  }
  for (const section of source.sections) {
    if (['paydays-deductions-and-garnishments','timekeeping-compensation-and-payroll-compliance'].includes(section.slug)) {
      section.bodyHtml += '<p>For the service detail shown in the app, consolidated ADP earnings and separately identified accrual hours, see <a href="#handbook-adp-pay-statements-and-sick-leave-hours">ADP pay statements and Sick leave hours</a>. Bonus withholding follows <a href="#handbook-bonus-tax-withholding-and-gross-pay">Bonuses: gross pay and tax withholding</a>.</p>';
      changed.add(section.slug);
    }
  }
  const result = updates.map(update => {
    // Previously communicated October ITSCO material remains historical.
    if (update.period_label !== release.period) return update;
    const destinations = update.policy_section_slugs?.length ? update.policy_section_slugs : [update.handbook_section_slug];
    if (!destinations.some(slug=>changed.has(slug))) return update;
    return {...update,changed_content:destinations.map(slug=>source.sections.find(s=>s.slug===slug)).filter(Boolean).map(s=>`<h3>${s.title}</h3>${s.bodyHtml}`).join('')};
  });
  const add = (policy,rationale,related=[]) => result.push({id:`${tenant}-source-adp-policy-${policy.slug}`,status:'draft',period_label:release.period,digest_title:`${release.period} Workplace Handbook Updates`,subject:policy.title,rationale,changed_content:[policy,...related].map(s=>`<h3>${s.title}</h3>${s.bodyHtml}`).join(''),handbook_section_slug:policy.slug,policy_section_slugs:[policy.slug,...related.map(s=>s.slug)],related_section_slugs:[],link_origin:'source_review'});
  add(ADP_PAY_STATEMENT_SECTION,'Move the existing 1/30 accrual calculation from ADP into the app beginning with the October 24–November 6, 2026 pay period, include the applicable automatic H-code indirect allowance as a separate line, and preserve earlier-period ADP calculations and earned balances. Use existing service records and additional time submissions without duplicate reporting.',[SICK_LEAVE_HOURS_SECTION]);
  add(BONUS_TAX_SECTION,'Clarify that future bonuses are stated as gross compensation with required employee withholding, preserve mandatory employer tax obligations, and prevent unintended net-pay guarantees or retrospective changes to earned compensation.');
  return result;
}
