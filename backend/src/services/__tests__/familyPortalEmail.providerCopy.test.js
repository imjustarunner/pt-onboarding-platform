import { beforeEach, expect, it, vi } from 'vitest';
const m = vi.hoisted(() => ({ execute: vi.fn(), decrypt: vi.fn() }));
vi.mock('../../config/database.js', () => ({ default: { execute: m.execute } }));
vi.mock('../familyBillingEncryption.service.js', () => ({ decryptFamilyBilling: m.decrypt }));
import { appointmentProviderCopy, nativeAppointmentProviderCopy } from '../appointmentProviderCopy.service.js';

const appointment = { id: 12, agencyId: 2, providerUserId: 8 };
beforeEach(() => { vi.resetAllMocks(); m.execute.mockResolvedValue([[]]); });

it('copies the assigned provider’s current work address through the active tenant membership', async () => {
  m.execute.mockResolvedValue([[{ work_email: ' provider@care.example ', email: 'login@care.example', personal_email: 'private@example.test' }]]);
  expect(await appointmentProviderCopy(appointment, 'parent@example.test')).toEqual(['provider@care.example']);
  const [sql, values] = m.execute.mock.calls[0];
  expect(values).toEqual([2, 8]);
  expect(sql).toContain('ua.agency_id=? AND ua.is_active=1');
  expect(sql).toContain('u.id=? AND u.is_active=1');
  expect(sql).toContain('COALESCE(u.is_archived,0)=0');
});

it('retains the official login email when no separate provider work address is configured', async () => {
  m.execute.mockResolvedValue([[{ work_email: null, email: 'provider@care.example', personal_email: 'private@example.test' }]]);
  expect(await appointmentProviderCopy(appointment, 'parent@example.test')).toEqual(['provider@care.example']);
});

it.each([
  ['a missing active tenant provider', null],
  ['a personal address alone', { personal_email: 'private@example.test' }],
  ['an invalid work address', { work_email: 'bad address', email: 'provider@care.example' }],
  ['the family destination itself', { work_email: 'PARENT@EXAMPLE.TEST' }]
])('does not add a provider CC for %s', async (_label, provider) => {
  m.execute.mockResolvedValue([provider ? [provider] : []]);
  expect(await appointmentProviderCopy(appointment, 'parent@example.test')).toEqual([]);
});

it.each([{ agencyId: 2 }, { providerUserId: 8 }])('does not query an incomplete canonical appointment (%j)', async value => {
  expect(await appointmentProviderCopy(value, 'parent@example.test')).toEqual([]);
  expect(m.execute).not.toHaveBeenCalled();
});

it('decrypts only the active provider account in the appointment’s practice', async () => {
  m.execute.mockResolvedValue([[{ id: 'provider-account', profile: 'encrypted-profile' }]]);
  m.decrypt.mockReturnValue({ workEmail: 'provider@care.example', email: 'login@care.example', personalEmail: 'private@example.test' });
  expect(await nativeAppointmentProviderCopy({ practiceId: 'practice' }, { data: { providerAccountId: 'provider-account' } }, 'parent@example.test'))
    .toEqual(['provider@care.example']);
  expect(m.decrypt).toHaveBeenCalledExactlyOnceWith('encrypted-profile', 'auricwell:account:provider-account');
  const [sql, values] = m.execute.mock.calls[0];
  expect(values).toEqual(['practice', 'provider-account']);
  expect(sql).toContain('m.practice_id=?');
  expect(sql).toContain("a.status='active' AND m.status='active' AND m.actor_type='staff'");
});

it.each([
  [{ email: 'provider@care.example' }, ['provider@care.example']],
  [{ personalEmail: 'private@example.test' }, []],
  [{ workEmail: 'parent@example.test' }, []],
  [{ workEmail: 'two@example.test,three@example.test' }, []]
])('selects only a valid native official account address (%j)', async (profile, expected) => {
  m.execute.mockResolvedValue([[{ id: 'provider-account', profile: 'encrypted' }]]);
  m.decrypt.mockReturnValue(profile);
  expect(await nativeAppointmentProviderCopy({ practiceId: 'practice' }, { data: { providerAccountId: 'provider-account' } }, 'parent@example.test')).toEqual(expected);
});

it('does not decrypt an unavailable or inactive practice provider', async () => {
  expect(await nativeAppointmentProviderCopy({ practiceId: 'practice' }, { data: { providerAccountId: 'provider-account' } }, 'parent@example.test')).toEqual([]);
  expect(m.decrypt).not.toHaveBeenCalled();
});
