import { beforeEach, expect, it, vi } from 'vitest';
vi.mock('../../config/database.js', () => ({ default: { execute: vi.fn(), getConnection: vi.fn() } }));
vi.mock('../../config/clinicalDatabase.js', () => ({ default: { execute: vi.fn() } }));
vi.mock('../../models/clinical/ClinicalTreatmentPlan.model.js', () => ({ default: { findById: vi.fn() } }));
vi.mock('../../models/TreatmentPlanAckLink.model.js', () => ({
  TreatmentPlanAckLink: { findById: vi.fn(), findByPublicKey: vi.fn(), listForPlan: vi.fn(), updateFields: vi.fn() },
  TreatmentPlanAckEvent: { create: vi.fn() }
}));
vi.mock('../clinicalEligibility.service.js', () => ({ default: { ensureAgencyAccess: vi.fn() } }));
vi.mock('../guardianPlanProgress.service.js', () => ({ requireGuardianPlanAccess: vi.fn(), guardianPlanRevision: () => 'current-revision', isSharedPlanStatus: status => status === 'active' }));
import clinicalPool from '../../config/clinicalDatabase.js';
import pool from '../../config/database.js';
import Plan from '../../models/clinical/ClinicalTreatmentPlan.model.js';
import { TreatmentPlanAckLink as Link } from '../../models/TreatmentPlanAckLink.model.js';
import { requireGuardianPlanAccess } from '../guardianPlanProgress.service.js';
import { signAcknowledgment, openPublicLink } from '../treatmentPlanAck.service.js';
let link, db;
beforeEach(() => {
  vi.clearAllMocks();
  db = { execute: vi.fn(async () => [[{ acquired: 1 }]]), release: vi.fn() };
  pool.getConnection.mockResolvedValue(db);
  link = { id: 1, agency_id: 2, client_id: 5, treatment_plan_id: 3, recipient_kind: 'guardian', recipient_user_id: 10, status: 'issued', dashboard_visible: true, meta_json: { planRevision: 'current-revision', portalOnly: true } };
  Link.findById.mockImplementation(async () => link); Link.findByPublicKey.mockImplementation(async () => link);
  Link.updateFields.mockImplementation(async (id, fields) => ({ ...link, status: fields.status }));
  Link.listForPlan.mockResolvedValue([link, { ...link, id: 2, recipient_user_id: 11, status: 'issued' }]);
  Plan.findById.mockResolvedValue({ id: 3, status: 'active' }); clinicalPool.execute.mockResolvedValue([{ affectedRows: 1 }]);
  requireGuardianPlanAccess.mockResolvedValue({});
});
it('one parent cannot sign the other parent’s portal request', async () => {
  await expect(signAcknowledgment({ linkId: 1, actorUserId: 11, signedByName: 'Parent Two' })).rejects.toMatchObject({ status: 403 });
  expect(Link.updateFields).not.toHaveBeenCalled();
});
it('marks the plan partially signed while another recipient still needs to sign', async () => {
  await signAcknowledgment({ linkId: 1, actorUserId: 10, signedByName: 'Parent One' });
  expect(clinicalPool.execute).toHaveBeenCalledWith(expect.stringContaining('client_ack_status'), ['partially_signed', 3]);
});
it('marks the plan signed after each current recipient has signed', async () => {
  Link.listForPlan.mockResolvedValue([link, { ...link, id: 2, recipient_user_id: 11, status: 'signed' }]);
  await signAcknowledgment({ linkId: 1, actorUserId: 10, signedByName: 'Parent One' });
  expect(clinicalPool.execute).toHaveBeenCalledWith(expect.stringContaining('client_ack_status'), ['signed', 3]);
});
it('rejects expired or superseded content before recording a signature', async () => {
  link.expires_at = '2020-01-01';
  await expect(signAcknowledgment({ linkId: 1, actorUserId: 10, signedByName: 'Parent One' })).rejects.toMatchObject({ status: 410 });
  link.expires_at = null; link.meta_json.planRevision = 'old';
  await expect(signAcknowledgment({ linkId: 1, actorUserId: 10, signedByName: 'Parent One' })).rejects.toMatchObject({ status: 409 });
  expect(Link.updateFields).not.toHaveBeenCalled();
});
it('never exposes a portal-only request through its public token', async () => {
  await expect(openPublicLink('token')).rejects.toMatchObject({ status: 401 });
  expect(Plan.findById).not.toHaveBeenCalled();
});
it('serializes signing with sharing and always releases the connection', async () => {
  await signAcknowledgment({ linkId: 1, actorUserId: 10, signedByName: 'Parent One' });
  expect(db.execute).toHaveBeenCalledWith('SELECT GET_LOCK(?, 10) AS acquired', ['guardian-plan-share:3']);
  expect(db.execute).toHaveBeenLastCalledWith('SELECT RELEASE_LOCK(?)', ['guardian-plan-share:3']);
  expect(db.release).toHaveBeenCalledOnce();
});
it('does not mark a withdrawn plan signed if it changes during the signature', async () => {
  Plan.findById.mockResolvedValueOnce({ id: 3, status: 'active' }).mockResolvedValueOnce({ id: 3, status: 'draft' });
  await signAcknowledgment({ linkId: 1, actorUserId: 10, signedByName: 'Parent One' });
  expect(Link.updateFields).toHaveBeenCalledWith(1, expect.objectContaining({ status: 'signed' }));
  expect(clinicalPool.execute).not.toHaveBeenCalled();
});
it('fails safely when publication holds the lock', async () => {
  db.execute.mockResolvedValueOnce([[{ acquired: 0 }]]);
  await expect(signAcknowledgment({ linkId: 1, actorUserId: 10, signedByName: 'Parent One' })).rejects.toMatchObject({ status: 409 });
  expect(Link.updateFields).not.toHaveBeenCalled();
  expect(db.release).toHaveBeenCalledOnce();
});
