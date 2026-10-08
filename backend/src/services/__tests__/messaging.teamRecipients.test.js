import { describe, it, expect, vi } from 'vitest';
vi.mock('../../config/database.js', () => ({ default: { execute: vi.fn() } }));
import { isActiveTeamMember, listActiveTeamMembers, teamSmsEligibility } from '../conversaTeamRecipients.service.js';
import { phoneFingerprint } from '../../utils/staffCommunicationChoices.js';
import { pollDeliveryMode, pollUsesInternal, pollUsesSms } from '../../utils/teamPollDelivery.js';
const staff = { id: 2, role: 'provider', status: 'ACTIVE_EMPLOYEE', is_active: 1, membership_active: 1, personal_phone: '+13035550101' };
const context = { agencyId: 4, from: '+13035550100' };
describe('team recipient eligibility', () => {
  it.each([{ is_active: 0 }, { membership_active: 0 }, { is_archived: 1 }, { status: 'INACTIVE_EMPLOYEE' }, { status: 'PREHIRE_OPEN' }, { status: 'TERMINATED_PENDING' }, { terminated_at: '2026-10-01' }, { role: 'school_staff' }, { agency_role: 'school_staff' }, { role: 'client' }, { role: 'client_guardian' }, { role: 'kiosk' }])('excludes %j even when another active flag remains set', change => {
    expect(isActiveTeamMember({ ...staff, ...change })).toBe(false);
  });
  it('includes active providers assigned to schools as internal providers', () => expect(isActiveTeamMember({ ...staff, agency_role: 'provider' })).toBe(true));
  it('filters stored audience accounts without dropping opted-out active staff', async () => {
    const db = { execute: vi.fn().mockResolvedValue([[staff, { ...staff, id: 3, status: 'INACTIVE_EMPLOYEE' }, { ...staff, id: 4, role: 'school_staff' }]]) };
    expect(await listActiveTeamMembers(4, db)).toEqual([staff]);
    expect(db.execute).toHaveBeenCalledWith(expect.stringContaining('ua.agency_id = ?'), [4]);
  });
  it('requires polling purpose consent, never workforce consent', async () => {
    const prepare = vi.fn().mockResolvedValue({});
    expect(await teamSmsEligibility(staff, context, { prepare })).toMatchObject({ eligible: true });
    expect(prepare).toHaveBeenCalledWith(expect.objectContaining({ agencyId: 4, purpose: 'polling', to: staff.personal_phone }));
  });
  it('keeps an explicit preference opt-out visible even without a configured sender', async () => {
    const prepare = vi.fn();
    const user = { ...staff, notification_categories: { staff_communications_4: { choices: { polling: false } } } };
    expect(await teamSmsEligibility(user, { agencyId: 4 }, { prepare })).toMatchObject({ eligible: false, label: 'SMS opted out' });
    expect(prepare).not.toHaveBeenCalled();
  });
  it('does not reuse consent after a phone change', async () => {
    const prepare = vi.fn();
    const user = { ...staff, notification_categories: { staff_communications_4: { phoneHash: phoneFingerprint('+13035550102'), choices: { polling: true } } } };
    expect(await teamSmsEligibility(user, context, { prepare })).toMatchObject({ eligible: false, status: 'sms_consent_required' });
    expect(prepare).not.toHaveBeenCalled();
  });
  it.each(['sms_opted_out', 'sms_consent_review_required', 'sms_campaign_not_ready'])('reflects transport block %s without sending', async code => {
    const prepare = vi.fn().mockRejectedValue(Object.assign(new Error('blocked'), { code }));
    expect(await teamSmsEligibility(staff, context, { prepare })).toMatchObject({ eligible: false, status: code });
  });
  it('distinguishes an explicit polling opt-out from missing consent', async () => {
    const prepare = vi.fn().mockRejectedValue(Object.assign(new Error('consent'), { code: 'sms_consent_required' }));
    const db = { execute: vi.fn().mockResolvedValue([[{ status: 'opted_out' }]]) };
    expect(await teamSmsEligibility(staff, context, { prepare, db, getSender: async () => ({ scope: 'campaign:4' }) })).toMatchObject({ label: 'SMS opted out' });
    expect(db.execute).toHaveBeenCalledWith(expect.any(String), ['campaign:4', staff.personal_phone, 'polling']);
    db.execute.mockResolvedValue([[]]);
    expect(await teamSmsEligibility(staff, context, { prepare, db, getSender: async () => ({ scope: 'campaign:4' }) })).toMatchObject({ label: 'SMS consent needed' });
  });
  it('shows missing mobile numbers without attempting delivery preparation', async () => {
    const prepare = vi.fn();
    expect(await teamSmsEligibility({ ...staff, personal_phone: null }, context, { prepare })).toMatchObject({ status: 'no_phone', eligible: false });
    expect(prepare).not.toHaveBeenCalled();
  });
  it.each([['internal',true,false],['sms',false,true],['both',true,true]])('respects %s delivery independently of the old checkbox', (deliveryMode, internal, sms) => {
    expect(pollUsesInternal({ deliveryMode, viaSms: !sms })).toBe(internal);
    expect(pollUsesSms({ deliveryMode, viaSms: !sms })).toBe(sms);
  });
  it('preserves both-channel behavior for legacy SMS polls', () => expect(pollDeliveryMode({ viaSms: true })).toBe('both'));
});
