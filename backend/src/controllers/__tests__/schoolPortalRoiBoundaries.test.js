import { beforeEach, describe, expect, it, vi } from 'vitest';
const m = vi.hoisted(() => ({ client: vi.fn(), access: vi.fn(), documents: vi.fn(), notes: vi.fn(), user: vi.fn() }));
vi.mock('../../config/database.js', () => ({ default: { execute: vi.fn(), query: vi.fn(), pool: {} } }));
vi.mock('../../models/Client.model.js', () => ({ default: { findById: m.client } }));
vi.mock('../../models/ClientPhiDocument.model.js', () => ({ default: { findByClientId: m.documents } }));
vi.mock('../../models/User.model.js', () => ({ default: { findById: m.user, getAgencies: vi.fn() } }));
vi.mock('../../models/ClientNotes.model.js', () => ({ default: { findByClientId: m.notes, create: m.notes } }));
vi.mock('../../services/clientRecordAccess.service.js', () => ({ resolveClientRecordAccess: m.access, providerHasAssignedClientAccess: vi.fn() }));
vi.mock('../../services/clientAccessLog.service.js', () => ({ logClientAccess: vi.fn().mockResolvedValue() }));
import ClientSchoolStaffRoiAccess from '../../models/ClientSchoolStaffRoiAccess.model.js';
import User from '../../models/User.model.js';
import { getClientNotes, createClientNote, getClientById } from '../client.controller.js';
import { listClientPhiDocuments, listClientPhiDocumentAudit, listClientIntakeResponses } from '../phiDocuments.controller.js';

beforeEach(() => {
  vi.clearAllMocks();
  m.client.mockResolvedValue({ id: 1, organization_id: 2, agency_id: 3, roi_expires_at: '2020-01-01' });
});

describe('expired ROI document endpoints', () => {
  for (const [name, handler] of [['documents', listClientPhiDocuments], ['document audit', listClientPhiDocumentAudit], ['intake responses', listClientIntakeResponses]]) {
    it(`denies ${name} before loading content, including scheduler own uploads`, async () => {
      const req = { params: { clientId: '1' }, user: { id: 4, role: 'school_staff' }, query: {} };
      const res = { status: vi.fn().mockReturnThis(), json: vi.fn() };
      const next = vi.fn();
      await handler(req, res, next);
      expect(next).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(403);
      expect(m.documents).not.toHaveBeenCalled();
      expect(m.user).not.toHaveBeenCalled();
    });
  }
});

describe('school staff overview and notes boundaries', () => {
  for (const [name, handler] of [['read', getClientNotes], ['write', createClientNote]]) {
    it(`denies direct note ${name} requests after ROI expiry`, async () => {
      vi.spyOn(ClientSchoolStaffRoiAccess, 'schoolStaffHasActiveRoiAccess').mockResolvedValue(false);
      const req = { params: { id: '1' }, user: { id: 4, role: 'school_staff' }, body: { message: 'Test' } };
      const res = { status: vi.fn().mockReturnThis(), json: vi.fn() };
      const next = vi.fn();
      await handler(req, res, next);
      expect(next).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(403);
      expect(m.notes).not.toHaveBeenCalled();
    });
  }
  it('keeps an expired school account with agency membership on the restricted overview', async () => {
    const access = vi.spyOn(ClientSchoolStaffRoiAccess, 'schoolStaffHasActiveRoiAccess').mockResolvedValue(true);
    m.client.mockResolvedValue({ id: 1, organization_id: 2, agency_id: 3, initials: 'AB', ssn: 'sensitive', guardian_intake_profile: { private: true } });
    m.access.mockResolvedValue({ ok: true, hasAgencyAccess: true });
    User.getAgencies.mockResolvedValue([{ id: 2, organization_type: 'school' }, { id: 3, organization_type: 'agency' }]);
    const req = { params: { id: '1' }, user: { id: 4, role: 'school_staff' } };
    const res = { status: vi.fn().mockReturnThis(), json: vi.fn() };
    const next = vi.fn();
    await getClientById(req, res, next);
    expect(next).not.toHaveBeenCalled();
    expect(access).toHaveBeenCalledWith(expect.objectContaining({ allowExpiredOverview: true }));
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ id: 1, initials: 'AB' }));
    expect(res.json.mock.calls[0][0]).not.toHaveProperty('ssn');
    expect(res.json.mock.calls[0][0]).not.toHaveProperty('guardian_intake_profile');
  });
});
