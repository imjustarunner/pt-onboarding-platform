import { beforeEach, describe, expect, it } from 'vitest';
import { hasRememberedGoogleAccount, rememberVerifiedGoogleAccount } from '../googleAccountMemory';
import { getRememberedGoogleLogin, setSsoRememberChoice } from '../loginRemember';
const user = { id: 7, username: 'alias', email: 'sample@example.test', firstName: 'Sample', lastName: 'Member' };
const account = { user, orgSlug: 'itsco', authMethod: 'google', agencies: [{ slug: 'itsco', name: 'ITSCO' }] };
beforeEach(() => { localStorage.clear(); sessionStorage.clear(); });
describe('remembering an established Google session', () => {
  it('builds a named account from verified session data without needing an sso query', () => {
    expect(rememberVerifiedGoogleAccount(account)).toBe(true);
    expect(getRememberedGoogleLogin('itsco')).toMatchObject({ displayName: 'Sample Member', loginHint: user.email, organizationName: 'ITSCO' });
    expect(hasRememberedGoogleAccount(user)).toBe(true);
    expect(hasRememberedGoogleAccount({ id: 8, email: 'someoneelse@example.test' })).toBe(false);
  });
  it('does not create a Google card for password or unidentified handoffs', () => {
    for (const authMethod of ['password', null, undefined]) expect(rememberVerifiedGoogleAccount({ ...account, authMethod })).toBe(false);
    expect(getRememberedGoogleLogin()).toBeNull();
  });
  it('honors both transferred and permanent local opt-outs', () => {
    expect(rememberVerifiedGoogleAccount({ ...account, remember: false })).toBe(false);
    setSsoRememberChoice(false, 'itsco'); sessionStorage.clear();
    expect(rememberVerifiedGoogleAccount(account)).toBe(false);
    setSsoRememberChoice(true, 'itsco');
    expect(rememberVerifiedGoogleAccount(account)).toBe(true);
  });
});
