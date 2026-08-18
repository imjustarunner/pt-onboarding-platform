import { describe, expect, it } from 'vitest';
import {
  buildPublicSchoolPrintablePacketUrl,
  publicSchoolPrintablePacketApiPath
} from '../publicSchoolPrintablePacketUrl.js';

describe('publicSchoolPrintablePacketUrl', () => {
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

  it('joins a relative API base with origin', () => {
    expect(buildPublicSchoolPrintablePacketUrl('carver', 'en', {
      origin: 'https://app.itsco.health',
      apiBase: '/api'
    })).toBe('https://app.itsco.health/api/public/schools/carver/printable-packet?locale=en');
  });

  it('uses an absolute API host as-is', () => {
    expect(buildPublicSchoolPrintablePacketUrl(36, 'es', {
      origin: 'https://app.itsco.health',
      apiBase: 'http://localhost:3000/api'
    })).toBe('http://localhost:3000/api/public/schools/36/printable-packet?locale=es');
  });
});
