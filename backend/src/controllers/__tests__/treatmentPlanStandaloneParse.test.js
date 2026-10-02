import { beforeEach, it, expect, vi } from 'vitest';
import { parseTreatmentPlanImport } from '../medicalBilling.controller.js';
import ClinicalEligibilityService from '../../services/clinicalEligibility.service.js';

vi.mock('../../config/database.js', () => ({ default: { execute: vi.fn() }, onTableWrite: vi.fn() }));
vi.mock('../../config/clinicalDatabase.js', () => ({ default: { execute: vi.fn() } }));
vi.mock('../../services/clinicalEligibility.service.js', () => ({ default: { ensureAgencyAccess: vi.fn() } }));

let res, next;
beforeEach(() => {
  vi.resetAllMocks();
  res = { status: vi.fn().mockReturnThis(), json: vi.fn() };
  next = vi.fn();
});
const request = (body) => ({ user: { id: 21, role: 'provider' }, body: { text: 'Goal 1: Improve coping.\nObjective 1.1: Practice a coping skill.', ...body } });

it.each([undefined, 12])('parses without chart persistence for client %s after checking agency access', async (clientId) => {
  const req = request({ agencyId: 7, ...(clientId ? { clientId } : {}) });
  await parseTreatmentPlanImport(req, res, next);
  expect(next).not.toHaveBeenCalled();
  expect(ClinicalEligibilityService.ensureAgencyAccess).toHaveBeenCalledWith({ reqUser: req.user, agencyId: 7 });
  expect(res.json).toHaveBeenCalledWith({ parsed: expect.objectContaining({ goals: [expect.objectContaining({ goalText: 'Improve coping.' })] }) });
});

it('still requires an agency', async () => {
  await parseTreatmentPlanImport(request({}), res, next);
  expect(res.status).toHaveBeenCalledWith(400);
  expect(ClinicalEligibilityService.ensureAgencyAccess).not.toHaveBeenCalled();
});

it('rejects a user outside the agency', async () => {
  const error = Object.assign(new Error('Access denied'), { status: 403 });
  ClinicalEligibilityService.ensureAgencyAccess.mockRejectedValueOnce(error);
  await parseTreatmentPlanImport(request({ agencyId: 8 }), res, next);
  expect(next).toHaveBeenCalledWith(error);
  expect(res.json).not.toHaveBeenCalled();
});
