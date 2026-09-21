import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getGoogleAuthorizeUrl } from '../googleOAuth.service.js';

beforeEach(() => {
  vi.stubEnv('GOOGLE_OAUTH_CLIENT_ID', 'test-client');
  vi.stubEnv('GOOGLE_OAUTH_CLIENT_SECRET', 'test-secret');
  vi.stubEnv('GOOGLE_OAUTH_REDIRECT_URI', 'https://app.example.test/api/auth/google/callback');
});
afterEach(() => vi.unstubAllEnvs());
describe('remembered Google authorization', () => {
  it('uses the remembered address without forcing account selection and retains OIDC safeguards', () => {
    const url = new URL(getGoogleAuthorizeUrl({ state: 'signed-state', nonce: 'nonce', loginHint: 'member@example.test', prompt: null }));
    expect(url.searchParams.get('login_hint')).toBe('member@example.test');
    expect(url.searchParams.has('prompt')).toBe(false);
    expect(url.searchParams.get('state')).toBe('signed-state');
    expect(url.searchParams.get('nonce')).toBe('nonce');
    expect(url.searchParams.get('response_type')).toBe('code');
    expect(url.searchParams.get('scope')).toBe('openid email profile');
  });
  it('keeps the account chooser for sign-in without a remembered account', () => {
    const url = new URL(getGoogleAuthorizeUrl({ state: 'signed-state', nonce: 'nonce' }));
    expect(url.searchParams.get('prompt')).toBe('select_account');
    expect(url.searchParams.has('login_hint')).toBe(false);
  });
});
