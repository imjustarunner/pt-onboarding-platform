import { beforeEach, expect, it, vi } from 'vitest';
vi.mock('../../config/database.js', () => ({ default: { execute: vi.fn() }, onTableWrite: vi.fn() }));
vi.mock('../../models/IntakeLink.model.js', () => ({ default: { findByPublicKey: vi.fn(), findById: vi.fn() } }));
vi.mock('../../models/IntakeSubmission.model.js', () => ({ default: { findBySessionToken: vi.fn(), updateById: vi.fn(), create: vi.fn() } }));
vi.mock('../../models/ClientSchoolRoiSigningLink.model.js', () => ({ default: { findByPublicKey: vi.fn(), markStarted: vi.fn() } }));
vi.mock('../../models/Client.model.js', () => ({ default: { findById: vi.fn() } }));
vi.mock('../../services/issuedRoiGuardian.service.js', () => ({ portalGuardianForIssuedRoi: vi.fn(), resolveIssuedRoiConsentSigner: vi.fn() }));
vi.mock('../../services/clientRenewal.service.js', () => ({ findRenewalByPacketPublicKey: vi.fn(), findRenewalByDisclosurePublicKey: vi.fn() }));
import IntakeLink from '../../models/IntakeLink.model.js';
import pool from '../../config/database.js';
import IntakeSubmission from '../../models/IntakeSubmission.model.js';
import ClientSchoolRoiSigningLink from '../../models/ClientSchoolRoiSigningLink.model.js';
import Client from '../../models/Client.model.js';
import { portalGuardianForIssuedRoi } from '../../services/issuedRoiGuardian.service.js';
import { createPublicConsent } from '../publicIntake.controller.js';
let req, res, next, submission;
beforeEach(() => {
  vi.resetAllMocks();
  pool.execute.mockResolvedValue([[]]);
  IntakeLink.findByPublicKey.mockResolvedValue({ id: 20, is_active: 1, form_type: 'intake', scope_type: 'agency', organization_id: 450 });
  submission = { id: 10, intake_link_id: 20, status: 'started' };
  IntakeSubmission.findBySessionToken.mockImplementation(async token => token === 'started-session' ? submission : null);
  IntakeSubmission.updateById.mockResolvedValue({ id: 10 });
  req = { params: { publicKey: 'synthetic-link' }, headers: {}, get: () => 'test', body: {
    sessionToken: 'started-session', signerName: 'QA Person', signerEmail: 'qa@example.test'
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
  expect(IntakeSubmission.updateById).toHaveBeenCalledWith(10, expect.objectContaining({ status: 'consented', session_token: 'started-session' }));
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

it('starts an issued school release through the actual controller and binds the signed-in guardian', async () => {
  IntakeLink.findByPublicKey.mockResolvedValue(null);
  IntakeLink.findById.mockResolvedValue({ id: 20, is_active: 1, form_type: 'smart_school_roi', scope_type: 'agency', organization_id: 450 });
  ClientSchoolRoiSigningLink.findByPublicKey.mockResolvedValue({ id: 8, intake_link_id: 20, client_id: 928 });
  Client.findById.mockResolvedValue({ id: 928, agency_id: 450 });
  portalGuardianForIssuedRoi.mockResolvedValue(77);

  await createPublicConsent(req, res, next);

  expect(next).not.toHaveBeenCalled();
  expect(portalGuardianForIssuedRoi).toHaveBeenCalledWith(req, 928);
  expect(IntakeSubmission.updateById).toHaveBeenCalledWith(10, expect.objectContaining({ status: 'consented', client_id: 928, guardian_user_id: 77 }));
  expect(ClientSchoolRoiSigningLink.markStarted).toHaveBeenCalledWith({ id: 8, intakeSubmissionId: 10 });
  expect(res.status).toHaveBeenCalledWith(201);
});
