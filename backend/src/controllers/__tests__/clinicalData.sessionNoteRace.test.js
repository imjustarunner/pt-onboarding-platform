import { beforeEach, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({
  alerts: vi.fn(), session: vi.fn(), execute: vi.fn(), txExecute: vi.fn(),
  begin: vi.fn(), commit: vi.fn(), rollback: vi.fn(), release: vi.fn(),
  ref: vi.fn(), diagnosis: vi.fn(), attachDiagnosis: vi.fn(), audit: vi.fn(),
  questionnaire: vi.fn(), tasks: vi.fn(), ratings: vi.fn()
}));
vi.mock('../../config/clinicalDatabase.js', () => ({ default: {
  execute: m.execute,
  getConnection: async () => ({ execute: m.txExecute, beginTransaction: m.begin,
    commit: m.commit, rollback: m.rollback, release: m.release })
} }));
vi.mock('../../config/database.js', () => ({ default: { execute: vi.fn() } }));
vi.mock('express-validator', () => ({ validationResult: () => ({ isEmpty: () => true }) }));
vi.mock('../../services/clinicalAppointmentAlerts.service.js', () => ({ default: { assertReviewed: m.alerts } }));
vi.mock('../../services/clinicalNoteSigningToken.service.js', () => ({ withClinicalSigningToken: async note => note }));
vi.mock('../../services/schedulingBillingAccess.service.js', () => ({ hasSchedulingBillingAccess: () => false, schedulingResponseForUser: x => x }));
vi.mock('../../models/AdminAuditLog.model.js', () => ({ default: { logAction: m.audit } }));
vi.mock('../../models/User.model.js', () => ({ default: { getAgencies: async () => [] } }));
vi.mock('../../services/clientAccessLog.service.js', () => ({ logClientAccess: vi.fn() }));
vi.mock('../../models/ClinicalRecordRef.model.js', () => ({ default: { upsert: m.ref } }));
vi.mock('../../models/clinical/ClinicalSession.model.js', () => ({ default: { findById: m.session } }));
vi.mock('../../models/clinical/ClinicalClaim.model.js', () => ({ default: {} }));
vi.mock('../../models/clinical/ClinicalDocument.model.js', () => ({ default: {} }));
vi.mock('../../services/clinicalEligibility.service.js', () => ({ default: {
  ensureAgencyAccess: vi.fn(), assertAgencyHasClinicalOrg: vi.fn(), assertSessionNoteEligible: vi.fn()
} }));
vi.mock('../../models/SupervisorAssignment.model.js', () => ({ default: {} }));
vi.mock('../../services/clinicalNoteCrypto.service.js', () => ({ maybeEncryptNotePayload: value => value }));
vi.mock('../../services/clinicalDiagnosisAttach.service.js', () => ({
  getPrimaryClinicalDiagnosis: m.diagnosis, attachDiagnosisToClinicalNote: m.attachDiagnosis
}));
vi.mock('../../services/clinicalNoteContentReview.service.js', () => ({
  evaluateNoteContentReview: () => ({ status: 'passed', source: 'manual' }),
  shouldSkipSupervisorCosign: () => true, isReviewOnlyNoteType: () => false
}));
vi.mock('../../services/noteAidQuestionnaireContext.service.js', () => ({ markQuestionnairesAttached: m.questionnaire }));
vi.mock('../../services/sessionDocumentationTask.service.js', () => ({ completeSessionNoteTasksForSession: m.tasks }));
vi.mock('../../models/clinical/ClinicalTreatmentObjectiveRating.model.js', () => ({ default: { linkToClinicalNote: m.ratings } }));

// Keep the real ClinicalNote model: the test must prove writes use the locked
// encounter's transaction, rather than only checking controller mock arguments.
import { createSessionNote } from '../clinicalData.controller.js';

const originalSession = { id: 20, agency_id: 2, client_id: 10, provider_user_id: 7,
  office_event_id: 30, service_code: '90837', metadata_json: '{}' };
let currentSession, storedNote, attachedDraft, timeline;
const request = () => ({ params: { sessionId: '20' }, user: { id: 7, role: 'provider' },
  body: { title: 'Session note', notePayload: 'Clinician-authored session content.',
    noteType: 'progress', serviceCode: '90837', metadata: { draftId: 55 } } });
const response = () => ({ status: vi.fn().mockReturnThis(), json: vi.fn() });
const invoke = async (req = request()) => { const res = response(), next = vi.fn(); await createSessionNote(req, res, next); return { req, res, next }; };

beforeEach(() => {
  vi.clearAllMocks();
  currentSession = { ...originalSession }; storedNote = null; attachedDraft = null; timeline = [];
  m.session.mockImplementation(async () => ({ ...originalSession }));
  m.alerts.mockResolvedValue(undefined);
  m.begin.mockImplementation(async () => { timeline.push('begin'); });
  m.commit.mockImplementation(async () => { timeline.push('commit'); });
  m.ref.mockImplementation(async () => { timeline.push('external-ref'); });
  m.diagnosis.mockResolvedValue({ id: 3 });
  m.txExecute.mockImplementation(async (sql, args) => {
    if (sql.includes('FROM clinical_sessions')) { timeline.push('session-lock'); return [[{ ...currentSession }]]; }
    if (sql.includes('JSON_EXTRACT')) { timeline.push('draft-lock'); return [[attachedDraft].filter(Boolean)]; }
    if (sql.startsWith('INSERT INTO clinical_notes')) {
      timeline.push('insert');
      storedNote = { id: 100, clinical_session_id: args[0], agency_id: args[1], client_id: args[2],
        title: args[3], note_payload: args[4], metadata_json: args[5], created_by_user_id: args[6] };
      return [{ insertId: 100, affectedRows: 1 }];
    }
    if (sql.startsWith('UPDATE clinical_notes')) { timeline.push('update'); storedNote = { ...attachedDraft, title: args[0], note_payload: args[1], metadata_json: args[2] }; return [{ affectedRows: 1 }]; }
    if (sql.includes('FROM clinical_notes')) return [[storedNote || attachedDraft].filter(Boolean)];
    throw new Error(`Unexpected transaction SQL: ${sql}`);
  });
  m.execute.mockImplementation(async sql => sql.trim().startsWith('SELECT') ? [[storedNote || attachedDraft].filter(Boolean)] : [{ affectedRows: 1 }]);
});

describe('encounter-locked session note attachment', () => {
  it('rejects a pending service change that appears after the initial session check', async () => {
    m.alerts.mockImplementation(async () => { currentSession.metadata_json = JSON.stringify({ serviceCodeChangePending: { targetCode: 'H2011' } }); });
    const { next } = await invoke();
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ status: 409, code: 'CLINICAL_SERVICE_CHANGE_PENDING' }));
    expect(timeline).toEqual(['begin', 'session-lock']);
    expect(m.rollback).toHaveBeenCalledOnce(); expect(m.commit).not.toHaveBeenCalled(); expect(m.release).toHaveBeenCalledOnce();
    expect(m.execute).not.toHaveBeenCalled(); expect(m.ref).not.toHaveBeenCalled();
  });

  it('rejects an already completed service change before saving the old service narrative', async () => {
    m.alerts.mockImplementation(async () => { currentSession.service_code = 'H2011'; });
    const { next } = await invoke();
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ status: 409, code: 'CLINICAL_SERVICE_CHANGED' }));
    expect(timeline).toEqual(['begin', 'session-lock']); expect(m.rollback).toHaveBeenCalledOnce();
  });

  it.each(['agency_id', 'client_id', 'provider_user_id'])('rejects a current %s change while awaiting the lock', async field => {
    m.alerts.mockImplementation(async () => { currentSession[field] += 1; });
    const { next } = await invoke();
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ status: 409 }));
    expect(timeline).toEqual(['begin', 'session-lock']); expect(m.rollback).toHaveBeenCalledOnce();
  });

  it('holds the session lock across real draft lookup and insertion, then commits before external references', async () => {
    const { next, res } = await invoke();
    expect(next).not.toHaveBeenCalled(); expect(res.status).toHaveBeenCalledWith(201);
    expect(timeline).toEqual(['begin', 'session-lock', 'draft-lock', 'insert', 'commit', 'external-ref']);
    expect(m.txExecute.mock.calls.find(([sql]) => sql.includes('JSON_EXTRACT'))[0]).toMatch(/FOR UPDATE$/);
    expect(m.execute.mock.calls.some(([sql]) => sql.startsWith('INSERT'))).toBe(false);
    expect(m.rollback).not.toHaveBeenCalled(); expect(m.release).toHaveBeenCalledOnce();
  });

  it('updates an existing unsigned draft using the same locked encounter transaction', async () => {
    attachedDraft = { id: 100, clinical_session_id: 20, agency_id: 2, client_id: 10, created_by_user_id: 7 };
    const { next } = await invoke();
    expect(next).not.toHaveBeenCalled();
    expect(timeline).toEqual(['begin', 'session-lock', 'draft-lock', 'update', 'commit', 'external-ref']);
    expect(m.txExecute.mock.calls.find(([sql]) => sql.startsWith('UPDATE'))[0]).toContain('provider_signed_at IS NULL');
  });

  it('leaves a signed draft untouched on a retry and closes the transaction', async () => {
    attachedDraft = { id: 100, clinical_session_id: 20, agency_id: 2, client_id: 10,
      created_by_user_id: 7, provider_signed_at: '2026-11-06', note_payload: 'Signed original.' };
    const { next, res } = await invoke();
    expect(next).not.toHaveBeenCalled(); expect(res.json).toHaveBeenCalledWith({ ok: true, note: attachedDraft });
    expect(timeline).toEqual(['begin', 'session-lock', 'draft-lock', 'commit']);
    expect(m.execute).not.toHaveBeenCalled(); expect(m.ref).not.toHaveBeenCalled(); expect(m.release).toHaveBeenCalledOnce();
  });

  it('cannot reuse a matching draft that was attached to another encounter', async () => {
    attachedDraft = { id: 100, clinical_session_id: 21, agency_id: 2, client_id: 10, created_by_user_id: 7 };
    const { next } = await invoke();
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ status: 409 }));
    expect(timeline).toEqual(['begin', 'session-lock', 'draft-lock']); expect(m.rollback).toHaveBeenCalledOnce();
  });

  it('propagates a transaction draft lookup failure instead of falling through to insertion', async () => {
    const original = m.txExecute.getMockImplementation();
    m.txExecute.mockImplementation(async (sql, args) => { if (sql.includes('JSON_EXTRACT')) throw Object.assign(new Error('Deadlock'), { code: 'ER_LOCK_DEADLOCK' }); return original(sql, args); });
    const { next } = await invoke();
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ code: 'ER_LOCK_DEADLOCK' }));
    expect(timeline).toEqual(['begin', 'session-lock']); expect(m.rollback).toHaveBeenCalledOnce();
    expect(storedNote).toBeNull();
  });
});
