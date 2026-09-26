import { describe, expect, it } from 'vitest';
import { resolveLoginPalette } from '../loginPalette';
describe('ITSCO login colors', () => {
  it('replaces only the generic orange palette with ITSCO green', () => {
    const legacy = { primary: '#0F172A', secondary: '#1E40AF', accent: '#F97316' };
    expect(resolveLoginPalette('itsco', legacy)).toMatchObject({ primary: '#086653', accent: '#46D6B5' });
    expect(resolveLoginPalette('tisi', legacy)).toEqual(legacy);
    const custom = { primary: '#234567', accent: '#abcdef' };
    expect(resolveLoginPalette('itsco', custom)).toEqual(custom);
  });
});
