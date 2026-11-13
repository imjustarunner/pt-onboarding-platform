import { beforeEach, expect, it, vi } from 'vitest';
vi.mock('../../config/database.js', () => ({ default: { execute: vi.fn() }, onTableWrite: vi.fn() }));
vi.mock('../../models/IntakeLink.model.js', () => ({ default: { findByPublicKey: vi.fn(), findById: vi.fn() } }));
vi.mock('../../models/IntakeSubmission.model.js', () => ({ default: { findById: vi.fn(), findBySessionToken: vi.fn(), updateById: vi.fn(), create: vi.fn() } }));
vi.mock('../../models/ClientSchoolRoiSigningLink.model.js', () => ({ default: { findByPublicKey: vi.fn(), markStarted: vi.fn(), updatePayload: vi.fn() } }));
vi.mock('../../models/Client.model.js', () => ({ default: { findById: vi.fn() } }));
vi.mock('../../services/issuedRoiGuardian.service.js', async importOriginal => ({
  ...(await importOriginal()), portalGuardianForIssuedRoi: vi.fn(), resolveIssuedRoiConsentSigner: vi.fn()
}));
vi.mock('../../services/smartSchoolRoi.service.js', async importOriginal => ({
  ...(await importOriginal()), buildSmartSchoolRoiContext: vi.fn(async () => ({ school: { name: 'QA School' } }))
}));
vi.mock('../../services/clientRenewal.service.js', () => ({ findRenewalByPacketPublicKey: vi.fn(), findRenewalByDisclosurePublicKey: vi.fn() }));
import IntakeLink from '../../models/IntakeLink.model.js';
import pool from '../../config/database.js';
import IntakeSubmission from '../../models/IntakeSubmission.model.js';
import ClientSchoolRoiSigningLink from '../../models/ClientSchoolRoiSigningLink.model.js';
import Client from '../../models/Client.model.js';
import { resolveIssuedRoiConsentSigner } from '../../services/issuedRoiGuardian.service.js';
import { createPublicConsent, createPublicIntakeSession, finalizePublicIntake, savePublicIntakeProgress, getPublicIntakeProgress } from '../publicIntake.controller.js';
let req, res, next, submission;
beforeEach(() => {
  vi.resetAllMocks();
  pool.execute.mockResolvedValue([[]]);
  IntakeLink.findByPublicKey.mockResolvedValue({ id: 20, is_active: 1, form_type: 'intake', scope_type: 'agency', organization_id: 450 });
  submission = { id: 10, intake_link_id: 20, status: 'started' };
  IntakeSubmission.findBySessionToken.mockImplementation(async token => token === 'started-session-123456789' ? submission : null);
  IntakeSubmission.findById.mockImplementation(async () => submission);
  IntakeSubmission.updateById.mockResolvedValue({ id: 10 });
  req = { params: { publicKey: 'synthetic-link' }, headers: {}, get: () => 'test', body: {
    sessionToken: 'started-session-123456789', signerName: 'QA Person', signerEmail: 'qa@example.test'
  } };
  res = { status: vi.fn().mockReturnThis(), json: vi.fn() }; next = vi.fn();
});
it.each([undefined, '', 'invented-token'])('cannot create a submission through consent with token %s', async token => {
  req.body.sessionToken = token;
  await createPublicConsent(req, res, next);
  expect(next).not.toHaveBeenCalled();
  expect(res.status).toHaveBeenCalledWith(400);
  expect(IntakeSubmission.create).not.toHaveBeenCalled();
  expect(IntakeSubmission.updateById).not.toHaveBeenCalled();
});
it('rejects a real token from another packet', async () => {
  submission.intake_link_id = 99;
  await createPublicConsent(req, res, next);
  expect(res.status).toHaveBeenCalledWith(403);
  expect(IntakeSubmission.updateById).not.toHaveBeenCalled();
});
it('reuses the started submission on repeated consent without creating another intake', async () => {
  await createPublicConsent(req, res, next);
  await createPublicConsent(req, res, next);
  expect(next).not.toHaveBeenCalled();
  expect(IntakeSubmission.updateById).toHaveBeenCalledTimes(2);
  expect(IntakeSubmission.updateById).toHaveBeenCalledWith(10, expect.objectContaining({ status: 'consented', session_token: 'started-session-123456789' }));
  expect(IntakeSubmission.create).not.toHaveBeenCalled();
});
it('returns a completed session without creating or changing records', async () => {
  submission.status = 'submitted';
  await createPublicConsent(req, res, next);
  expect(next).not.toHaveBeenCalled();
  expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ alreadyCompleted: true }));
  expect(IntakeSubmission.create).not.toHaveBeenCalled();
  expect(IntakeSubmission.updateById).not.toHaveBeenCalled();
});

function assignedRelease() {
  IntakeLink.findByPublicKey.mockResolvedValue(null);
  IntakeLink.findById.mockResolvedValue({ id: 20, is_active: 1, form_type: 'smart_school_roi', scope_type: 'agency', organization_id: 450 });
  const issued = { id: 8, intake_link_id: 20, client_id: 928, recipient_guardian_user_id: 77, latest_intake_submission_id: 10, status: 'in_progress' };
  ClientSchoolRoiSigningLink.findByPublicKey.mockResolvedValue(issued);
  Client.findById.mockResolvedValue({ id: 928, agency_id: 450 });
  resolveIssuedRoiConsentSigner.mockResolvedValue(77);
  ClientSchoolRoiSigningLink.markStarted.mockImplementation(async args => Object.assign(issued, { status: 'in_progress', latest_intake_submission_id: args.intakeSubmissionId }));
  ClientSchoolRoiSigningLink.updatePayload.mockImplementation(async () => issued);
  Object.assign(submission, { client_id: 928, guardian_user_id: 77, session_token: req.body.sessionToken, created_at: new Date() });
  return issued;
}

it('advances only the issued child’s actual started session for the signed-in guardian', async () => {
  assignedRelease();

  await createPublicConsent(req, res, next);

  expect(next).not.toHaveBeenCalled();
  expect(resolveIssuedRoiConsentSigner).toHaveBeenCalledWith(expect.objectContaining({ req, clientId: 928 }));
  expect(IntakeSubmission.updateById).toHaveBeenCalledWith(10, expect.objectContaining({ status: 'consented', client_id: 928, guardian_user_id: 77 }));
  expect(ClientSchoolRoiSigningLink.markStarted).toHaveBeenCalledWith({ id: 8, intakeSubmissionId: 10 });
  expect(res.status).toHaveBeenCalledWith(201);
});

it('starts a real issued session bound to both the requested child and assigned guardian', async () => {
  const issued = assignedRelease(); issued.latest_intake_submission_id = null;
  IntakeSubmission.create.mockImplementation(async args => ({ id: 11, session_token: args.sessionToken }));
  await createPublicIntakeSession(req, res, next);
  expect(next).not.toHaveBeenCalled();
  expect(IntakeSubmission.create).toHaveBeenCalledWith(expect.objectContaining({ clientId: 928, guardianUserId: 77, status: 'started' }));
  const token = IntakeSubmission.create.mock.calls[0][0].sessionToken;
  expect(token).toMatch(/^[a-f0-9]{36}$/);
  expect(ClientSchoolRoiSigningLink.markStarted).toHaveBeenCalledWith({ id: 8, intakeSubmissionId: 11 });
  expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ sessionToken: token, submissionId: 11 }));
});

it('resumes only the authenticated recipient’s exact current session without overwriting answers', async () => {
  assignedRelease(); submission.status = 'consented';
  submission.intake_data = { savedOwnAnswers: true };
  await createPublicIntakeSession(req, res, next);
  expect(next).not.toHaveBeenCalled();
  expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ sessionToken: req.body.sessionToken, submissionId: 10, resumed: true }));
  expect(IntakeSubmission.create).not.toHaveBeenCalled();
  expect(IntakeSubmission.updateById).not.toHaveBeenCalled();
  expect(ClientSchoolRoiSigningLink.markStarted).not.toHaveBeenCalled();
  expect(ClientSchoolRoiSigningLink.updatePayload).not.toHaveBeenCalled();
});

it('does not create or expose a session to the wrong guardian', async () => {
  assignedRelease();
  resolveIssuedRoiConsentSigner.mockRejectedValue(Object.assign(new Error('Wrong guardian'), { status: 403 }));
  await createPublicIntakeSession(req, res, next);
  expect(next).toHaveBeenCalledWith(expect.objectContaining({ status: 403 }));
  expect(IntakeSubmission.findById).not.toHaveBeenCalled();
  expect(IntakeSubmission.create).not.toHaveBeenCalled();
  expect(res.json).not.toHaveBeenCalled();
});

it('never starts a new session for a completed issued request', async () => {
  const issued = assignedRelease(); issued.status = 'completed';
  await createPublicIntakeSession(req, res, next);
  expect(res.status).toHaveBeenCalledWith(409);
  expect(IntakeSubmission.create).not.toHaveBeenCalled();
  expect(ClientSchoolRoiSigningLink.updatePayload).not.toHaveBeenCalled();
});

it('does not disclose or reuse another child’s stored current token on start', async () => {
  assignedRelease(); submission.client_id = 929;
  IntakeSubmission.create.mockImplementation(async args => ({ id: 11, session_token: args.sessionToken }));
  await createPublicIntakeSession(req, res, next);
  expect(next).not.toHaveBeenCalled();
  expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ submissionId: 11 }));
  expect(res.json.mock.calls[0][0].sessionToken).not.toBe(submission.session_token);
  expect(IntakeSubmission.create).toHaveBeenCalledWith(expect.objectContaining({ clientId: 928, guardianUserId: 77 }));
});

it('does not overwrite a release completed while its new session was being started', async () => {
  const issued = assignedRelease(); issued.latest_intake_submission_id = null;
  IntakeSubmission.create.mockResolvedValue({ id: 11 });
  ClientSchoolRoiSigningLink.markStarted.mockResolvedValue({ ...issued, status: 'completed', latest_intake_submission_id: 10 });
  await createPublicIntakeSession(req, res, next);
  expect(next).not.toHaveBeenCalled();
  expect(res.status).toHaveBeenCalledWith(409);
  expect(ClientSchoolRoiSigningLink.updatePayload).not.toHaveBeenCalled();
});

it('does not expose a stale new session if completion races its guarded context save', async () => {
  const issued = assignedRelease(); issued.latest_intake_submission_id = null;
  IntakeSubmission.create.mockResolvedValue({ id: 11 });
  ClientSchoolRoiSigningLink.updatePayload.mockResolvedValue({ ...issued, status: 'completed', latest_intake_submission_id: 10 });
  await createPublicIntakeSession(req, res, next);
  expect(next).not.toHaveBeenCalled();
  expect(ClientSchoolRoiSigningLink.updatePayload).toHaveBeenCalledWith(expect.objectContaining({ expectedActiveSubmissionId: 11 }));
  expect(res.status).toHaveBeenCalledWith(409);
  expect(res.json.mock.calls[0][0]).not.toHaveProperty('sessionToken');
});

it('does not revive expired consent merely by submitting consent again', async () => {
  assignedRelease(); submission.status = 'consented';
  submission.consent_given_at = new Date(Date.now() - 25 * 60 * 60 * 1000);
  await createPublicConsent(req, res, next);
  expect(next).toHaveBeenCalledWith(expect.objectContaining({ status: 410 }));
  expect(IntakeSubmission.updateById).not.toHaveBeenCalled();
});

it('preserves an exact completed issued session on an idempotent consent retry', async () => {
  const issued = assignedRelease(); issued.status = 'completed'; submission.status = 'submitted';
  await createPublicConsent(req, res, next);
  expect(next).not.toHaveBeenCalled();
  expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ alreadyCompleted: true }));
  expect(IntakeSubmission.updateById).not.toHaveBeenCalled();
  expect(ClientSchoolRoiSigningLink.markStarted).not.toHaveBeenCalled();
});

it.each(['other child', 'other issued request', 'other guardian'])('rejects consent using %s even under the same intake template', async kind => {
  const issued = assignedRelease();
  if (kind === 'other child') submission.client_id = 929;
  if (kind === 'other guardian') submission.guardian_user_id = 78;
  if (kind === 'other issued request') issued.latest_intake_submission_id = 11;
  await createPublicConsent(req, res, next);
  expect(next).toHaveBeenCalledWith(expect.objectContaining({ status: 403 }));
  expect(IntakeSubmission.updateById).not.toHaveBeenCalled();
  expect(ClientSchoolRoiSigningLink.markStarted).not.toHaveBeenCalled();
});

it.each(['other child', 'other issued request', 'other guardian', 'invented token'])('rejects finalize using %s before any writes', async kind => {
  const issued = assignedRelease(); req.params.submissionId = '10';
  if (kind === 'other child') submission.client_id = 929;
  if (kind === 'other guardian') submission.guardian_user_id = 78;
  if (kind === 'other issued request') issued.latest_intake_submission_id = 11;
  if (kind === 'invented token') req.body.sessionToken = 'portal-928-451-not-a-real-session';
  await finalizePublicIntake(req, res, next);
  expect(next).toHaveBeenCalledWith(expect.objectContaining({ status: 403 }));
  expect(IntakeSubmission.updateById).not.toHaveBeenCalled();
  expect(ClientSchoolRoiSigningLink.markStarted).not.toHaveBeenCalled();
  expect(pool.execute.mock.calls.every(([sql]) => !/^\s*(UPDATE|INSERT|DELETE)/i.test(sql))).toBe(true);
});

for (const [label, handler] of [['read', getPublicIntakeProgress], ['save', savePublicIntakeProgress]]) {
  it.each(['other child', 'other issued request', 'other guardian'])(`rejects issued progress ${label} for %s without leaking or changing saved answers`, async kind => {
    const issued = assignedRelease();
    req.query = { sessionToken: req.body.sessionToken };
    if (kind === 'other child') submission.client_id = 929;
    if (kind === 'other guardian') resolveIssuedRoiConsentSigner.mockRejectedValue(Object.assign(new Error('Wrong guardian'), { status: 403 }));
    if (kind === 'other issued request') issued.latest_intake_submission_id = 11;
    await handler(req, res, next);
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ status: 403 }));
    expect(res.json).not.toHaveBeenCalled();
    expect(IntakeSubmission.updateById).not.toHaveBeenCalled();
  });
}

it('returns the exact guardian’s own saved progress for their current issued request', async () => {
  assignedRelease(); req.query = { sessionToken: req.body.sessionToken };
  submission.intake_data = { ownReleaseAnswers: true };
  await getPublicIntakeProgress(req, res, next);
  expect(next).not.toHaveBeenCalled();
  expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ submissionId: 10, intakeData: { ownReleaseAnswers: true } }));
  expect(IntakeSubmission.updateById).not.toHaveBeenCalled();
});
