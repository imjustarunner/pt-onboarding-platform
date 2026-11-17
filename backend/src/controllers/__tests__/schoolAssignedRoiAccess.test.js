import { beforeEach, expect, it, vi } from 'vitest';
const m = vi.hoisted(() => ({ client: vi.fn(), agencies: vi.fn(), staff: vi.fn(), links: vi.fn() }));
vi.mock('../../config/database.js', () => ({ default: { execute: vi.fn() } }));
vi.mock('../../models/Client.model.js', () => ({ default: { findById: m.client } }));
vi.mock('../../models/User.model.js', () => ({ default: { getAgencies: m.agencies } }));
vi.mock('../../models/ClientSchoolStaffRoiAccess.model.js', () => ({ default: { listSchoolStaffRosterForClient: m.staff }, getEffectiveSchoolStaffRoiState: vi.fn(), isRoiExpired: () => false }));
vi.mock('../../models/ClientGuardian.model.js', () => ({ default: { listForClient: vi.fn().mockResolvedValue([]) } }));
vi.mock('../../models/IntakeLink.model.js', () => ({ default: { findByScope: m.links } }));
vi.mock('../../models/SchoolRoiIntakeLinkConfig.model.js', () => ({ default: { findBySchoolOrganizationId: vi.fn().mockResolvedValue(null) } }));
vi.mock('../../models/ClientSchoolRoiSigningLink.model.js', () => ({ default: { findForClient: vi.fn().mockResolvedValue(null) } }));
vi.mock('../../services/paperPacketVision.service.js', () => ({ getLatestPaperPacketVisionEval: vi.fn().mockResolvedValue(null) }));
import { listClientSchoolRoiAccess } from '../clientSchoolRoiAccess.controller.js';
import pool from '../../config/database.js';
const response = () => ({ status: vi.fn().mockReturnThis(), json: vi.fn() });
beforeEach(() => {
  vi.clearAllMocks();
  pool.execute.mockResolvedValue([[]]);
  m.client.mockResolvedValue({ id: 7, agency_id: 2, client_type: 'clinical', organization_id: 20, organization_type: 'school', organization_name: 'Example School' });
  m.agencies.mockResolvedValue([{ id: 2 }]);
  m.staff.mockResolvedValue([]);
  m.links.mockResolvedValue([{ id: 10, is_active: true, form_type: 'smart_school_roi', title: 'School ROI' }]);
});
it.each(['admin', 'support'])('offers the school ROI to %s for a school-assigned clinical client', async role => {
  const res = response(), next = vi.fn();
  await listClientSchoolRoiAccess({ params: { id: 7 }, user: { id: 4, role } }, res, next);
  expect(next).not.toHaveBeenCalled();
  expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ school_organization_id: 20, school_roi_signing: expect.objectContaining({ selected_intake_link_id: 10 }) }));
  expect(m.staff).toHaveBeenCalledWith(expect.objectContaining({ clientId: 7, schoolOrganizationId: 20 }));
});
it('rejects a clinical client assigned to an office program', async () => {
  m.client.mockResolvedValue({ id: 7, agency_id: 2, client_type: 'clinical', organization_type: 'clinical' });
  const res = response();
  await listClientSchoolRoiAccess({ params: { id: 7 }, user: { id: 4, role: 'support' } }, res, vi.fn());
  expect(res.status).toHaveBeenCalledWith(400);
  expect(m.staff).not.toHaveBeenCalled();
});
it('retains agency authorization before exposing a school form', async () => {
  m.agencies.mockResolvedValue([{ id: 99 }]);
  const res = response();
  await listClientSchoolRoiAccess({ params: { id: 7 }, user: { id: 4, role: 'support' } }, res, vi.fn());
  expect(res.status).toHaveBeenCalledWith(403);
  expect(m.links).not.toHaveBeenCalled();
});
