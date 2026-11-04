import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  buildPublicSchoolPrintablePacketUrl,
  publicSchoolPrintablePacketApiPath
} from '../publicSchoolPrintablePacketUrl.js';

describe('publicSchoolPrintablePacketUrl', () => {
  afterEach(() => vi.unstubAllEnvs());
  it('builds an API path by slug and locale', () => {
    expect(publicSchoolPrintablePacketApiPath('carver', 'en')).toBe(
      '/public/schools/carver/printable-packet?locale=en'
    );
    expect(publicSchoolPrintablePacketApiPath('Cheyenne-El', 'es')).toBe(
      '/public/schools/cheyenne-el/printable-packet?locale=es'
    );
  });

  it('returns empty for missing school key', () => {
    expect(publicSchoolPrintablePacketApiPath('')).toBe('');
    expect(buildPublicSchoolPrintablePacketUrl('')).toBe('');
  });

  it('shares a canonical school URL from a tenant app host', () => {
    expect(buildPublicSchoolPrintablePacketUrl('carver', 'en', {
      origin: 'https://app.itsco.health',
      apiBase: '/api'
    })).toBe('https://schoolcarebridge.org/api/public/schools/carver/printable-packet?locale=en');
  });

  it('does not let an absolute API host replace the school sharing host', () => {
    expect(buildPublicSchoolPrintablePacketUrl(36, 'es', {
      origin: 'https://app.itsco.health',
      apiBase: 'https://app.itsco.health/api'
    })).toBe('https://schoolcarebridge.org/api/public/schools/36/printable-packet?locale=es');
  });
  it('retains a local development API and trusted MH4Kidz deployment', () => {
    expect(buildPublicSchoolPrintablePacketUrl(36, 'es', { origin:'http://localhost:5173', apiBase:'http://localhost:3000/api' }))
      .toBe('http://localhost:3000/api/public/schools/36/printable-packet?locale=es');
    vi.stubEnv('VITE_SCHOOLCAREBRIDGE_PUBLIC_ORIGIN', 'https://mh4kidz.org');
    expect(buildPublicSchoolPrintablePacketUrl(36, 'es', { origin:'https://app.itsco.health', apiBase:'https://app.itsco.health/api' }))
      .toBe('https://mh4kidz.org/api/public/schools/36/printable-packet?locale=es');
  });
  it('falls back to the canonical API path for malformed configuration', () => {
    expect(buildPublicSchoolPrintablePacketUrl(36, 'en', { origin:'https://app.itsco.health', apiBase:'https://[' }))
      .toBe('https://schoolcarebridge.org/api/public/schools/36/printable-packet?locale=en');
  });
  it('shares the fictional demo packet on the same school origin', () => {
    expect(buildPublicSchoolPrintablePacketUrl('juniper-lantern-demo', 'en', {origin:'https://app.itsco.health'}))
      .toBe('https://schoolcarebridge.org/downloads/demo-enrollment-en.pdf');
  });
});
