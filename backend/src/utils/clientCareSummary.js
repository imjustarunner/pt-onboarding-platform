import { summaryItems } from './clientExchangeSummary.js';
import { buildCounselingDependentEnSteps } from '../data/counselingIntakeDependentEn.js';
import { presentingProblemFromPlan } from '../services/treatmentPlanPrecedence.service.js';

export function parseSummaryJson(value) {
  if (typeof value !== 'string') return value || {};
  try { return JSON.parse(value); } catch { return {}; }
}
const defaultIntakeSteps = buildCounselingDependentEnSteps();
const concernKeys = ['presenting_problem', 'presentingProblem', 'presentingConcern', 'presenting_concern',
  'presenting_concerns', 'presenting_concerns_other', 'main_reason_for_therapy', 'main_reason_and_concerns',
  'reasonForVisit', 'chief_complaint'];

/** Read only the target child's answers; never fall back to a sibling's answers. */
export function intakePresentingProblems({ row, clientId, clientIds = [] }) {
  const data = parseSummaryJson(row.intake_data);
  const responses = data.responses || data;
  const children = responses.clients || data.clients || [];
  const index = clientIds.findIndex(id => Number(id) === Number(clientId));
  const child = children.find(c => Number(c.client_id || c.clientId) === Number(clientId))
    || (index >= 0 ? children[index] : null)
    || (children.length === 1 && Number(row.client_id) === Number(clientId) ? children[0] : null);
  if ((children.length > 1 || clientIds.length > 1) && !child) return [];
  if (child && (child.client_id || child.clientId) && Number(child.client_id || child.clientId) !== Number(clientId)) return [];
  // Shared submission-level clinical answers are unsafe to attribute in a multi-child packet.
  const shared = children.length > 1 || clientIds.length > 1 ? {} : {
    ...data, ...responses, ...data.submission, ...responses.submission
  };
  const bag = { ...shared, ...shared.clinicalResponses, ...child, ...child?.clinicalResponses };
  const fields = [];
  function walk(value) {
    if (Array.isArray(value)) return value.forEach(walk);
    if (!value || typeof value !== 'object') return;
    if (value.key && value.options) fields.push(value);
    for (const [key, nested] of Object.entries(value)) if (key !== 'options') walk(nested);
  }
  walk(parseSummaryJson(row.intake_fields));
  walk(parseSummaryJson(row.intake_steps));
  walk(defaultIntakeSteps);
  return [...new Set(concernKeys.flatMap(key => summaryItems(bag[key]).map(value => {
    const options = fields.find(field => field.key === key)?.options || [];
    const option = options.find(option => String(option.value) === value);
    return option?.label || value;
  })))];
}

export function latestPresentingProblem({ plans = [], intakes = [], preferences = {} }) {
  const candidates = [
    ...plans.filter(plan => plan.status === 'active' || (plan.status === 'draft' && plan.source_tool_id === 'client_creation_record_import')).map(plan => ({
      values: summaryItems(presentingProblemFromPlan(plan)), source: plan.status === 'draft' ? 'Treatment plan (review pending)' : 'Treatment plan',
      recordedAt: plan.updated_at || plan.created_at || null, priority: 2
    })),
    ...intakes.map(intake => ({ values: intake.values, source: intake.source || 'Intake', recordedAt: intake.recordedAt, priority: 1 })),
    { values: summaryItems(preferences.presentingConcern || preferences.reasonForVisit), source: 'Intake',
      recordedAt: preferences.submittedAt || null, priority: 0 }
  ].filter(candidate => candidate.values?.length);
  const time = value => new Date(value || 0).getTime() || 0;
  candidates.sort((a, b) => time(b.recordedAt) - time(a.recordedAt) || b.priority - a.priority);
  const latest = candidates[0];
  return { presentingProblems: latest?.values || [], presentingProblemSource: latest?.source || null,
    presentingProblemUpdatedAt: latest?.recordedAt || null };
}

/** Share only the presenting-problem section of an imported intake. */
export function intakeNotePresentingProblems(sections) {
  const rows = Array.isArray(sections) ? sections : sections?.sections || [];
  return summaryItems(rows.filter(section => /presenting[ _-]*(problem|concern)|chief[ _-]*complaint|reason[ _-]*for[ _-]*(visit|referral|treatment|therapy)/i.test([section.key, section.label, section.title].filter(Boolean).join(' ')))
    .map(section => section.body || section.content || ''));
}
