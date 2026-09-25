import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getPortalLoginMemory, getRememberedGoogleLogin, setRememberedGoogleLogin, setRememberedLogin, clearRememberedLogin, clearRememberedGoogleLogin } from '../loginRemember';

beforeEach(() => localStorage.clear());
describe('returning login accounts', () => {
  it('preserves verified Google details when the same username is restored', () => {
    setRememberedGoogleLogin({ username: 'alias', orgSlug: 'itsco', displayName: 'Example Member', loginHint: 'work@example.test', title: 'Coordinator' });
    setRememberedGoogleLogin({ username: 'alias', orgSlug: 'itsco' });
    expect(getRememberedGoogleLogin()).toMatchObject({ displayName: 'Example Member', loginHint: 'work@example.test', title: 'Coordinator' });
    setRememberedGoogleLogin({ username: 'different', orgSlug: 'itsco' });
    expect(getRememberedGoogleLogin()).toMatchObject({ displayName: '', loginHint: 'different', title: '' });
  });
  it.each(['itsco', 'nlu', 'tisi', 'sstc'])('restores a username on the %s portal', orgSlug => {
    setRememberedLogin({ username: ' visitor@example.test ', orgSlug });
    expect(getPortalLoginMemory(orgSlug)).toMatchObject({ username: 'visitor@example.test', remembered: true, google: null });
  });
  it('restores Google identity on both its branded portal and the platform login', () => {
    setRememberedGoogleLogin({ username: 'member@example.test', orgSlug: 'itsco', displayName: 'Example Member', loginHint: 'work@example.test' });
    for (const slug of ['itsco', '']) expect(getPortalLoginMemory(slug).google).toMatchObject({ displayName: 'Example Member', loginHint: 'work@example.test' });
    expect(getPortalLoginMemory('nlu')).toEqual({ username: '', remembered: false, google: null });
  });
  it('respects an explicitly supplied different username and disables Google in native mode', () => {
    setRememberedGoogleLogin({ username: 'member@example.test', orgSlug: 'itsco' });
    expect(getPortalLoginMemory('itsco', { username: 'other@example.test' })).toMatchObject({ username: 'other@example.test', google: null });
    expect(getPortalLoginMemory('itsco', { allowGoogle: false }).google).toBeNull();
  });
  it('supports existing stored Google accounts and forgetting an account', () => {
    localStorage.setItem('__pt_google_sso_remember__', JSON.stringify({ username: 'member@example.test', orgSlug: 'itsco' }));
    setRememberedLogin({ username: 'member@example.test', orgSlug: 'itsco' });
    expect(getRememberedGoogleLogin().loginHint).toBe('member@example.test');
    clearRememberedGoogleLogin('nlu');
    expect(getRememberedGoogleLogin()).not.toBeNull();
    clearRememberedGoogleLogin('itsco'); clearRememberedLogin();
    expect(getPortalLoginMemory('itsco')).toEqual({ username: '', remembered: false, google: null });
  });
  it('handles malformed or inaccessible storage without blocking login', () => {
    localStorage.setItem('__pt_login_remember__', '{broken');
    expect(getPortalLoginMemory('itsco').username).toBe('');
    const spy = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('Unavailable'); });
    expect(getPortalLoginMemory('itsco').google).toBeNull();
    spy.mockRestore();
  });
});
