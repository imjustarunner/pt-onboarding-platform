import { describe, it, expect, vi, beforeEach } from 'vitest';
vi.mock('../../config/clinicalDatabase.js', () => ({ default: { execute: vi.fn() } }));
vi.mock('../clinicalDiagnosisAttach.service.js', () => ({ getPrimaryClinicalDiagnosis: vi.fn() }));
import clinicalPool from '../../config/clinicalDatabase.js';
import { getPrimaryClinicalDiagnosis } from '../clinicalDiagnosisAttach.service.js';
import { evaluateClaimReadiness } from '../clinicalClaimReadiness.service.js';

let session;
let note;
const evaluate = (extra = {}) => evaluateClaimReadiness({ agencyId: 1, clientId: 2, clinicalSessionId: 3, requireSignedNote: true, ...extra });
describe('clinical claim readiness', () => {
  beforeEach(() => {
    session = { id: 3 };
    note = { id: 4, clinical_session_id: 3, provider_signed_at: '2026-09-01', is_billable: 1 };
    getPrimaryClinicalDiagnosis.mockResolvedValue({ id: 5, icd10_code: 'F41.1' });
    clinicalPool.execute.mockImplementation(async (sql, params) => {
      if (sql.includes('claim_blocked_reason FROM clinical_sessions')) return [[session].filter(Boolean)];
      if (sql.includes('FROM clinical_notes') && sql.includes('is_deleted = 0')) {
        expect(sql).toContain('agency_id = ?');
        expect(sql).toContain('client_id = ?');
        return [[note].filter(Boolean)];
      }
      if (sql.includes('LEFT JOIN clinical_diagnoses')) return [[]];
      if (sql.includes('FROM clinical_treatment_plans')) return [[{ id: 6, primary_diagnosis_id: 5 }]];
      if (sql.includes('SELECT metadata_json')) return [[{ metadata_json: { dateOfService: '2026-09-01' } }]];
      if (sql.includes('scheduled_start_at')) return [[{ scheduled_start_at: '2026-09-01 18:00:00' }]];
      throw new Error(`Unexpected query: ${sql}`);
    });
  });
  it('accepts a signed billable note with diagnosis', async () => {
    expect(await evaluate()).toMatchObject({ ready: true, noteId: 4 });
  });
  it('rejects a mismatched client/session before reading notes', async () => {
    session = null;
    expect(await evaluate()).toMatchObject({ ready: false, checks: { hasSession: false } });
  });
  it('does not silently replace a deleted or mismatched selected note', async () => {
    note = null;
    const result = await evaluate({ clinicalNoteId: 900 });
    expect(result.ready).toBe(false);
    expect(result.blockers).toContain('Selected note does not belong to this session or was deleted');
  });
  it('blocks unsigned and awaiting-supervisor notes', async () => {
    note.provider_signed_at = null;
    expect((await evaluate()).ready).toBe(false);
    note.provider_signed_at = '2026-09-01';
    note.is_billable = 0;
    expect((await evaluate()).blockers).toContain('Note requires supervisor approval or is non-billable');
  });
  it('preserves a session billing block', async () => {
    session.claim_blocked_reason = 'Duration is below the minimum';
    expect((await evaluate()).blockers).toContain('Duration is below the minimum');
  });
});
