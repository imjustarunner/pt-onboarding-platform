import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildPublicIntakeUrl, buildPublicIntakeShortUrl, buildSchoolEnrollmentUrl, buildSchoolReferralFinderUrl, getSchoolPublicOrigin } from '../publicIntakeUrl.js';

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
  afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
  it.each(['app.itsco.health', 'app.nextleveluplcc.com', 'schoolcarebridge.org'])('shares one SchoolCareBridge link from %s', hostname => {
    vi.stubGlobal('window', { location: { hostname, origin: `https://${hostname}` } });
    expect(buildSchoolEnrollmentUrl('enrollment-key')).toBe('https://schoolcarebridge.org/intake/enrollment-key');
    expect(buildSchoolEnrollmentUrl('')).toBe('');
  });
  it('preserves local development', () => {
    vi.stubGlobal('window', { location: { hostname: 'localhost', origin: 'http://localhost:5173' } });
    expect(buildSchoolEnrollmentUrl('enrollment-key')).toBe('http://localhost:5173/intake/enrollment-key');
  });
  it('keeps a tenant intake override separate from school sharing', () => {
    vi.stubGlobal('window', { location: { hostname: 'app.itsco.health', origin: 'https://app.itsco.health' } });
    vi.stubEnv('VITE_PUBLIC_INTAKE_BASE_URL', 'https://other-practice.example.test');
    expect(buildPublicIntakeUrl('office-key')).toBe('https://other-practice.example.test/intake/office-key');
    expect(buildSchoolEnrollmentUrl('school-key')).toBe('https://schoolcarebridge.org/intake/school-key');
    expect(buildSchoolReferralFinderUrl('itsco')).toBe('https://schoolcarebridge.org/itsco/school-referral');
  });
  it('preserves only trusted configured school origins', () => {
    vi.stubGlobal('window', { location: { hostname: 'app.itsco.health', origin: 'https://app.itsco.health' } });
    vi.stubEnv('VITE_SCHOOLCAREBRIDGE_PUBLIC_ORIGIN', 'https://mh4kidz.org');
    expect(buildSchoolEnrollmentUrl('school-key')).toBe('https://mh4kidz.org/intake/school-key');
    expect(buildSchoolReferralFinderUrl('itsco')).toBe('https://mh4kidz.org/itsco/school-referral');
    vi.stubEnv('VITE_SCHOOLCAREBRIDGE_PUBLIC_ORIGIN', 'https://unrelated.example.test');
    expect(getSchoolPublicOrigin()).toBe('https://schoolcarebridge.org');
  });
  it.each(['http://mh4kidz.org', 'https://staff@mh4kidz.org', 'https://mh4kidz.org:8443', 'https://mh4kidz.org/other', 'https://mh4kidz.org?next=elsewhere'])('rejects an unsafe school origin %s', origin => {
    vi.stubGlobal('window', { location: { hostname: 'app.itsco.health', origin: 'https://app.itsco.health' } });
    vi.stubEnv('VITE_SCHOOLCAREBRIDGE_PUBLIC_ORIGIN', origin);
    expect(buildSchoolEnrollmentUrl('school-key')).toBe('https://schoolcarebridge.org/intake/school-key');
  });
  it('supports the trusted MH4Kidz school surface and missing finder context', () => {
    expect(getSchoolPublicOrigin('https://mh4kidz.org')).toBe('https://mh4kidz.org');
    expect(buildSchoolReferralFinderUrl('')).toBe('');
  });
});
