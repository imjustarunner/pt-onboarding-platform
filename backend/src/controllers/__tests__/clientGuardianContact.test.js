import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ access: vi.fn(), find: vi.fn(), save: vi.fn(), audit: vi.fn() }));
vi.mock('../../services/clientRecordAccess.service.js', () => ({ resolveClientRecordAccess: mocks.access }));
vi.mock('../../models/ClientGuardianIntakeProfile.model.js', () => ({ default: { findByClientId: mocks.find, upsertForClient: mocks.save } }));
vi.mock('../../services/clientAccessLog.service.js', () => ({ logClientAccess: mocks.audit }));
import { updateClientGuardianContact } from '../clientGuardianContact.controller.js';
const request = (body, role = 'support') => ({ params: { id: '22' }, user: { id: 4, role }, body });
const response = () => ({ status: vi.fn().mockReturnThis(), json: vi.fn().mockReturnThis(), setHeader: vi.fn() });
beforeEach(() => { vi.resetAllMocks(); mocks.access.mockResolvedValue({ ok: true }); mocks.find.mockResolvedValue(null); mocks.save.mockImplementation(async ({ profile }) => profile); });
describe('staff guardian chart contacts', () => {
  it('adds a paper-packet contact without email, a portal account, or a signed intake', async () => {
    const req = request({ firstName: 'Pat', lastName: 'Example', phone: '555-0100', dateOfBirth: '1980-01-02' });
    const res = response(); const next = vi.fn();
    await updateClientGuardianContact(req, res, next);
    expect(next).not.toHaveBeenCalled();
    expect(mocks.save).toHaveBeenCalledWith({ clientId: 22, source: 'staff_contact_update', profile: { ...req.body, fullName: 'Pat Example' } });
    expect(mocks.audit).toHaveBeenCalledWith(req, 22, 'guardian_contact_updated');
    expect(res.setHeader).toHaveBeenCalledWith('Cache-Control', 'no-store');
  });
  it('preserves other contact fields while clearing a wrong email', async () => {
    mocks.find.mockResolvedValue({ firstName: 'Pat', primaryLanguage: 'Spanish', email: 'old@example.com' });
    await updateClientGuardianContact(request({ email: '' }), response(), vi.fn());
    expect(mocks.save.mock.calls[0][0].profile).toEqual({ firstName: 'Pat', primaryLanguage: 'Spanish', email: null });
  });
  it.each(['school_staff', 'client_guardian', 'provider'])('rejects %s before accessing contact data', async role => {
    const res = response(); await updateClientGuardianContact(request({ phone: '555-0100' }, role), res, vi.fn());
    expect(res.status).toHaveBeenCalledWith(403); expect(mocks.access).not.toHaveBeenCalled(); expect(mocks.save).not.toHaveBeenCalled();
  });
  it('rejects staff outside the client scope', async () => {
    mocks.access.mockResolvedValue({ ok: false, status: 403, message: 'Forbidden' });
    const res = response(); await updateClientGuardianContact(request({ phone: '555-0100' }), res, vi.fn());
    expect(res.status).toHaveBeenCalledWith(403); expect(mocks.find).not.toHaveBeenCalled(); expect(mocks.save).not.toHaveBeenCalled();
  });
  it.each([{ email: 'invalid' }, { dateOfBirth: '2026-02-30' }, { dateOfBirth: '2999-01-01' }, { phone: {} }, {}])('rejects invalid or empty changes: %j', async body => {
    const res = response(); await updateClientGuardianContact(request(body), res, vi.fn());
    expect(res.status).toHaveBeenCalledWith(400); expect(mocks.save).not.toHaveBeenCalled();
  });
  it('propagates encryption failure without reporting success', async () => {
    const error = new Error('Encryption unavailable'); mocks.save.mockRejectedValue(error);
    const res = response(); const next = vi.fn(); await updateClientGuardianContact(request({ firstName: 'Pat' }), res, next);
    expect(next).toHaveBeenCalledWith(error); expect(res.json).not.toHaveBeenCalled();
  });
});
