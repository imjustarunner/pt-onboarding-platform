import { beforeEach, describe, it, expect, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ profile: vi.fn(), execute: vi.fn(), enroll: vi.fn(), connection: vi.fn() }));
vi.mock('../../config/clinicalDatabase.js', () => ({ default: { execute: mocks.execute } }));
vi.mock('../claimMdBillingProfile.service.js', () => ({ getClaimMdBillingProfile: mocks.profile, listClaimMdBillingProfiles: vi.fn(), resolveClaimMdBillingProfile: vi.fn(), assertClaimBillingNpi: vi.fn() }));
vi.mock('../claimMdConnection.service.js', () => ({ resolveClaimMdConnection: mocks.connection, requireClaimMdTransmission: c => { if (c.mode !== 'live') throw Object.assign(new Error('disabled'), { status: 409 }); } }));
vi.mock('../claimMd.service.js', () => ({ requestEnrollment: mocks.enroll, buildClaimMdJsonClaim: vi.fn(), fetchPayers: vi.fn() }));
vi.mock('../clinicalEligibility.service.js', () => ({ default: { ensureAgencyAccess: vi.fn() } }));
import { startClaimMdEnrollment } from '../../controllers/claimMdWorkflow.controller.js';
const req = () => ({ user: { id: 9 }, body: { agencyId: 377, billingOfficeLocationId: 8, providerNpi: '1972246940', payerId: 'COCHA', enrollmentType: '1500' } });
beforeEach(() => {
  vi.clearAllMocks(); mocks.connection.mockResolvedValue({ connectionId: 'account:100', accountKey: 'synthetic', mode: 'live' });
  mocks.profile.mockResolvedValue({ officeId: 8, billingNpi: '1306688650', practice: { tax_id: '123456789' } });
  mocks.enroll.mockResolvedValue({ link: { url: 'https://www.claim.md/enroll/test/' } });
  mocks.execute.mockResolvedValue([{ affectedRows: 1 }]);
});
describe('office-specific payer enrollment', () => {
  it('uses the saved office NPI and tax identity, never a caller-supplied NPI', async () => {
    const res = { json: vi.fn() }, next = vi.fn();
    await startClaimMdEnrollment(req(), res, next);
    expect(next).not.toHaveBeenCalled();
    expect(mocks.profile).toHaveBeenCalledWith(377, 8);
    expect(mocks.enroll).toHaveBeenCalledWith(expect.objectContaining({ npi: '1306688650', payerId: 'COCHA' }));
    expect(mocks.execute.mock.calls[0][1].slice(0, 6)).toEqual([377, 'account:100', 8, 'COCHA', '1500', '1306688650']);
    expect(mocks.execute.mock.calls[1][0]).toContain("status = 'requested'");
    expect(res.json).toHaveBeenCalledWith({ url: 'https://www.claim.md/enroll/test/' });
  });
  it('does not mark an enrollment form issued when the vendor request fails', async () => {
    mocks.enroll.mockRejectedValue(new Error('unavailable')); const next = vi.fn();
    await startClaimMdEnrollment(req(), { json: vi.fn() }, next);
    expect(mocks.execute).toHaveBeenCalledTimes(1); expect(next).toHaveBeenCalled();
  });
  it('does not contact Claim.MD for an unavailable billing office or missing connection', async () => {
    mocks.profile.mockRejectedValue(new Error('other agency'));
    await startClaimMdEnrollment(req(), { json: vi.fn() }, vi.fn());
    expect(mocks.enroll).not.toHaveBeenCalled(); expect(mocks.execute).not.toHaveBeenCalled();
    mocks.connection.mockResolvedValue({ mode: 'disabled' });
    await startClaimMdEnrollment(req(), { json: vi.fn() }, vi.fn());
    expect(mocks.enroll).not.toHaveBeenCalled();
  });
  it('allows enrollment setup while live claim transmission remains disabled', async () => {
    mocks.connection.mockResolvedValue({ connectionId: 'account:100', accountKey: 'synthetic', mode: 'disabled' });
    const next = vi.fn();
    await startClaimMdEnrollment(req(), {json:vi.fn()}, next);
    expect(next).not.toHaveBeenCalled(); expect(mocks.enroll).toHaveBeenCalledTimes(1);
  });
  it('requires acknowledgement before requesting ERA routing changes', async () => {
    const r = req(); r.body.enrollmentType = 'era'; const next = vi.fn();
    await startClaimMdEnrollment(r, { json: vi.fn() }, next);
    expect(next.mock.calls[0][0].status).toBe(400); expect(mocks.enroll).not.toHaveBeenCalled();
  });
});
