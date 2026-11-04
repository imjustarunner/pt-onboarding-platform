import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildPublicIntakeUrl, buildPublicIntakeShortUrl, buildSchoolEnrollmentUrl } from '../publicIntakeUrl.js';

describe('publicIntakeUrl', () => {
  it('buildPublicIntakeUrl appends public key to /intake/', () => {
    const u = buildPublicIntakeUrl('mykey');
    expect(u).toContain('/intake/mykey');
  });

  it('buildPublicIntakeShortUrl uses /i/ segment', () => {
    const u = buildPublicIntakeShortUrl('shortkey');
    expect(u).toContain('/i/shortkey');
  });

  it('returns empty string for missing key', () => {
    expect(buildPublicIntakeUrl('')).toBe('');
    expect(buildPublicIntakeShortUrl('')).toBe('');
  });
});


describe('school enrollment URLs', () => {
  afterEach(() => vi.unstubAllGlobals());
  it.each(['app.itsco.health', 'app.nextleveluplcc.com', 'schoolcarebridge.org'])('shares one SchoolCareBridge link from %s', hostname => {
    vi.stubGlobal('window', { location: { hostname, origin: `https://${hostname}` } });
    expect(buildSchoolEnrollmentUrl('enrollment-key')).toBe('https://schoolcarebridge.org/intake/enrollment-key');
    expect(buildSchoolEnrollmentUrl('')).toBe('');
  });
  it('preserves local development', () => {
    vi.stubGlobal('window', { location: { hostname: 'localhost', origin: 'http://localhost:5173' } });
    expect(buildSchoolEnrollmentUrl('enrollment-key')).toBe('http://localhost:5173/intake/enrollment-key');
  });
});
