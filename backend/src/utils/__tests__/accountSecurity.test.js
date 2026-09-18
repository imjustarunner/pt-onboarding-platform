import { afterEach, describe, expect, it, vi } from 'vitest';
import { authenticator, verifiedCounter, sealMfaSecret, openMfaSecret, newAuthenticatorSecret, makeRecoveryCodes, recoveryHash, limitedRoster, requiresStaffMfa } from '../accountSecurity.js';
afterEach(() => vi.unstubAllEnvs());
describe('authenticator security', () => {
  it('accepts a current code once and rejects stale, malformed and replayed codes', () => {
    const secret = newAuthenticatorSecret(), now = 1789580000000;
    const code = authenticator(secret).generate({ timestamp: now });
    const counter = verifiedCounter(secret, code, -1, now);
    expect(counter).toBe(Math.floor(now / 30000));
    expect(verifiedCounter(secret, code, counter, now)).toBeNull();
    expect(verifiedCounter(secret, code, -1, now + 120000)).toBeNull();
    expect(verifiedCounter(secret, '12345', -1, now)).toBeNull();
  });
  it('encrypts secrets with an account-bound authenticated envelope and fails without a dedicated key', () => {
    vi.stubEnv('MFA_ENCRYPTION_KEY_BASE64', Buffer.alloc(32, 7).toString('base64'));
    const secret = newAuthenticatorSecret(), encrypted = sealMfaSecret(secret, 1);
    expect(encrypted).not.toContain(secret); expect(openMfaSecret(encrypted, 1)).toBe(secret);
    expect(() => openMfaSecret(encrypted, 2)).toThrow();
    const tampered = JSON.parse(encrypted); tampered.data = Buffer.from('tampered').toString('base64');
    expect(() => openMfaSecret(JSON.stringify(tampered), 1)).toThrow();
    vi.stubEnv('MFA_ENCRYPTION_KEY_BASE64', ''); expect(() => sealMfaSecret(secret, 1)).toThrow();
  });
  it('generates separate high-entropy one-use recovery secrets, storing only hashes', () => {
    const { codes, hashes } = makeRecoveryCodes(); expect(new Set(codes).size).toBe(10);
    expect(codes[0].replaceAll('-', '')).toHaveLength(32);
    expect(hashes[0]).toBe(recoveryHash(codes[0])); expect(JSON.stringify(hashes)).not.toContain(codes[0]);
  });
  it('returns only the reviewed limited-roster fields, including when new sensitive fields are introduced', () => {
    expect(limitedRoster([{ id: 1, initials: 'AB', identifier_code: 'C123', full_name: 'Private Name', guardian: { name: 'Private Guardian' }, search_terms: 'Private Name', notes: 'Contains Private Name', document_url: 'https://example.invalid/private.pdf', school_portal_can_open: true }])).toEqual([{ id: 1, initials: 'AB', identifier_code: 'C123', full_name: null, school_portal_can_open: false, requires_two_factor: true }]);
  });
  it('requires staff including administrators, without imposing the staff policy on guardians', () => {
    vi.stubEnv('MFA_CLIENT_ACCESS_SCOPE', 'all_staff');
    for (const role of ['super_admin','admin','provider','school_staff','club_manager']) expect(requiresStaffMfa(role)).toBe(true);
    expect(requiresStaffMfa('client_guardian')).toBe(false);
    vi.stubEnv('MFA_CLIENT_ACCESS_SCOPE', 'school_staff');
    expect(requiresStaffMfa('admin')).toBe(true);
  });
});
