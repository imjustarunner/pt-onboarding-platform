import { beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('../../config/database.js', () => ({ default: {} }));
vi.mock('../../models/Client.model.js', () => ({ default: {} }));
vi.mock('../../models/Agency.model.js', () => ({ default: {} }));
vi.mock('../../models/User.model.js', () => ({ default: {} }));
vi.mock('../../models/TutoringSessionLearning.model.js', () => ({ TutoringSessionNote: {} }));
vi.mock('../clinicalRecordPdf.service.js', () => ({ generateClinicalRecordPdf: vi.fn() }));
vi.mock('../clinicalSessionAudit.service.js', () => ({ clinicalAudit: vi.fn() }));
vi.mock('../recordClientIdentity.service.js', () => ({ recordClientDemographics: vi.fn(), recordClientGuardians: vi.fn() }));
import { tutoringSessionPdf } from '../tutoringSessionPdf.service.js';
let deps, note, session;
const req = { user: { id: 100 } };
beforeEach(() => {
 note = { id: 5, session_id: 1001, client_id: 90004, agency_id: 90002, summary: 'Compare decimals: 3/4; move forward.', session_type: 'virtual', saved_at: '2026-11-18 23:20:00', saved_by_user_id: 100,
  metadata_json: { planChecklist: { planTitle: 'Approved mathematics plan' }, documentationHistory: [{ savedAt: '2026-11-18 23:10:00', savedByUserId: 100, summary: 'Earlier recorded results' }] } };
 session = { id: 1001, organization_id: 90002, provider_user_id: 100, starts_at: '2026-11-18 22:30:00', ends_at: '2026-11-18 23:15:00', actual_started_at: '2026-11-18 22:31:00', actual_ended_at: '2026-11-18 23:12:00' };
 deps = { db: { execute: vi.fn(async () => [[session]]) }, notes: { findBySession: vi.fn(async () => note) }, clients: { findById: vi.fn(async () => ({ id: 90004, full_name: 'Example Student', date_of_birth: '2015-06-10' })) }, agencies: { findById: vi.fn(async () => ({ id: 90002, name: 'Next Level Up', timezone: 'America/Denver' })) }, users: { findById: vi.fn(async () => ({ first_name: 'Example', last_name: 'Tutor' })) }, render: vi.fn(async () => Buffer.from('synthetic-pdf')), audit: vi.fn(), recordDemographics: vi.fn(async () => ({})), recordGuardians: vi.fn(async () => [{ name: 'Example Parent' }]) };
});
describe('saved tutoring-record PDF', () => {
 it('exports the actual saved summary, student identity, assigned tutor, local times and earlier versions', async () => {
  const result = await tutoringSessionPdf(req, 1001, deps);
  expect(result.filename).toBe('tutoring-session-1001.pdf');
  const input = deps.render.mock.calls[0][0];
  expect(input).toMatchObject({ recordType: 'tutoring', singleDocument: true, agency: { name: 'Next Level Up' }, client: { recordGuardians: [{ name: 'Example Parent' }] } });
  expect(input.notes[0]).toMatchObject({ note: { note_payload: { sections: { 'Session summary': note.summary } }, metadata_json: { dateOfService: '2026-11-18', sessionContext: { startTimeLocal: '15:31', endTimeLocal: '16:12', durationMinutes: 41, participants: { student: 'Example Student', assignedTutor: 'Example Tutor' } } } }, addenda: [{ body: { summary: 'Earlier recorded results' } }] });
  expect(input.notes[0].note).not.toHaveProperty('provider_signed_at');
  expect(deps.audit.mock.calls[0][0].req).toBe(req);
 });
 it('labels scheduled times when no actual duration was recorded', async () => {
  session.actual_started_at = null; session.actual_ended_at = null;
  await tutoringSessionPdf(req, 1001, deps);
  expect(deps.render.mock.calls[0][0].notes[0].note.metadata_json.structuredChart.sessionTiming).toContain('actual duration not recorded');
 });
 it('refuses a mismatched roster or organization before reading student demographics', async () => {
  session.organization_id = 999;
  await expect(tutoringSessionPdf(req, 1001, deps)).rejects.toMatchObject({ status: 409 });
  expect(deps.clients.findById).not.toHaveBeenCalled();
  deps.db.execute.mockResolvedValue([[]]);
  await expect(tutoringSessionPdf(req, 1001, deps)).rejects.toMatchObject({ status: 409 });
 });
 it('requires a saved note and preserves legacy entered fields without adding filler', async () => {
  deps.notes.findBySession.mockResolvedValueOnce(null);
  await expect(tutoringSessionPdf(req, 1001, deps)).rejects.toMatchObject({ status: 404 });
  note.metadata_json = {}; note.strengths_observed = 'Recorded strength'; note.challenges_observed = '';
  await tutoringSessionPdf(req, 1001, deps);
  expect(deps.render.mock.calls[0][0].notes[0].note.note_payload.sections).toEqual({ 'Session summary': note.summary, 'Strengths observed': 'Recorded strength' });
 });
 it('keeps incomplete actual timing separate from the scheduled time range', async () => {
  session.actual_ended_at = null;
  await tutoringSessionPdf(req, 1001, deps);
  const metadata = deps.render.mock.calls[0][0].notes[0].note.metadata_json;
  expect(metadata.sessionContext).toMatchObject({ startTimeLocal: '15:30', endTimeLocal: '16:15', durationMinutes: null });
  expect(metadata.structuredChart.recordedActualStart).toBe('2026-11-18T22:31:00.000Z');
 });

});
