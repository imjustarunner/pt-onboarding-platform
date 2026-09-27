import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../config/database.js', () => ({ default: { execute: vi.fn() }, onTableWrite: vi.fn() }));
vi.mock('../../models/IntakeLink.model.js', () => ({ default: { findByPublicKey: vi.fn() } }));
vi.mock('../../models/IntakeSubmission.model.js', () => ({ default: { findBySessionToken: vi.fn(), updateById: vi.fn() } }));
vi.mock('../../services/clientRenewal.service.js', () => ({ findRenewalByPacketPublicKey: vi.fn(), findRenewalByDisclosurePublicKey: vi.fn() }));

import IntakeLink from '../../models/IntakeLink.model.js';
import IntakeSubmission from '../../models/IntakeSubmission.model.js';
import { savePublicIntakeProgress, getPublicIntakeProgress } from '../publicIntake.controller.js';

let submission, req, res, next;
beforeEach(() => {
  vi.resetAllMocks();
  submission = { id: 10, intake_link_id: 20, status: 'started', reminder_consent_status: 'agreed', intake_data: { existing: true } };
  IntakeLink.findByPublicKey.mockResolvedValue({ id: 20 });
  IntakeSubmission.findBySessionToken.mockImplementation(async () => submission);
  IntakeSubmission.updateById.mockResolvedValue({ id: 10 });
  req = { params: { publicKey: 'synthetic-link' }, query: { sessionToken: 'session-a' }, body: {
    sessionToken: 'session-a', step: 2, intakeData: { progressSnapshot: { sessionToken: 'session-a' },
      guardian: { email: ' Parent@Example.test ', firstName: ' Parent ' } }
  } };
  res = { status: vi.fn().mockReturnThis(), json: vi.fn() };
  next = vi.fn();
});

describe('public intake progress session isolation', () => {
  it('saves the matching session and updates consented reminder contact details', async () => {
    await savePublicIntakeProgress(req, res, next);
    expect(next).not.toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith({ ok: true, submissionId: 10 });
    const update = IntakeSubmission.updateById.mock.calls[0][1];
    expect(JSON.parse(update.intake_data)).toMatchObject({ existing: true, progressStep: 2, progressSnapshot: { sessionToken: 'session-a' } });
    expect(update).toMatchObject({ signer_email: 'parent@example.test', reminder_first_name: 'Parent' });
  });

  it('rejects another session snapshot without writing anything', async () => {
    req.body.intakeData.progressSnapshot.sessionToken = 'session-b';
    await savePublicIntakeProgress(req, res, next);
    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(403);
    expect(IntakeSubmission.updateById).not.toHaveBeenCalled();
  });

  it('does not return an already stored foreign snapshot', async () => {
    submission.intake_data = { progressSnapshot: { sessionToken: 'session-b' } };
    await getPublicIntakeProgress(req, res, next);
    expect(next).not.toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ intakeData: null }));
  });

  it.each([{}, { sessionToken: 'session-a' }])('allows legacy or matching snapshots: %j', async (snapshot) => {
    submission.intake_data = { progressSnapshot: snapshot };
    await getPublicIntakeProgress(req, res, next);
    expect(next).not.toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ intakeData: submission.intake_data }));
  });

  it('does not update reminder identity without consent', async () => {
    submission.reminder_consent_status = 'declined';
    await savePublicIntakeProgress(req, res, next);
    expect(next).not.toHaveBeenCalled();
    expect(IntakeSubmission.updateById.mock.calls[0][1]).not.toHaveProperty('signer_email');
  });

  it('rejects a resume token belonging to another intake link', async () => {
    submission.intake_link_id = 99;
    await savePublicIntakeProgress(req, res, next);
    expect(res.status).toHaveBeenCalledWith(404);
    expect(IntakeSubmission.updateById).not.toHaveBeenCalled();
  });

  it('never changes a completed submission', async () => {
    submission.status = 'submitted';
    await savePublicIntakeProgress(req, res, next);
    expect(next).not.toHaveBeenCalled();
    expect(IntakeSubmission.updateById).not.toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ alreadyCompleted: true }));
  });
});
