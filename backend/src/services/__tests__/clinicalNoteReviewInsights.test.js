import { describe, it, expect, vi, beforeEach } from 'vitest';
const m = vi.hoisted(() => ({ load: vi.fn(), evidence: vi.fn(), audit: vi.fn() }));
vi.mock('../narrivaSource.service.js', () => ({ loadNarrivaSource: m.load }));
vi.mock('../narrivaAssessmentEvidence.service.js', () => ({ loadNarrivaAssessmentEvidence: m.evidence }));
vi.mock('../noteAidChartAudit.service.js', () => ({ logNoteAidChartEvent: m.audit }));
vi.mock('../clinicalNoteCrypto.service.js', () => ({ maybeDecryptNotePayload: value => value }));
vi.mock('../officeClientSubmissions.service.js', () => ({ readSubmissionAnswers: value => typeof value === 'string' ? JSON.parse(value) : value }));
import { classifyObjectiveTrend, quickLookSections } from '../clinicalNoteReviewInsights.policy.js';
import { buildClinicalTreatmentHistory, createClinicalNoteReviewInsights, loadClinicalTreatmentHistory, loadNarrivaLongitudinalAdvisory } from '../clinicalNoteReviewInsights.service.js';
import { officeFeedbackForms } from '../officeFeedbackForms.js';

const points = values => values.map((score, index) => ({ score, sessionId: index + 1, target: 10, raterKind: 'clinician', ratedByUserId: 7 }));
const sessions = [1, 2, 3, 4, 5].map(id => ({ id, office_event_id: id + 100, scheduled_start_at: `2026-10-${String(id + 10).padStart(2, '0')} 16:00:00`, scheduled_end_at: `2026-10-${String(id + 10).padStart(2, '0')} 17:00:00`, source_timezone: 'America/Denver', service_code: '90837' }));
const objective = { id: 20, goal_id: 10, goal_text: 'Use coping skills', objective_text: 'Practice the chosen skill', scale_direction: 'increase', scale_target: 10, status: 'active', goal_status: 'active', created_at: '2026-09-01 00:00:00' };
const ratings = (values, extra = {}) => values.map((score, index) => ({ id: index + 1, objective_id: 20, scale_value: score, scale_target_at_rating: 10, disposition: 'rated', rater_kind: 'clinician', rated_by_user_id: 7, clinical_note_id: index + 10, session_id: index + 1, rated_at: `2026-10-${index + 11} 17:00:00`, ...extra }));
beforeEach(() => vi.clearAllMocks());

describe('descriptive objective comparisons', () => {
  it('uses the recorded direction and does not treat lower values as universally worse', () => {
    expect(classifyObjectiveTrend(points([2, 4, 6]), { direction: 'increase', target: 10 })).toMatchObject({ status: 'progressing', color: 'green' });
    expect(classifyObjectiveTrend(points([6, 4, 2]).map(p => ({ ...p, target: 1 })), { direction: 'decrease', target: 1 })).toMatchObject({ status: 'progressing', color: 'green' });
    expect(classifyObjectiveTrend(points([6, 4, 2]), { direction: 'increase', target: 10 })).toMatchObject({ status: 'regressing', color: 'red' });
  });
  it('requires three scores for stagnation and does not flag maintaining the target', () => {
    expect(classifyObjectiveTrend(points([4, 4]), { direction: 'increase', target: 10 }).status).toBe('insufficient');
    expect(classifyObjectiveTrend(points([4, 4, 4]), { direction: 'increase', target: 10 })).toMatchObject({ status: 'stagnant', color: 'yellow' });
    expect(classifyObjectiveTrend(points([10, 10, 10]), { direction: 'increase', target: 10 }).status).toBe('progressing');
  });
  it('never fills missing ratings, mixes raters or crosses changed targets', () => {
    expect(classifyObjectiveTrend(points([null, 4]), { direction: 'increase', target: 10 }).status).toBe('insufficient');
    expect(classifyObjectiveTrend(points([2, 4]).map((p, i) => ({ ...p, target: i ? 8 : 10 })), { direction: 'increase', target: 8 }).status).toBe('insufficient');
    expect(classifyObjectiveTrend(points([2, 4]).map((p, i) => ({ ...p, raterKind: i ? 'client' : 'clinician' })), { direction: 'increase', target: 10 }).status).toBe('insufficient');
    expect(classifyObjectiveTrend(points([2, 4]), { target: 10 }).status).toBe('insufficient');
    expect(classifyObjectiveTrend(points([2, 4]).map(p => ({ ...p, sessionId: 1 })), { direction: 'increase', target: 10 }).status).toBe('insufficient');
  });
});

describe('five-session history', () => {
  it('keeps actual rating gaps and separates clinician and client series', () => {
    const result = buildClinicalTreatmentHistory({ sessions, objectives: [objective], ratings: [...ratings([3, null, 3, 3]), ...ratings([7, 8], { rater_kind: 'client', rated_by_user_id: 9 })] });
    expect(result.sessions).toHaveLength(5); expect(result.objectives).toHaveLength(2);
    expect(result.objectives[0].points.map(p => p.score)).toEqual([3, null, 3, 3, null]);
    expect(result.objectives[0].trend.status).toBe('stagnant');
    expect(result.objectives[1].trend.status).toBe('progressing');
    expect(result.advisories).toHaveLength(1);
    expect(result.advisories[0]).toMatchObject({ automaticAction: false, affectsQuickSign: false });
    expect(result.advisories[0].recommendation).toContain('do not');
  });
  it('does not attribute one date-only rating to two same-day sessions', () => {
    const sameDay = [sessions[0], { ...sessions[0], id: 6, scheduled_start_at: '2026-10-11 20:00:00' }];
    const result = buildClinicalTreatmentHistory({ sessions: sameDay, objectives: [objective], ratings: [{ ...ratings([5])[0], session_id: null, clinical_note_id: null, date_of_service: '2026-10-11' }] });
    expect(result.objectives[0].points.map(p => p.score)).toEqual([null, null]);
  });
  it('uses the latest saved rating once per session and preserves a deferred status', () => {
    const rows = [...ratings([3]), { ...ratings([7])[0], id: 99, rated_at: '2026-10-11 18:00:00' }, { ...ratings([8])[0], id: 100, disposition: 'deferred', rated_at: '2026-10-11 19:00:00' }];
    const result = buildClinicalTreatmentHistory({ sessions, objectives: [objective], ratings: rows });
    expect(result.objectives[0].points[0]).toMatchObject({ score: null, disposition: 'deferred', ratingId: 100 });
  });
  it('shows recorded goal/lineage changes only within the selected session window', () => {
    const result = buildClinicalTreatmentHistory({ sessions, objectives: [{ ...objective, superseded_at: '2026-10-13 17:00:00', replaced_by_id: 21 }], events: [
      { id: 1, goal_id: 10, goal_text: 'Use coping skills', progress_status: 'achieved', previous_status: 'active', created_at: '2026-10-14 16:15:00' },
      { id: 2, goal_id: 10, progress_status: 'active', created_at: '2026-10-30 16:15:00' }
    ] });
    expect(result.changes.map(c => c.type)).toEqual(['objective_updated', 'achieved']);
    expect(result.changes[0]).toMatchObject({ replacementObjectiveId: 21 });
  });
  it('shows zero-valued check-in scores, distinct respondents and exact appointment matching', () => {
    const forms = officeFeedbackForms('client'), answers = Object.fromEntries(forms.map(form => [form.id, Object.fromEntries(form.fields.map(field => [field.id, field.scoreDirection === 'reverse' ? '10' : '0']))]));
    const base = { id: 1, event_id: 101, scheduled_start_at: sessions[0].scheduled_start_at, completed_at: '2026-10-11 15:50:00', forms_json: { forms, respondentType: 'client', serviceType: 'counseling' }, answers_json: { answers, skippedFormIds: [] } };
    const result = buildClinicalTreatmentHistory({ sessions, feedback: [base, { ...base, id: 2, event_id: 999 }, { ...base, id: 3, completed_at: null }] });
    expect(result.checkins).toHaveLength(1);
    expect(result.checkins[0]).toMatchObject({ connection: 0, progress: 0, respondentType: 'client', validated: false });
  });
});

describe('authorized saved-note quick look', () => {
  const source = { agencyId: 2, noteId: 40, client: { id: 11 }, provider: { id: 7 }, source: { id: 40, clinical_session_id: 5, note_payload: JSON.stringify({ sections: { interventions: 'Practiced the supplied skill.', risk: 'Risk was not assessed.' } }), content_hash: 'saved-hash', clinical_version_pending_id: 99 }, meta: {}, session: { id: 5, provider_user_id: 7 } };
  const req = { user: { id: 7 } };
  it('returns excerpts for every saved section and explicit truncation without synthesizing facts', () => {
    expect(quickLookSections({ sections: { consent: false, score: 0, narrative: 'abcdef' }, meta: { clientId: 20 } }, 4)).toEqual([
      { key: 'consent', label: 'Consent', text: 'fals', present: true, truncated: true },
      { key: 'score', label: 'Score', text: '0', present: true, truncated: false },
      { key: 'narrative', label: 'Narrative', text: 'abcd', present: true, truncated: true }
    ]);
  });
  it('checks exact source authorization before reading any history/artifact and does not return a sign token', async () => {
    const load = vi.fn().mockRejectedValue(Object.assign(new Error('Unauthorized'), { status: 403 })), history = vi.fn(), evidence = vi.fn();
    await expect(createClinicalNoteReviewInsights({ loadSource: load, history, evidence })(req, { agencyId: 2, noteId: 40 })).rejects.toMatchObject({ status: 403 });
    expect(history).not.toHaveBeenCalled(); expect(evidence).not.toHaveBeenCalled();
  });
  it('keeps pending amendments visible and only displays selected documents or same-session materials', async () => {
    const audit = vi.fn(), load = vi.fn().mockResolvedValue(source);
    const result = await createClinicalNoteReviewInsights({ loadSource: load, audit, history: async () => buildClinicalTreatmentHistory({ sessions }), evidence: async () => ({ selected: [{ kind: 'client_document', id: 3 }], choices: [
      { kind: 'client_document', id: 3, available: true, title: 'Assessment', mimeType: 'application/pdf' },
      { kind: 'client_document', id: 4, available: true, title: 'Unrelated chart attachment' },
      { kind: 'session_material', id: 5, available: false, scanStatus: 'pending', title: 'Pending attachment' }
    ] }) })(req, { agencyId: 2, noteId: 40 });
    expect(result.sourceRevision).toMatchObject({ contentHash: 'saved-hash', pendingAmendment: true });
    expect(result.quickLook.sections.map(s => s.key)).toEqual(['interventions', 'risk']);
    expect(result.quickLook.artifacts.map(a => a.id)).toEqual([3, 5]);
    expect(result.quickLook.artifacts[1].href).toBeNull();
    expect(result).not.toHaveProperty('signToken'); expect(result).not.toHaveProperty('quickSignEligible');
    expect(audit).toHaveBeenCalledWith(req, expect.objectContaining({ action: 'clinical_note_review_insights_viewed' }));
  });
  it('binds excerpts and addenda to the approved immutable revision while flagging pending amendments', async () => {
    const saved = { ...source, source: { ...source.source, clinical_version_id: 81, clinical_version_number: 2, clinical_version_content_hash: 'approved-hash',
      clinical_version_addenda: [{ id: 8, entry_kind: 'correction', body: 'Corrected the documented duration.' }], addendum_count: 1 } };
    const result = await createClinicalNoteReviewInsights({ loadSource: async () => saved, history: async () => buildClinicalTreatmentHistory({}), evidence: async () => ({}), audit: async () => {} })(req, { agencyId: 2, noteId: 40 });
    expect(result.sourceRevision).toMatchObject({ id: 81, number: 2, contentHash: 'approved-hash', pendingAmendment: true });
    expect(result.quickLook.sections.at(-1)).toMatchObject({ key: 'entry:8', label: 'Amendment / correction', text: 'Corrected the documented duration.' });
  });
  it('does not present a history or attachment outage as an empty successful check', async () => {
    const fail = async () => { throw new Error('unavailable'); };
    const result = await createClinicalNoteReviewInsights({ loadSource: async () => source, history: fail, evidence: fail, audit: async () => {} })(req, { agencyId: 2, noteId: 40 });
    expect(result.treatmentHistory.status).toBe('unavailable'); expect(result.quickLook.artifactsStatus).toBe('unavailable');
    expect(result.quickLook.sections).toHaveLength(2);
  });
  it('requires canonical note IDs', async () => {
    const load = vi.fn();
    for (const noteId of ['01', '1e0', '0x1', '-1', '1/2', '9007199254740993']) await expect(createClinicalNoteReviewInsights({ loadSource: load })(req, { agencyId: 2, noteId })).rejects.toMatchObject({ status: 400 });
    expect(load).not.toHaveBeenCalled();
  });
});

describe('bounded exact-scope history queries', () => {
  const source = { agencyId: 2, client: { id: 11 }, provider: { id: 7 }, source: { clinical_session_id: 5 }, session: { provider_user_id: 7 } };
  it('anchors to the exact client/agency/provider and never silently broadens an unavailable anchor', async () => {
    const db = { execute: vi.fn().mockResolvedValue([[]]) }, mainDb = { execute: vi.fn() };
    const result = await loadClinicalTreatmentHistory(source, { clinicalDb: db, mainDb });
    expect(db.execute).toHaveBeenCalledOnce(); expect(db.execute.mock.calls[0][1]).toEqual([5, 2, 11, 7]);
    expect(mainDb.execute).not.toHaveBeenCalled(); expect(result.status).toBe('no_sessions');
  });
  it('rejects oversized or malformed report session selection', async () => {
    for (const selectedSessionIds of [[], [1, 2, 3, 4, 5, 6], ['bad'], [0]]) await expect(loadClinicalTreatmentHistory(source, { selectedSessionIds })).rejects.toMatchObject({ status: 400 });
  });
  it('makes an excluded cross-provider sample explicit and bounds objective definitions to the historical encounter', async () => {
    const db = { execute: vi.fn().mockResolvedValueOnce([[{ id: 5, scheduled_start_at: sessions[4].scheduled_start_at }]])
      .mockResolvedValueOnce([[sessions[4], sessions[3]]]).mockResolvedValueOnce([[objective]])
      .mockResolvedValueOnce([[]]).mockResolvedValueOnce([[]]) }, mainDb = { execute: vi.fn().mockResolvedValue([[]]) };
    const result = await loadClinicalTreatmentHistory(source, { clinicalDb: db, mainDb, selectedSessionIds: [3, 4, 5] });
    expect(result.status).toBe('partial');
    expect(result.selectionCoverage).toMatchObject({ requestedCount: 3, includedCount: 2, excludedCount: 1, complete: false });
    expect(result.selectionCoverage.reason).toContain('full sample was not compared');
    expect(db.execute.mock.calls[2][1].at(-1)).toBe(sessions[4].scheduled_end_at);
    expect(db.execute.mock.calls[1][0]).toContain('s.provider_user_id=?');
  });
  it('does not call a missing selected anchor a completed sample comparison', async () => {
    const result = await loadClinicalTreatmentHistory(source, { clinicalDb: { execute: vi.fn().mockResolvedValue([[]]) }, selectedSessionIds: [3, 4, 5] });
    expect(result).toMatchObject({ status: 'insufficient', selectionCoverage: { requestedCount: 3, includedCount: 0, excludedCount: 3, complete: false } });
  });
  it('keeps failed longitudinal history explicitly unavailable and non-gating', async () => {
    const result = await loadNarrivaLongitudinalAdvisory(source, { clinicalDb: { execute: async () => { throw new Error('DB unavailable'); } } });
    expect(result).toMatchObject({ status: 'unavailable', advisories: [], affectsQuickSign: false });
  });
});
