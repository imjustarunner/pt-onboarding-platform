import { describe, expect, it } from 'vitest';
import { buildPublicIntakeUrl, buildPublicIntakeShortUrl } from '../publicIntakeUrl.js';

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
