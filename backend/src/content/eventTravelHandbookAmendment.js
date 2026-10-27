export const EVENT_TRAVEL_HANDBOOK_SLUG = 'event-travel-reimbursement';
export const EVENT_TRAVEL_HANDBOOK_URL = `https://app.itsco.health/itsco/workplace-handbook#handbook-${EVENT_TRAVEL_HANDBOOK_SLUG}`;
const policyLink = `<a href="${EVENT_TRAVEL_HANDBOOK_URL}">Outreach travel reimbursement</a>`;
const travelSummary = `<p>For an assigned outreach event, use <strong>Submit → Payroll &amp; reimbursements → Event travel reimbursement</strong> for trips to and from the event and related materials pickup or return. One report covers eligible travel and materials-handling time at the employee's Support Activity rate and eligible personal-vehicle mileage at the applicable event mileage rate. Payroll reviews the actual trips and the policy or agreement in effect when they occurred. Follow the ${policyLink} policy; do not submit separate mileage or Support Activity travel claims for the same outreach assignment.</p>`;

export const EVENT_TRAVEL_POLICY_HTML = `<p>This policy applies only to travel for <strong>assigned outreach events</strong>, including outreach events held at schools. Regular school-service mileage remains governed by the existing <a href="https://app.itsco.health/itsco/workplace-handbook#handbook-mileage-reimbursement-policy">school mileage reimbursement policy</a>.</p>
<p>For outreach travel, use <strong>My Dashboard → Submit → Payroll &amp; reimbursements → Event travel reimbursement</strong>. This single report replaces separate outreach mileage and Support Activity travel submissions. Eligible travel time and vehicle expenses remain payable under this policy and any applicable agreement.</p>
<h4>Complete one report for the event date</h4>
<ol>
<li><strong>Event:</strong> select your assigned event and the date you worked. If the assignment or venue address is missing, ask your coordinator to correct it.</li>
<li><strong>Materials:</strong> indicate whether you already had materials at home or in your car, picked them up before the event, or did not need a pickup. Report whether you returned them on the way back, returned them on another trip, kept them, or had none to return. For pickup or return trips, indicate whether you chose the timing for convenience or were asked to make a specific trip or meet a required time.</li>
<li><strong>Your trips:</strong> report where each trip began and ended: home, assigned office, school or another location. The form uses saved home and event addresses and your assigned office for materials pickup or return. Confirm the addresses and report separate materials trips on their actual dates. Enter actual travel start and end times, excluding personal stops. Record actual pickup, loading, return or unloading work separately when it has not already been clocked or claimed. Select whether you drove your own vehicle, used a company vehicle, rode as a passenger or used other transportation.</li>
<li><strong>Review:</strong> check the route, times and calculated distances, add any information payroll needs, certify accuracy and select <strong>Submit report</strong>. The form calculates driving distances through the same Google distance service used for school mileage. Explain any actual-mileage correction. The preview is subject to payroll review.</li>
</ol>
<h4>How time and mileage are reviewed</h4>
<p>Payroll reviews each part of the outreach trip separately. Eligible travel and materials-handling time is paid at your applicable <strong>Support Activity rate</strong>, using actual compensable time. Eligible business miles driven in your personal vehicle are reimbursed at the applicable <strong>event mileage rate</strong>, separately from wages. Outreach mileage does not use school benefit tiers or the school mileage cap. Riding as a passenger or using a company vehicle does not generate personal-vehicle mileage reimbursement.</p>
<ul>
<li><strong>Office → event → office:</strong> travel between these work locations generally qualifies for travel time and, when you drive your personal vehicle, mileage. Home-to-office and office-to-home portions are reviewed separately as commuting.</li>
<li><strong>Home → event → home:</strong> an ordinary commute, with no additional work duties or applicable exception, generally does not qualify for travel pay or mileage under this policy. Report the actual trip and any relevant duties or instructions so payroll can review exceptions and earlier agreements.</li>
<li><strong>Materials trips:</strong> report what occurred even if pickup or return was convenient or on another day. Choosing a convenient time does not by itself make actual work unpaid. Payroll considers required trips or timing, work performed, travel between work locations and whether duties or restrictions made travel part of the workday. Already having materials at home or in your car does not create a pickup trip; report actual handling work if performed.</li>
</ul>
<h4>Keep event work and travel separate</h4>
<p>Clock in when assigned outreach event work begins and clock out when it ends. Approved outreach event work is paid at your applicable indirect rate. Event emails and reminders provide attendance controls; open Submit separately for travel reimbursement. Do not include travel in event attendance or claim the same time, handling work or miles twice.</p>
<h4>Review, corrections and earlier travel</h4>
<p>Payroll reviews eligibility, exceptions and the applicable rates before applying payment. Reopen an existing report from Event travel reimbursement to review or correct it while editable. If it is locked, the route cannot be calculated, or an assignment, address, time or payment is wrong, contact payroll or your coordinator for correction. Explain other transportation expenses to payroll rather than claiming personal-vehicle miles you did not drive.</p>
<p>Trips already taken retain the compensation policy or agreement applicable when the travel occurred. This submission change does not retroactively reduce earned pay or reimbursement. Report all work performed; a missing form option, late report or approval issue does not erase earned wages or reimbursement required by law. Applicable minimum-wage and overtime requirements continue to apply.</p>`;

export const EVENT_TRAVEL_NOVEMBER_UPDATE = {
  subject: 'Outreach travel reimbursement — one report for travel time and mileage',
  rationale: 'Replace separate outreach mileage and Support Activity travel submissions with one report of actual trips and materials handling. Clarify payroll review and preserve earned compensation and earlier agreements. This update applies to outreach only; the existing school mileage reimbursement policy is unchanged.',
  changedContent: `<p><strong>This update applies to assigned outreach events only.</strong> The existing school mileage reimbursement policy is unchanged.</p>
<p>For an assigned outreach event, open <strong>My Dashboard → Submit → Payroll &amp; reimbursements → Event travel reimbursement</strong>. Select the event and date, describe materials pickup or return, enter your actual trips and times, and review and submit one report.</p>
<p>The form includes materials already at home or in your car, pickup or return on another day, and whether the trip timing was convenient or required. Saved home, event and assigned-office addresses fill in the route; Google calculates driving distances. Check the addresses and explain any mileage correction.</p>
<p>Payroll reviews each trip for eligible <strong>travel and materials-handling time at your Support Activity rate</strong> and <strong>personal-vehicle mileage at the applicable event mileage rate</strong>. Office-to-event travel generally qualifies; ordinary home-to-event commuting generally does not, subject to duties, exceptions and earlier agreements. Convenient timing alone does not make actual work unpaid.</p>
<p><strong>There are no separate outreach mileage or Support Activity travel submissions.</strong> Eligible outreach travel pay and vehicle reimbursement have not been eliminated. Clock outreach event work separately at the applicable indirect rate using the event clock-in and clock-out controls. Event emails and reminders do not collect travel reports. Do not submit duplicate time or miles.</p>
<p>Earlier travel retains the policy or agreement applicable when it occurred. Reopen an editable report to correct it or contact payroll if it is locked. <a href="${EVENT_TRAVEL_HANDBOOK_URL}">Read the complete outreach travel reimbursement policy and examples</a>.</p>`
};

// Reconcile current instructions without changing archived source files, monthly
// history, another company's policies, or individual compensation agreements.
export function applyEventTravelHandbookAmendment(source, tenant) {
  if (tenant !== 'itsco') return source;
  const sections = source.sections || (source.sections = []);
  for (const section of sections) {
    if (section.status !== 'ready' || section.slug === EVENT_TRAVEL_HANDBOOK_SLUG) continue;
    let body = section.bodyHtml || '';
    if (['indirect-services', 'compensation-separately-compensated-indirect-service', 'compensation-support-activity'].includes(section.slug)) {
      body = body.replace(/<p>Use Submit → Event travel reimbursement[\s\S]*?<\/p>/g, travelSummary);
      body = body.replace('<li>travel to and from approved events, including assigned school and outreach events;</li>', '<li>compensable travel and materials-handling time for assigned outreach events;</li>');
    } else if (section.slug === 'claim-submissions-via-app-itsco-health') {
      if (!body.includes(EVENT_TRAVEL_HANDBOOK_URL)) body = body.replace('</ul>', `<li>${policyLink} — one report for eligible outreach travel time, materials handling and personal-vehicle mileage</li>\n</ul>`) + '\n' + travelSummary;
    } else if (section.slug === 'outreach-services-non-clinical') {
      if (!body.includes(EVENT_TRAVEL_HANDBOOK_URL)) body += '\n' + travelSummary;
    } else if (['actual-work-time-support-and-corrections', 'timekeeping-support-and-overtime'].includes(section.slug)) {
      if (!body.includes(EVENT_TRAVEL_HANDBOOK_URL)) body += '\n<h4>Outreach event work and travel</h4><p>Clock in and out for actual assigned outreach event work at your applicable indirect rate. Record travel and materials handling separately, without duplicating event work time.</p>' + travelSummary;
    }
    section.bodyHtml = body;
  }
  const existing = sections.find(s => s.slug === EVENT_TRAVEL_HANDBOOK_SLUG);
  const outreach = sections.find(s => s.slug === 'outreach-services-non-clinical');
  const policy = { slug: EVENT_TRAVEL_HANDBOOK_SLUG, parentSlug: outreach?.slug || null,
    title: 'Outreach travel reimbursement', sourcePage: null, status: 'ready', bodyHtml: EVENT_TRAVEL_POLICY_HTML };
  if (existing) Object.assign(existing, policy);
  else sections.splice(outreach ? sections.indexOf(outreach) + 1 : sections.length, 0, policy);
  return source;
}
