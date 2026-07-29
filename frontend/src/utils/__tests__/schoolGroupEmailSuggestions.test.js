import { describe, expect, it } from 'vitest';
import {
  buildSchoolGroupEmail,
  parseSchoolGroupEmailLocal,
  resolveSchoolOnboardingSupportEmail,
  resolveSchoolOnboardingSupportPhone,
  suggestSchoolGroupEmailPrefixes,
  suggestSchoolGroupEmails
} from '../schoolGroupEmailSuggestions.js';

const DOMAIN = 'itsco.health';

describe('schoolGroupEmailSuggestions', () => {
  it('suggests rudy for Rudy Elementary School', () => {
    const prefixes = suggestSchoolGroupEmailPrefixes('Rudy Elementary School').map((s) => s.prefix);
    expect(prefixes[0]).toBe('rudy');
    expect(prefixes).toContain('re');
  });

  it('suggests cms for Cheyenne Mountain Middle School', () => {
    const prefixes = suggestSchoolGroupEmailPrefixes('Cheyenne Mountain Middle School').map((s) => s.prefix);
    expect(prefixes).toContain('cms');
  });

  it('suggests riverdale and rhs for Riverdale High School', () => {
    const prefixes = suggestSchoolGroupEmailPrefixes('Riverdale High School').map((s) => s.prefix);
    expect(prefixes).toContain('riverdale');
    expect(prefixes).toContain('rh');
    expect(prefixes).toContain('rhs');
  });

  it('builds full email addresses for suggestions', () => {
    const emails = suggestSchoolGroupEmails('Riverdale High School', DOMAIN).map((s) => s.email);
    expect(emails).toContain('riverdale@itsco.health');
    expect(emails).toContain('rhs@itsco.health');
  });

  it('parses local part from stored email', () => {
    expect(parseSchoolGroupEmailLocal('riverdale@itsco.health', DOMAIN)).toBe('riverdale');
    expect(buildSchoolGroupEmail('riverdale', DOMAIN)).toBe('riverdale@itsco.health');
  });

  it('resolves school onboarding support email from agency slug', () => {
    expect(resolveSchoolOnboardingSupportEmail({ slug: 'itsco' })).toBe('support@itsco.health');
  });

  it('resolves school onboarding support phone to local ITSCO line', () => {
    expect(resolveSchoolOnboardingSupportPhone({ slug: 'itsco', phone: '8334448726' }).display).toBe(
      '719-657-7444 Ext 0'
    );
    expect(resolveSchoolOnboardingSupportPhone({ slug: 'itsco' }).tel).toBe('+17196577444,0');
  });
});
