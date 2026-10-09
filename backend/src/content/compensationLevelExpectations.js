import {SUPERVISORY_REVIEW_CONSIDERATION} from './compensationHandbookClarifications.js';
/** Shared editorial policy. It never assigns work, changes pay, or records hours. */
export const LEVEL_EXPECTATIONS_VERSION = 'itsco-level-expectations-2026-10-09-annual';
export const LEVEL_EXPECTATIONS_SLUG = 'compensation-level-expectations-and-review';
export const LEVEL_EXPECTATIONS_TITLE = 'Compensation levels: expectations, good standing and review';

export const ANNUAL_INDIRECT_COMMITMENT = 'I agree to participate in a minimum of four (4) hours of assigned outreach or agency events during each calendar year, January 1 through December 31, compensated separately at my agreed-upon indirect hourly rate. While school-assigned, the annual commitment is eight (8) hours total, including four (4) additional hours for school-related events. The eight-hour total applies across all school assignments, not separately to each school. Actual event time is recorded and paid separately from service-credit compensation and automatic H-code indirect allowances; the same work may not be counted or paid twice.';

export const INDIRECT_WORK_ADMINISTRATION = 'ITSCO and the employee will identify and schedule the indirect duties that satisfy this commitment, including assigned outreach, community and school events. Required outreach under this commitment is paid indirect work, not unpaid volunteering. Other activities retain the pay classification disclosed in the compensation schedule unless expressly designated as part of this indirect-work assignment. The commitment does not automatically add four or eight hours to payroll: record all actual time worked, including additional compensable time. ITSCO will make assignments and scheduling expectations clear. Management will address unavailable assignments, school closures, approved schedule changes, protected leave and reasonable accommodations; an employee will not be treated as failing this commitment solely because ITSCO did not make the work available. Requirements are adjusted as required for protected leave and accommodations, without unpaid make-up work. Applicable minimum wage and overtime protections continue to apply.';

export const LEVEL_REVIEW_CATEGORIES = [
  {title:'Supervisory review and evaluations',expectation:SUPERVISORY_REVIEW_CONSIDERATION,evidence:'Documented supervisory feedback, clinical review findings, formal evaluations and the employee’s response.'},
  {
    title: 'Annual paid event-work commitment',
    expectation: 'Complete the assigned four-hour annual event commitment, or eight-hour annual total while school-assigned (January 1–December 31), with accurate actual-time records and timely follow-through. Review both the work made available and the work performed; do not substitute automatic payroll allowances for actual participation.',
    evidence: 'Assigned duties, agreed schedules, time records and completed work, with approved adjustments documented.'
  },
  {
    title: 'Documentation quality and timeliness',
    expectation: 'Complete accurate notes, treatment plans and required documentation within the communicated clinical, payer and agency deadlines. Correct errors and respond to documentation requests promptly. Review system outages, approved extensions and protected absences before identifying a performance concern.',
    evidence: 'Applicable deadlines, completion records, accuracy reviews and the employee’s explanation of barriers.'
  },
  {
    title: 'Attendance, call-offs and clinician cancellations',
    expectation: 'Meet agreed schedules, give timely notice when unable to attend, and support appropriate client notification, rescheduling and coverage. Consider avoidable clinician cancellations and unprotected attendance concerns in context. Exclude protected leave and accommodations; distinguish clinician decisions from client cancellations, school closures and events outside the employee’s control.',
    evidence: 'Scheduling and notice records, reasons for cancellations, coverage efforts and confirmed circumstances.'
  },
  {
    title: 'Outreach and team participation',
    expectation: 'Participate in assigned outreach events and practice or school partnership activities that fit the employee’s role and disclosed schedule. Communicate conflicts and complete agreed alternatives when appropriate. Assigned outreach hours under this commitment are paid at the agreed indirect rate and count toward the four- or eight-hour calendar-year total; additional actual work remains compensable.',
    evidence: 'Event assignments, participation, completed follow-up and documented scheduling arrangements.'
  },
  {
    title: 'Professional standing, collaboration and feedback',
    expectation: 'Maintain required credentials and supervision, follow professional and agency standards, communicate respectfully and address substantiated concerns. Consider reports from schools, clients and staff after reviewing facts, context and the employee’s response. A complaint alone is not a finding of misconduct or an automatic basis for a lower level. Good-faith reporting, wage concerns and other protected activity are not adverse factors.',
    evidence: 'Credential and supervision records, specific observed conduct, documented feedback and reviewed findings.'
  },
  {
    title: 'Client connection and engagement',
    expectation: 'Build a responsive, respectful therapeutic relationship; communicate appropriately with clients and authorized caregivers; and address access, language and engagement barriers within the employee’s role. Evaluate the clinician’s actions and quality of care, with attention to client choice and confidentiality, rather than popularity or retention alone.',
    evidence: 'Appropriate feedback, communication and follow-up records, care coordination and documented engagement efforts.'
  },
  {
    title: 'Treatment goals, progress and appropriate completion of care',
    expectation: 'Develop individualized goals and objectives, assess progress, adjust care when needed, and support clinically appropriate goal attainment, termination, transfer or referral. Consider client acuity, readiness, disability, school context and other barriers. Progress is a consideration, not a guaranteed outcome. Do not reward unnecessary treatment, premature discharge, selecting only easier cases or a predetermined number of successful terminations.',
    evidence: 'Clinical review of treatment planning, progress assessment, appropriate adjustments and continuity-of-care decisions.'
  },
  {
    title: 'School and client action items',
    expectation: 'Complete assigned intake, family contact, school coordination, roster, scheduling and other client action items by communicated deadlines. Keep status records accurate and escalate blocked items promptly. Apply school-specific responsibilities only while school-assigned and within authorized information-sharing boundaries.',
    evidence: 'Task assignments, due dates, completion records, escalations and documented external dependencies.'
  }
];

export const LEVEL_REVIEW_PROCESS = 'ITSCO will conduct formal compensation-level evaluations one to two times per year. Supervisors may provide feedback and address concerns between formal evaluations. Reviews consider the responsibilities applicable to the employee’s role, the expectations disclosed in advance, reliable evidence and the employee’s response. Good standing means substantially meeting the applicable professional, documentation, reliability, participation and follow-through expectations, with concerns assessed fairly and in context. Protected leave, reasonable accommodations and other protected activity are excluded from adverse consideration.';

export const LEVEL_CHANGE_PROCESS = 'A review may result in maintaining the current compensation level, advancement when the applicable criteria are met, or a prospective reduction within the employee’s compensation category when documented expectations are not met. Advancement is not automatic. Management will communicate the reasons, relevant evidence and expectations for improvement, ordinarily with a written improvement plan and a follow-up date; serious concerns may require earlier action. The employee may submit a response or request management review. Any changed level and resulting rates must be communicated in writing before affected work, with any agreement required by existing terms. No review reduces pay or leave already earned. A handbook edit, complaint, missed task or app-generated flag does not automatically change an employee’s pay level. Credential categories and session-based workload tiers remain distinct from performance-based compensation levels; Tier 3 bonus eligibility continues to follow the disclosed session-count rules.';

export function levelExpectationsAmendmentClauses() {
  return `<h3>9. Annual paid event-work commitment</h3><p>${ANNUAL_INDIRECT_COMMITMENT}</p><p>${INDIRECT_WORK_ADMINISTRATION}</p>`
    + `<h3>10. Compensation-level expectations and review</h3><p>I acknowledge the Workplace Handbook section “${LEVEL_EXPECTATIONS_TITLE}” and agree to the applicable expectations for documentation, attendance and clinician cancellations, paid outreach, professional standing and collaboration, client engagement and treatment progress, and school/client action items.</p><p>${LEVEL_REVIEW_PROCESS}</p><p>${LEVEL_CHANGE_PROCESS}</p>`;
}

/** Insert only the requested clauses, preserving previously edited agreement text. */
export function addLevelExpectationsToClauses(html) {
  const source = String(html || '');
  if (source.includes('<h3>9. Annual paid event-work commitment</h3>')) return source;
  if (source.includes('<h3>9. Weekly paid indirect-work commitment</h3>')) return source.replace(/<h3>9\. Weekly paid indirect-work commitment<\/h3>[\s\S]*?(?=<h3>10\.)/, `<h3>9. Annual paid event-work commitment</h3><p>${ANNUAL_INDIRECT_COMMITMENT}</p><p>${INDIRECT_WORK_ADMINISTRATION}</p>`);
  const signature = /<h3>9\. Employee acknowledgment and signatures<\/h3>/;
  if (!signature.test(source)) throw new Error('The existing signature heading needs review before inserting the new compensation-level clauses.');
  return source.replace(signature, `${levelExpectationsAmendmentClauses()}<h3>11. Employee acknowledgment and signatures</h3>`);
}

export function levelExpectationsHandbookSection() {
  const categories = LEVEL_REVIEW_CATEGORIES.map((item, i) => `<section><h3>${i + 1}. ${item.title}</h3><p>${item.expectation}</p><p><strong>Review evidence:</strong> ${item.evidence}</p></section>`).join('');
  return {
    slug: LEVEL_EXPECTATIONS_SLUG,
    title: LEVEL_EXPECTATIONS_TITLE,
    bodyHtml: '<p>This section establishes the shared considerations for qualifying for, maintaining and reviewing compensation levels. The employee’s completed individual schedule identifies the assigned category, level and rates. These expectations take effect prospectively under the employee’s amendment and written notice; they do not create undisclosed retroactive criteria.</p>'
      + `<h2>Annual paid event-work commitment</h2><p>${ANNUAL_INDIRECT_COMMITMENT}</p><p>${INDIRECT_WORK_ADMINISTRATION}</p>`
      + '<h2>Evaluation categories</h2>' + categories
      + `<h2>Evaluation schedule and good standing</h2><p>${LEVEL_REVIEW_PROCESS}</p>`
      + '<p>For each applicable category, document “Meets expectations,” “Needs improvement” or “Not applicable,” with the review period, supporting facts and the employee’s comments. Disclose role- or level-specific standards before using them. This framework does not establish undisclosed point totals, weighting or automatic promotion/demotion thresholds.</p>'
      + `<h2>Maintaining or changing a compensation level</h2><p>${LEVEL_CHANGE_PROCESS}</p>`
      + '<p>Clinical decisions must prioritize appropriate care and client choice. Reviewers must not use treatment outcomes or discharge counts as quotas. Share only the information appropriate for the review; detailed clinical records remain in the authorized clinical record.</p>'
  };
}
