import { beforeEach, expect, it, vi } from 'vitest';
import jwt from 'jsonwebtoken';
vi.mock('../../config/database.js', () => ({ default: { execute: vi.fn() } }));
import pool from '../../config/database.js';
import { assertHireStaffAccess } from '../hireStaffAccess.service.js';
import { assertCurrentAccountEnabled } from '../accountAccess.service.js';
import { signFullSuiteToken } from '../productIdentity.service.js';
import { canLogin } from '../../utils/accessControl.js';
const enabled = { status: 'ACTIVE_EMPLOYEE', is_active: 1, role: 'school_staff', identity_product: 'full_suite' };
const secret = 'synthetic-account-access-test-secret';
beforeEach(() => vi.clearAllMocks());

it.each([
  { is_active: 0 }, { is_active: false }, { is_active: '0' },
  { is_archived: 1 }, { is_archived: true }, { is_archived: '1' },
  { status: 'ARCHIVED' }, { status: 'INACTIVE_EMPLOYEE' }
])('rejects disabled accounts consistently at issuance, recovery, and session use: %j', async state => {
  const user = { ...enabled, ...state };
  pool.execute.mockResolvedValue([[user]]);
  expect(canLogin(user)).toBe(false);
  expect(canLogin({ ...user, role: 'super_admin' })).toBe(false);
  await expect(assertHireStaffAccess({ id: 42, status: 'ACTIVE_EMPLOYEE' })).rejects.toMatchObject({ code: 'ACCOUNT_DISABLED', status: 403 });
  await expect(assertCurrentAccountEnabled(42)).rejects.toMatchObject({ code: 'ACCOUNT_DISABLED' });
  await expect(signFullSuiteToken({ id: 42 }, secret)).rejects.toMatchObject({ code: 'ACCOUNT_DISABLED' });
});

it('blocks an old token as soon as the stored account becomes disabled', async () => {
  pool.execute.mockResolvedValue([[enabled]]);
  const token = await signFullSuiteToken({ id: 42, role: 'school_staff' }, secret, { expiresIn: '1h' });
  const claims = jwt.verify(token, secret);
  await expect(assertHireStaffAccess(claims)).resolves.toBeUndefined();
  pool.execute.mockResolvedValue([[{ ...enabled, is_active: 0 }]]);
  await expect(assertHireStaffAccess(claims)).rejects.toMatchObject({ code: 'ACCOUNT_DISABLED' });
});

it('does not let demo claims bypass a disabled real account', async () => {
  pool.execute.mockResolvedValue([[{ ...enabled, is_active: 0 }]]);
  await expect(assertHireStaffAccess({ id: 42, demoMode: true })).rejects.toMatchObject({ code: 'ACCOUNT_DISABLED' });
});

it('rejects deleted accounts and fails closed when account storage is unavailable', async () => {
  pool.execute.mockResolvedValue([[]]);
  await expect(assertHireStaffAccess({ id: 42 })).rejects.toMatchObject({ code: 'ACCOUNT_UNAVAILABLE' });
  pool.execute.mockRejectedValue(new Error('database unavailable'));
  await expect(assertHireStaffAccess({ id: 42 })).rejects.toThrow('database unavailable');
  await expect(signFullSuiteToken({ id: 42 }, secret)).rejects.toThrow('database unavailable');
});

it('allows enabled accounts, including legacy null active flags, without changing their state', async () => {
  for (const is_active of [true, 1, '1', null]) {
    pool.execute.mockResolvedValue([[{ ...enabled, is_active }]]);
    await expect(assertHireStaffAccess({ id: 42 })).resolves.toBeUndefined();
  }
  expect(pool.execute.mock.calls.every(([sql]) => sql.startsWith('SELECT'))).toBe(true);
});
