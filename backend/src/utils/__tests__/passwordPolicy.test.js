import { describe, expect, it } from 'vitest';
import { calcPasswordExpiry, resolveRequiresPasswordChange } from '../passwordPolicy.js';

const expiredUser = { password_hash: 'old-app-password', password_changed_at: '2020-01-01', sso_password_override: 1 };
const clearPolicy = { requiresPasswordChange: false, passwordExpired: false, passwordExpiresAt: null, passwordExpiresSoon: false, passwordExpiresInDays: null, passwordPolicyDays: null };

describe('password rotation follows the sign-in method', () => {
  it.each(['super_admin', 'admin', 'provider', 'school_staff'])('does not expire an unused app password in a Google %s session', role => {
    expect(calcPasswordExpiry({ ...expiredUser, role }, { authMethod: 'google' })).toEqual(clearPolicy);
    expect(resolveRequiresPasswordChange({ ...expiredUser, role }, { authMethod: 'google' })).toEqual(clearPolicy);
  });
  it('does not require replacing a temporary app password after Google sign-in', () => {
    expect(resolveRequiresPasswordChange({ ...expiredUser, temporary_password_hash: 'temporary' }, { authMethod: 'google' })).toEqual(clearPolicy);
  });
  it.each([null, 'password', 'passwordless', 'unknown'])('retains expiry for non-Google sessions (%s), including password overrides', authMethod => {
    expect(resolveRequiresPasswordChange(expiredUser, { authMethod })).toMatchObject({ requiresPasswordChange: true, passwordExpired: true, passwordPolicyDays: 120 });
  });
  it('retains temporary-password rotation for app-password sign-ins', () => {
    expect(resolveRequiresPasswordChange({ temporary_password_hash: 'temporary' })).toMatchObject({ requiresPasswordChange: true });
  });
  it('retains the existing exemption for SSO-only accounts', () => {
    expect(resolveRequiresPasswordChange(expiredUser, { ssoRequired: true })).toEqual(clearPolicy);
  });
});

// Passkeys authenticate independently of the fallback password.
it('does not force password rotation after a verified passkey sign-in', () => {
 expect(resolveRequiresPasswordChange({password_hash:'hash',password_changed_at:'2020-01-01',temporary_password_hash:'temporary'}, {authMethod:'passkey'}).requiresPasswordChange).toBe(false);
});
