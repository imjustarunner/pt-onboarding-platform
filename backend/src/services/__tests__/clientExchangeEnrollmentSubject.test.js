import { beforeEach, expect, it, vi } from 'vitest';
const m = vi.hoisted(() => ({ decrypt: vi.fn() }));
vi.mock('../intakeResponsesEncryption.service.js', () => ({ decryptIntakeSubmissionRows: m.decrypt }));
import { loadClientEnrollmentSubjects, normalizeEnrollmentSubject } from '../clientExchangeEnrollmentSubject.service.js';

beforeEach(() => vi.clearAllMocks());

it('reads explicit subjects for primary and associated sibling clients within the requested agency', async () => {
  const payload = { responses: { submission: { serviceSubject: 'dependent', privateAnswer: 'NEVER RETURN' } } };
  const db = { execute: vi.fn(async () => [[
    { id: 1435, subject_client_id: 2415, intake_data: JSON.stringify(payload) },
    { id: 1435, subject_client_id: 2416, intake_data: JSON.stringify(payload) },
    { id: 1435, subject_client_id: 9999, intake_data: JSON.stringify(payload) }
  ]]) };
  const result = await loadClientEnrollmentSubjects({ db, agencyId: 450, clientIds: [2415, 2416] });
  expect([...result]).toEqual([[2415, 'dependent'], [2416, 'dependent']]);
  expect(JSON.stringify([...result])).not.toContain('NEVER RETURN');
  expect(db.execute).toHaveBeenCalledWith(expect.stringContaining('intake_submission_clients'), [2415, 2416, 2415, 2416, 450]);
  expect(db.execute.mock.calls[0][0]).toContain('c.agency_id = ?');
  expect(db.execute.mock.calls[0][0]).toContain("s.status = 'submitted'");
});

it('decrypts stored envelopes before selecting the latest explicit subject', async () => {
  const rows = [
    { id: 3, subject_client_id: 42, payload_encrypted: 'fixture' },
    { id: 2, subject_client_id: 42, intake_data: { serviceSubject: 'self' } }
  ];
  m.decrypt.mockImplementationOnce(input => { input[0].intake_data = { submission: { serviceSubject: 'representative' } }; });
  const result = await loadClientEnrollmentSubjects({ db: { execute: async () => [rows] }, agencyId: 450, clientIds: [42] });
  expect(m.decrypt).toHaveBeenCalledWith(rows);
  expect(result.get(42)).toBe('representative');
});

it('does not turn absent, malformed, or on-behalf answers into self or child enrollment', async () => {
  const rows = [
    { subject_client_id: 1, intake_data: {} },
    { subject_client_id: 2, intake_data: '{broken' },
    { subject_client_id: 3, intake_data: { intakeForSelf: false } },
    { subject_client_id: 4, intake_data: { intakeForSelf: true } },
    { subject_client_id: 5, intake_data: { serviceSubject: 'unrecognized private text' } }
  ];
  const result = await loadClientEnrollmentSubjects({ db: { execute: async () => [rows] }, agencyId: 450, clientIds: [1, 2, 3, 4, 5] });
  expect([...result]).toEqual([[3, 'on_behalf'], [4, 'self']]);
  expect(normalizeEnrollmentSubject('child')).toBe('dependent');
  expect(normalizeEnrollmentSubject('myself')).toBe('self');
  expect(normalizeEnrollmentSubject('')).toBeNull();
});

it('does not query without a valid agency and client scope', async () => {
  const db = { execute: vi.fn() };
  expect((await loadClientEnrollmentSubjects({ db, agencyId: 0, clientIds: [1] })).size).toBe(0);
  expect((await loadClientEnrollmentSubjects({ db, agencyId: 450, clientIds: [] })).size).toBe(0);
  expect(db.execute).not.toHaveBeenCalled();
});
