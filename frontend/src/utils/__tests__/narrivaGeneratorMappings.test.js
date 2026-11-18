import { describe, expect, it } from 'vitest';
import { resolveNarrivaToolForService } from '../narrivaGeneratorMappings.js';
describe('automatic Narriva writer choice', () => {
  const mappings = { '90837': 'psychotherapy', H2014: 'individual-skills', 'H2014:group': 'group-skills', H0031: null };
  it('uses the confirmed clinical service and group context', () => {
    expect(resolveNarrivaToolForService({ serviceCode: '90837' }, mappings)).toBe('psychotherapy');
    expect(resolveNarrivaToolForService({ serviceCode: 'h2014', programId: 2 }, mappings)).toBe('group-skills');
    expect(resolveNarrivaToolForService({ serviceCode: 'H2014' }, mappings)).toBe('individual-skills');
  });
  it('routes pro bono funding through the actual documented clinical service', () => {
    expect(resolveNarrivaToolForService({ serviceCode: 'PRO-BONO SERVICE', underlyingServiceCode: '90837' }, mappings)).toBe('psychotherapy');
  });
  it('does not guess a writer when a service is unlinked or explicitly disabled', () => {
    expect(resolveNarrivaToolForService({ serviceCode: 'UNMAPPED' }, mappings)).toBeNull();
    expect(resolveNarrivaToolForService({ serviceCode: 'H0031' }, mappings)).toBeNull();
  });
});
