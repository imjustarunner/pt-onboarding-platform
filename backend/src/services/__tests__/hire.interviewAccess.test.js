import { describe, it, expect, vi, beforeEach } from 'vitest';
const mocks = vi.hoisted(() => ({ findById: vi.fn(), getAgencies: vi.fn(), getUserCapabilities: vi.fn(), list: vi.fn() }));
vi.mock('../../models/User.model.js', () => ({ default: mocks }));
vi.mock('../../models/EmailSenderIdentity.model.js', () => ({ default: mocks }));
vi.mock('../../utils/capabilities.js', () => ({ getUserCapabilities: mocks.getUserCapabilities }));
import { canAccessHiringInterview } from '../hiringInterviewAccess.service.js';
import { resolveInterviewSender, interviewDeliveryStatus } from '../hiringInterviewSender.service.js';
const interview = { agency_id: 4, candidate_user_id: 30, interviewer_user_ids_json: [11, 22] };
beforeEach(() => { vi.clearAllMocks(); mocks.findById.mockResolvedValue({ id: 11, role: 'provider' }); mocks.getAgencies.mockResolvedValue([{ id: 4 }]); mocks.getUserCapabilities.mockReturnValue({ canAccessPlatform: true, canManageHiring: false }); });
describe('interview access boundary', () => {
  it('allows multiple assigned staff without granting hiring-wide access', async () => { expect(await canAccessHiringInterview({ id: 11 }, interview)).toBe(true); expect(await canAccessHiringInterview({ id: 22 }, interview)).toBe(true); });
  it('denies candidate, guest, and unassigned staff', async () => { for (const id of [30, null, 99]) expect(await canAccessHiringInterview({ id }, interview)).toBe(false); });
  it('denies a removed tenant membership and inactive staff', async () => { mocks.getAgencies.mockResolvedValue([{ id: 9 }]); expect(await canAccessHiringInterview({ id: 11 }, interview)).toBe(false); mocks.getAgencies.mockResolvedValue([{ id: 4 }]); mocks.getUserCapabilities.mockReturnValue({ canAccessPlatform: false }); expect(await canAccessHiringInterview({ id: 11 }, interview)).toBe(false); });
  it('allows tenant hiring managers but never the candidate even with that capability', async () => { mocks.getUserCapabilities.mockReturnValue({ canAccessPlatform: true, canManageHiring: true }); expect(await canAccessHiringInterview({ id: 99 }, interview)).toBe(true); expect(await canAccessHiringInterview({ id: 30 }, interview)).toBe(false); });
});
describe('People Operations sender and delivery', () => {
  it('requires an active tenant PO identity; never falls back to another mailbox', async () => { mocks.list.mockResolvedValue([{ id: 1, agency_id: 4, from_email: 'admin@tenant.org' }, { id: 2, agency_id: 8, from_email: 'po@other.org' }, { id: 3, agency_id: 4, from_email: 'PO@tenant.org' }]); expect((await resolveInterviewSender(4)).id).toBe(3); });
  it('blocks sending when PO is absent or disabled', async () => { mocks.list.mockResolvedValue([{ id: 1, agency_id: 4, from_email: 'po@tenant.org', is_active: 0 }]); await expect(resolveInterviewSender(4)).rejects.toMatchObject({ status: 409 }); });
  it('only marks provider-confirmed delivery as sent', () => { for (const result of [undefined, {}, { skipped: true, reason: 'disabled' }, { queued: true, id: 'queue' }]) expect(interviewDeliveryStatus(result).sent).toBe(false); expect(interviewDeliveryStatus({ id: 'message' }).sent).toBe(true); });
});
