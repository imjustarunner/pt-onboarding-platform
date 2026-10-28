import { beforeEach, expect, it, vi } from 'vitest';
const m = vi.hoisted(() => ({ execute: vi.fn() }));
vi.mock('../../config/database.js', () => ({ default: m }));
import { enrollmentReminderDeliveryGate } from '../enrollmentReminderDelivery.service.js';
const input = { templateType: 'enrollment_unfinished_reminder_24h', intakeSubmissionId: 42, agencyId: 2 };
const row = { status: 'consented', reminder_consent_status: 'agreed', session_token: 'private' };
beforeEach(() => { m.execute.mockReset(); m.execute.mockResolvedValue([[row]]); });
it.each([{ reminder_opt_out_at: new Date() }, { session_token: null }, { status: 'submitted' }, { submitted_at: new Date() }, { reminder_consent_status: 'declined' }, { draft_expires_at: '2020-01-01' }])('blocks a reminder after eligibility changes: %j', async change => {
  m.execute.mockResolvedValue([[{ ...row, ...change }]]); expect((await enrollmentReminderDeliveryGate(input)).allowed).toBe(false);
});
it('checks the referenced saved enrollment again when approving a queued reminder', async () => {
  m.execute.mockResolvedValueOnce([[{ submission_id: 42 }]]).mockResolvedValueOnce([[{ ...row, reminder_opt_out_at: new Date() }]]);
  expect((await enrollmentReminderDeliveryGate({ ...input, intakeSubmissionId: null, existingCommunicationId: 77 })).allowed).toBe(false);
  expect(m.execute.mock.calls[0][1]).toEqual([77, 2]); expect(m.execute.mock.calls[1][1]).toEqual([42, 2, 2]);
});
it('allows an eligible reminder but refuses an untraceable one', async () => {
  expect((await enrollmentReminderDeliveryGate(input)).allowed).toBe(true);
  expect((await enrollmentReminderDeliveryGate({ ...input, intakeSubmissionId: null })).allowed).toBe(false);
});
it('does not turn an explicitly requested manual recovery email into an automatic reminder', async () => {
  expect((await enrollmentReminderDeliveryGate({ ...input, templateType: 'enrollment_unfinished_reminder_manual' })).allowed).toBe(true); expect(m.execute).not.toHaveBeenCalled();
});
