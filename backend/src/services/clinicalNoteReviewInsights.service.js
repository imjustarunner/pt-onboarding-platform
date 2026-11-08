import clinicalPool from '../config/clinicalDatabase.js';
import pool from '../config/database.js';
import { loadNarrivaSource } from './narrivaSource.service.js';
import { maybeDecryptNotePayload } from './clinicalNoteCrypto.service.js';
import { loadNarrivaAssessmentEvidence } from './narrivaAssessmentEvidence.service.js';
import { logNoteAidChartEvent } from './noteAidChartAudit.service.js';
import { parseNarrivaObject as parse, positiveId, narrivaError } from './narrivaAccess.service.js';
import { readSubmissionAnswers } from './officeClientSubmissions.service.js';
import { scoreOfficeFeedback } from './officeFeedbackForms.js';
import { sharedNotePredicate } from './sharedClinicalChart.service.js';
import { classifyObjectiveTrend, treatmentProgressAdvisories, quickLookSections, reviewDateOnly } from './clinicalNoteReviewInsights.policy.js';

export { classifyObjectiveTrend, treatmentProgressAdvisories } from './clinicalNoteReviewInsights.policy.js';
const placeholders = values => values.map(() => '?').join(',');
const instant = value => value instanceof Date ? value : new Date(/[zZ]|[+-]\d\d:\d\d$/.test(String(value)) ? value : String(value).replace(' ', 'T') + 'Z');
const boundedScore = value => value !== null && value !== undefined && value !== '' && Number.isFinite(Number(value)) && Number(value) >= 0 && Number(value) <= 10 ? Number(value) : null;
function localDate(value, zone) {
  try { return new Intl.DateTimeFormat('en-CA', { timeZone: zone || 'America/Denver', year: 'numeric', month: '2-digit', day: '2-digit' }).format(instant(value)); }
  catch { return reviewDateOnly(value); }
}
const iso = value => value ? instant(value).toISOString() : null;

export function buildClinicalTreatmentHistory({ sessions = [], objectives = [], ratings = [], events = [], feedback = [] }) {
  const ordered = [...sessions].sort((a, b) => +instant(a.scheduled_start_at) - +instant(b.scheduled_start_at) || Number(a.id) - Number(b.id)).slice(-5);
  const cards = ordered.map(row => ({ id: Number(row.id), sessionId: Number(row.id), date: localDate(row.scheduled_start_at, row.source_timezone),
    scheduledStartAt: iso(row.scheduled_start_at), serviceCode: row.service_code || null, sourceTimezone: row.source_timezone || 'America/Denver', officeEventId: positiveId(row.office_event_id) }));
  const sessionMap = new Map(cards.map(card => [card.id, card]));
  const dayMap = new Map();
  for (const card of cards) dayMap.set(card.date, [...(dayMap.get(card.date) || []), card]);
  const series = [];
  for (const objective of objectives) {
    const rows = ratings.filter(row => Number(row.objective_id) === Number(objective.id));
    const respondents = [...new Set(rows.map(row => `${row.rater_kind || 'clinician'}:${row.rated_by_user_id || ''}`))];
    if (!respondents.length) respondents.push('clinician:');
    for (const respondent of respondents) {
      const [raterKind, ratedByUserId] = respondent.split(':');
      const bySession = new Map();
      for (const row of rows.filter(row => `${row.rater_kind || 'clinician'}:${row.rated_by_user_id || ''}` === respondent)) {
        // Legacy date-only ratings are attributable only when exactly one selected
        // session occurred that local day. Never reuse one score across sessions.
        const sessionId = positiveId(row.session_id) || (!row.clinical_note_id && dayMap.get(reviewDateOnly(row.date_of_service))?.length === 1 ? dayMap.get(reviewDateOnly(row.date_of_service))[0].id : null);
        if (!sessionMap.has(sessionId)) continue;
        const prior = bySession.get(sessionId);
        if (!prior || +instant(row.rated_at) > +instant(prior.rated_at) || +instant(row.rated_at) === +instant(prior.rated_at) && Number(row.id) > Number(prior.id)) bySession.set(sessionId, row);
      }
      const points = cards.map(card => {
        const rating = bySession.get(card.id);
        return { sessionId: card.id, date: card.date, score: rating?.disposition === 'rated' ? boundedScore(rating.scale_value) : null,
          target: rating ? boundedScore(rating.scale_target_at_rating) : null, disposition: rating?.disposition || 'not_recorded',
          raterKind, ratedByUserId: positiveId(ratedByUserId), ratingId: positiveId(rating?.id) };
      });
      const direction = ['increase', 'decrease'].includes(objective.scale_direction) ? objective.scale_direction : null;
      const target = boundedScore(objective.scale_target), trend = classifyObjectiveTrend(points, { direction, target });
      series.push({ id: `${Number(objective.id)}:${respondent}`, objectiveId: Number(objective.id), goalId: Number(objective.goal_id),
        goal: objective.goal_text, objective: objective.objective_text, direction, target, raterKind,
        respondentLabel: raterKind === 'clinician' ? 'Clinician rating' : raterKind === 'client' ? 'Client rating' : 'Other respondent rating',
        status: objective.status, goalStatus: objective.goal_status, points, trend });
    }
  }
  const start = ordered[0]?.scheduled_start_at, end = ordered.at(-1)?.scheduled_end_at || ordered.at(-1)?.scheduled_start_at;
  const inWindow = value => value && start && +instant(value) >= +instant(start) && +instant(value) <= +instant(end);
  const changes = events.filter(event => inWindow(event.created_at)).map(event => ({ id: `event:${event.id}`, goalId: Number(event.goal_id),
    goal: event.goal_text, type: event.progress_status, previousStatus: event.previous_status, date: iso(event.created_at), source: 'recorded_goal_event' }));
  for (const objective of objectives) {
    if (inWindow(objective.created_at)) changes.push({ id: `objective-created:${objective.id}`, objectiveId: Number(objective.id), goalId: Number(objective.goal_id), goal: objective.goal_text,
      objective: objective.objective_text, type: 'objective_added', date: iso(objective.created_at), source: 'objective_lineage' });
    if (inWindow(objective.superseded_at)) changes.push({ id: `objective-replaced:${objective.id}`, objectiveId: Number(objective.id), goalId: Number(objective.goal_id), goal: objective.goal_text,
      objective: objective.objective_text, type: 'objective_updated', replacementObjectiveId: positiveId(objective.replaced_by_id), date: iso(objective.superseded_at), source: 'objective_lineage' });
    if (inWindow(objective.goal_superseded_at) && !changes.some(change => change.id === `goal-replaced:${objective.goal_id}`)) changes.push({ id: `goal-replaced:${objective.goal_id}`, goalId: Number(objective.goal_id), goal: objective.goal_text,
      type: 'goal_updated', replacementGoalId: positiveId(objective.goal_replaced_by_id), date: iso(objective.goal_superseded_at), source: 'goal_lineage' });
  }
  const checkins = [];
  for (const row of feedback) {
    const session = ordered.find(item => Number(item.office_event_id) === Number(row.event_id) && +instant(item.scheduled_start_at) === +instant(row.scheduled_start_at));
    if (!session || !row.completed_at) continue;
    const envelope = parse(row.forms_json), answers = readSubmissionAnswers(row.answers_json);
    const scores = scoreOfficeFeedback(Array.isArray(envelope.forms) ? envelope.forms : [], answers.answers, answers.skippedFormIds);
    checkins.push({ id: Number(row.id), sessionId: Number(session.id), date: localDate(session.scheduled_start_at, session.source_timezone),
      respondentType: envelope.respondentType || 'unknown', serviceType: envelope.serviceType || 'counseling', connection: scores.connection, progress: scores.progress,
      method: scores.method, validated: false, complete: scores.connection !== null && scores.progress !== null });
  }
  for (const change of changes) change.description = `${({ objective_added: 'Objective added', objective_updated: 'Objective updated', goal_updated: 'Goal updated', achieved: 'Goal achieved', improved: 'Goal marked improved', active: 'Goal marked active' })[change.type] || 'Goal progress updated'}: ${change.objective || change.goal || 'Treatment plan'}`;
  return { status: cards.length ? 'available' : 'no_sessions', sessions: cards, objectives: series, changes: changes.sort((a, b) => a.date.localeCompare(b.date)), checkins,
    advisories: treatmentProgressAdvisories(series.filter(item => !['achieved', 'superseded', 'inactive'].includes(item.goalStatus) && item.status === 'active')),
    scope: 'same_agency_client_provider', maximumSessions: 5,
    explanation: 'Up to five attended or documented sessions through this encounter. Missing ratings remain blank. Separate respondents, changed objectives and changed targets are not combined. Colors describe recorded score movement, not a clinical outcome or automatic treatment decision.',
    feedbackExplanation: 'Connection and progress are office check-in feedback, not validated clinical outcome measures. Client and caregiver responses remain distinct.' };
}

/** Internal loader: source must come from an already authorized note/draft. */
export async function loadClinicalTreatmentHistory(source, { clinicalDb = clinicalPool, mainDb = pool, selectedSessionIds = null } = {}) {
  const agencyId = positiveId(source.agencyId), clientId = positiveId(source.client?.id), providerId = positiveId(source.session?.provider_user_id || source.provider?.id);
  const sessionId = positiveId(source.source?.clinical_session_id || source.session?.id);
  if (selectedSessionIds && (!Array.isArray(selectedSessionIds) || selectedSessionIds.length > 5 || !selectedSessionIds.length || selectedSessionIds.some(id => !positiveId(id)))) throw narrivaError(400, 'Choose up to five existing sessions.');
  const finish = rows => {
    const result = buildClinicalTreatmentHistory(rows);
    if (selectedSessionIds) {
      const requested = new Set(selectedSessionIds.map(Number)), included = result.sessions.filter(row => requested.has(row.id)).length;
      result.selectionCoverage = { requestedCount: requested.size, includedCount: included, excludedCount: requested.size - included,
        complete: included === requested.size, reason: included === requested.size ? null : 'Some sampled sessions were outside this provider, encounter window or available clinical record. Progress describes only the included sessions; the full sample was not compared.' };
      if (!result.selectionCoverage.complete) {
        result.status = included ? 'partial' : 'insufficient';
        result.explanation += ` ${result.selectionCoverage.reason}`;
      }
    }
    return result;
  };
  if (!agencyId || !clientId || !providerId || !sessionId) return finish({});
  const [[anchor]] = await clinicalDb.execute('SELECT id,scheduled_start_at FROM clinical_sessions WHERE id=? AND agency_id=? AND client_id=? AND provider_user_id=?', [sessionId, agencyId, clientId, providerId]);
  if (!anchor?.scheduled_start_at) return finish({});
  const [sessions] = await clinicalDb.execute(`SELECT s.id,s.office_event_id,s.scheduled_start_at,s.scheduled_end_at,s.source_timezone,s.service_code
    FROM clinical_sessions s WHERE s.agency_id=? AND s.client_id=? AND s.provider_user_id=?
    AND s.encounter_status NOT IN ('cancelled','canceled','no_show') AND s.scheduled_start_at<=? AND s.scheduled_start_at<=UTC_TIMESTAMP()
    AND (s.encounter_status='completed' OR s.id=? OR EXISTS (SELECT 1 FROM clinical_notes n WHERE n.clinical_session_id=s.id AND n.agency_id=s.agency_id AND n.client_id=s.client_id AND n.is_deleted=0 AND n.provider_signed_at IS NOT NULL AND ${sharedNotePredicate('n')}))
    ${selectedSessionIds ? `AND s.id IN (${placeholders(selectedSessionIds)})` : ''} ORDER BY s.scheduled_start_at DESC,s.id DESC LIMIT 5`, [agencyId, clientId, providerId, anchor.scheduled_start_at, sessionId, ...(selectedSessionIds || [])]);
  if (!sessions.length) return finish({});
  const ids = sessions.map(row => Number(row.id)), dates = sessions.map(row => localDate(row.scheduled_start_at, row.source_timezone)).sort();
  const historyEnd = sessions[0].scheduled_end_at || sessions[0].scheduled_start_at;
  const [objectives] = await clinicalDb.execute(`SELECT o.id,o.goal_id,o.objective_text,o.scale_direction,o.scale_target,o.status,o.created_at,o.superseded_at,o.replaced_by_id,
    g.goal_text,g.status AS goal_status,g.superseded_at AS goal_superseded_at,g.replaced_by_id AS goal_replaced_by_id
    FROM clinical_treatment_plan_objectives o JOIN clinical_treatment_plan_goals g ON g.id=o.goal_id JOIN clinical_treatment_plans p ON p.id=g.treatment_plan_id
    WHERE p.agency_id=? AND p.client_id=? AND p.created_by_user_id=? AND p.status NOT IN ('deleted','void','draft')
    AND (p.effective_date IS NULL OR p.effective_date<=?) AND o.created_at<=? ORDER BY p.id,g.goal_index,o.objective_index LIMIT 501`, [agencyId, clientId, providerId, dates.at(-1), historyEnd]);
  if (objectives.length > 500) throw narrivaError(422, 'The treatment history exceeds the review limit. Open the full chart to review it.');
  const [ratings] = await clinicalDb.execute(`SELECT r.id,r.objective_id,r.scale_value,r.scale_target_at_rating,r.disposition,r.rater_kind,r.rated_by_user_id,r.clinical_note_id,r.date_of_service,r.rated_at,n.clinical_session_id AS session_id
    FROM clinical_treatment_objective_ratings r LEFT JOIN clinical_notes n ON n.id=r.clinical_note_id AND n.agency_id=r.agency_id AND n.client_id=r.client_id AND n.is_deleted=0 AND ${sharedNotePredicate('n')}
    WHERE r.agency_id=? AND r.client_id=? AND (n.clinical_session_id IN (${placeholders(ids)}) OR (r.clinical_note_id IS NULL AND r.date_of_service BETWEEN ? AND ?))
    ORDER BY r.rated_at,r.id LIMIT 5001`, [agencyId, clientId, ...ids, dates[0], dates.at(-1)]);
  if (ratings.length > 5000) throw narrivaError(422, 'The rating history exceeds the review limit. Open the full chart to review it.');
  const [events] = await clinicalDb.execute(`SELECT e.id,e.goal_id,e.progress_status,e.previous_status,e.created_at,g.goal_text FROM clinical_treatment_goal_progress_events e
    JOIN clinical_treatment_plan_goals g ON g.id=e.goal_id JOIN clinical_treatment_plans p ON p.id=e.treatment_plan_id AND p.id=g.treatment_plan_id
    WHERE e.agency_id=? AND e.client_id=? AND p.agency_id=e.agency_id AND p.client_id=e.client_id AND p.created_by_user_id=?
    AND e.created_at>=? AND e.created_at<=? ORDER BY e.created_at,e.id LIMIT 501`, [agencyId, clientId, providerId, sessions.at(-1).scheduled_start_at, sessions[0].scheduled_end_at || sessions[0].scheduled_start_at]);
  if (events.length > 500) throw narrivaError(422, 'The goal-change history exceeds the review limit.');
  const eventIds = [...new Set(sessions.map(row => positiveId(row.office_event_id)).filter(Boolean))];
  const [feedback] = eventIds.length ? await mainDb.execute(`SELECT id,event_id,scheduled_start_at,forms_json,answers_json,completed_at FROM office_client_checkin_submissions
    WHERE agency_id=? AND client_id=? AND provider_id=? AND event_id IN (${placeholders(eventIds)}) AND completed_at IS NOT NULL ORDER BY scheduled_start_at,id LIMIT 101`, [agencyId, clientId, providerId, ...eventIds]) : [[]];
  if (feedback.length > 100) throw narrivaError(422, 'The check-in history exceeds the review limit.');
  return finish({ sessions, objectives, ratings, events, feedback });
}

export function createClinicalNoteReviewInsights({ loadSource = loadNarrivaSource, history = loadClinicalTreatmentHistory, evidence = loadNarrivaAssessmentEvidence, audit = logNoteAidChartEvent } = {}) {
  return async (req, input) => {
    if (!/^[1-9][0-9]*$/.test(String(input.noteId || '')) || !positiveId(input.noteId) || !positiveId(input.agencyId)) throw narrivaError(400, 'Choose a saved note and workspace.');
    const source = await loadSource(req.user, { agencyId: Number(input.agencyId), noteId: Number(input.noteId) });
    const context = { agencyId: source.agencyId, clientId: source.client.id, noteId: Number(input.noteId), clinicalSessionId: source.source.clinical_session_id,
      assessmentEvidence: source.meta?.narrivaContext?.assessmentEvidence, assessmentDocumentIds: source.meta?.narrivaContext?.assessmentDocumentIds };
    let treatmentHistory, artifacts = [], artifactsStatus = 'available';
    try { treatmentHistory = await history(source); } catch { treatmentHistory = { status: 'unavailable', sessions: [], objectives: [], changes: [], checkins: [], advisories: [], explanation: 'Treatment history could not be loaded. Open the full note or try again.' }; }
    try {
      const result = await evidence(req.user, context, { authorizedNoteReviewer: true });
      const selected = new Set((result.selected || []).map(ref => `${ref.kind}:${ref.id}`));
      artifacts = (result.choices || []).filter(item => item.kind === 'session_material' || selected.has(`${item.kind}:${item.id}`)).map(item => ({
        id: Number(item.id), kind: item.kind, title: item.title, type: item.mimeType, available: item.available === true, scanStatus: item.scanStatus,
        href: item.available ? `/api/narriva/assessments/${item.kind}/${Number(item.id)}/view?${new URLSearchParams({ agencyId: String(source.agencyId), clientId: String(source.client.id), noteId: String(input.noteId), clinicalSessionId: String(source.source.clinical_session_id) })}` : null
      }));
    } catch { artifactsStatus = 'unavailable'; }
    const note = source.source;
    const sections = quickLookSections(maybeDecryptNotePayload(note.note_payload));
    for (const entry of note.clinical_version_addenda || []) {
      const excerpt = quickLookSections({ narrative: maybeDecryptNotePayload(entry.body) })[0];
      sections.push({ ...excerpt, key: `entry:${entry.id}`, label: ({ correction: 'Amendment / correction', late_entry: 'Late entry', addendum: 'Addendum' })[entry.entry_kind] || 'Historical entry' });
    }
    if (Number(note.addendum_count) > (note.clinical_version_addenda || []).length) sections.push({ key: 'additional_entries', label: 'Additional saved entries', text: 'Open the full note to review its historical addenda.', present: true, truncated: true });
    const insights = { noteId: Number(input.noteId), agencyId: source.agencyId,
      sourceRevision: { id: positiveId(note.clinical_version_id), number: positiveId(note.clinical_version_number), contentHash: note.clinical_version_content_hash || note.legacy_review_content_hash || note.content_hash || source.sourceHash,
        reviewSourceHash: source.sourceHash || null, entryManifestHash: note.clinical_version_entry_manifest_hash || null, updatedAt: note.updated_at || null, pendingAmendment: !!note.clinical_version_pending_id },
      quickLook: { mode: 'saved_section_excerpts', description: 'Excerpts from the saved note. Open the full note to review all wording before signing.', sections,
        encounter: { serviceCode: source.service?.code || source.session?.service_code || null, date: reviewDateOnly(note.date_of_service || source.meta?.dateOfService) || localDate(source.session?.scheduled_start_at, source.session?.source_timezone), durationMinutes: source.encounter?.durationMinutes || null, modality: source.encounter?.modality || null },
        artifacts, artifactsStatus }, treatmentHistory };
    await audit(req, { agencyId: source.agencyId, clientId: source.client.id, action: 'clinical_note_review_insights_viewed', metadata: { noteId: Number(input.noteId), sourceHash: insights.sourceRevision.contentHash, sessionCount: treatmentHistory.sessions.length } });
    return insights;
  };
}
export const getClinicalNoteReviewInsights = createClinicalNoteReviewInsights();

export async function loadNarrivaLongitudinalAdvisory(source, options = {}) {
  try {
    const history = await loadClinicalTreatmentHistory(source, options);
    return { status: history.status, sessionCount: history.sessions.length, advisories: history.advisories,
      explanation: history.explanation, reviewedAt: new Date().toISOString(), affectsQuickSign: false };
  } catch {
    return { status: 'unavailable', sessionCount: null, advisories: [], affectsQuickSign: false,
      explanation: 'Longitudinal progress could not be loaded. No progress conclusion was made; review the treatment history separately.' };
  }
}
