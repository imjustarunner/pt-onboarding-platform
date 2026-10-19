import { afterEach, describe, expect, it, vi } from 'vitest';
import { getApiBaseUrl, resolveApiBaseUrl } from '../apiBaseUrl';
import { getBackendBaseUrl, toUploadsUrl } from '../uploadsUrl';

const publicLocation = { hostname: 'app.itsco.health', pathname: '/itsco/login' };

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.resetModules();
});

describe('API routing for public login pages', () => {
  it.each([undefined, '', '   ', 'http://localhost:3000/api', 'http://127.0.0.1:3000/api',
    'http://127.1:3000/api', 'http://[::1]:3000/api', '//localhost:3000/api',
    'http://dev.localhost:3000/api', 'http://localhost.:3000/api', 'http://0.0.0.0:3000/api'])
  ('uses the site API instead of a missing or local URL: %s', configured => {
    expect(resolveApiBaseUrl(configured, publicLocation)).toBe('/api');
  });

  it('preserves configured remote APIs and normalizes trailing slashes', () => {
    expect(resolveApiBaseUrl('https://backend.example.test/api/', publicLocation))
      .toBe('https://backend.example.test/api');
    expect(resolveApiBaseUrl('/api/', publicLocation)).toBe('/api');
  });

  it('allows explicit local development and native localhost configurations', () => {
    for (const hostname of ['localhost', '127.0.0.1', '[::1]']) {
      expect(resolveApiBaseUrl('http://localhost:3000/api', { hostname }))
        .toBe('http://localhost:3000/api');
    }
    expect(resolveApiBaseUrl(undefined, { hostname: 'localhost' })).toBe('/api');
    expect(resolveApiBaseUrl('https://backend.example.test/api', { hostname: 'localhost' }))
      .toBe('https://backend.example.test/api');
  });

  it.each([
    { hostname: 'plotlinepo.com' }, { hostname: 'www.plotlinepo.com' },
    { hostname: 'schoolcarebridge.org' }, { hostname: 'www.schoolcarebridge.org' },
    { hostname: 'mh4kidz.org', pathname: '/schoolcarebridge/app' }
  ])('preserves same-origin product routing for $hostname', location => {
    expect(resolveApiBaseUrl('https://backend.example.test/api', location)).toBe('/api');
  });

  it.each(['', 'http://localhost:3000/api'])
  ('keeps Google sign-in, API calls and uploads on the public site with config %s', async configured => {
    vi.stubGlobal('window', { location: publicLocation });
    vi.stubEnv('VITE_API_URL', configured);
    const { default: api } = await import('../../services/api');
    expect(api.defaults.baseURL).toBe('/api');
    expect(getApiBaseUrl()).toBe('/api');
    const googleStart = `${getBackendBaseUrl()}/auth/google/start?orgSlug=itsco`;
    expect(new URL(googleStart, 'https://app.itsco.health').href)
      .toBe('https://app.itsco.health/api/auth/google/start?orgSlug=itsco');
    expect(toUploadsUrl('/uploads/login-logo.png')).toBe('/api/uploads/login-logo.png');
  });
});
