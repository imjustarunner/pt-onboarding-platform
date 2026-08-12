import { describe, expect, it } from 'vitest';
import {
  formatFullNameCountdown,
  formatSchoolPortalClientLabel
} from '../schoolPortalClientLabel.js';

describe('formatSchoolPortalClientLabel', () => {
  const client = {
    initials: 'EllKie',
    identifier_code: '053717',
    full_name: 'Elliott Kieu'
  };

  it('shows codes by default', () => {
    expect(formatSchoolPortalClientLabel(client, 'codes')).toBe('053717');
  });

  it('shows initials', () => {
    expect(formatSchoolPortalClientLabel(client, 'initials')).toBe('EllKie');
  });

  it('shows full name when requested', () => {
    expect(formatSchoolPortalClientLabel(client, 'full_name')).toBe('Elliott Kieu');
  });

  it('falls back when full name is missing', () => {
    expect(formatSchoolPortalClientLabel({ initials: 'EK' }, 'full_name')).toBe('EK');
  });
});

describe('formatFullNameCountdown', () => {
  it('formats remaining time as m:ss', () => {
    expect(formatFullNameCountdown(10 * 60 * 1000)).toBe('10:00');
    expect(formatFullNameCountdown(61 * 1000)).toBe('1:01');
    expect(formatFullNameCountdown(0)).toBe('0:00');
  });
});
